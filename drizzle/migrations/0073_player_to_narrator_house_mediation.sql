-- House-to-house correspondence is automatically accessible to the Narrator.
-- Direct player-to-Narrator is a single root message; individual player addresses stay forbidden.
BEGIN;
CREATE OR REPLACE FUNCTION public.require_house_mail_recipient()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $house_guard$
BEGIN
 IF NEW.recipient_player_id IS NOT NULL THEN
  RAISE EXCEPTION 'Destinatario individual desativado: selecione uma Casa ou o Narrador' USING ERRCODE='23514';
 END IF;
 IF NEW.recipient_house_id IS NULL AND NOT (
  NEW.sender_player_id IS NOT NULL AND EXISTS(
   SELECT 1 FROM public.campaign_players p WHERE p.id=NEW.sender_player_id
    AND p.user_id=NEW.sender_user_id AND p.active
  )
 ) THEN
  RAISE EXCEPTION 'Destinatario invalido: Narrador somente para missivas de jogadores' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $house_guard$;
CREATE OR REPLACE FUNCTION public.send_linked_mail(p_key uuid, p_origin text, p_targets text[], p_subject text, p_content text, p_court text DEFAULT NULL::text, p_unit text DEFAULT NULL::text, p_role text DEFAULT NULL::text, p_draft boolean DEFAULT false, p_week integer DEFAULT NULL::integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE targets text[]; request_doc jsonb; prior mail_submissions; sheet_version integer; target text; pid uuid; hid text; lid uuid; n integer; delivery integer; pname text; ids jsonb;
BEGIN
 IF NOT public.campaign_access_active() THEN RAISE EXCEPTION 'Jogador não autorizado'; END IF;
 IF p_key IS NULL THEN RAISE EXCEPTION 'Chave de envio obrigatória'; END IF;
 SELECT array_agg(DISTINCT t ORDER BY t) INTO targets FROM unnest(p_targets) t;
 IF EXISTS(SELECT 1 FROM unnest(targets) AS recipient(value) WHERE value LIKE 'p:%')
 THEN RAISE EXCEPTION 'Envio individual desativado: selecione uma Casa ou o Narrador'; END IF;
 IF 'narrator'=ANY(targets) AND (public.is_campaign_admin() OR cardinality(targets)<>1)
 THEN RAISE EXCEPTION 'O Narrador deve ser o unico destinatario e so pode receber missivas de jogadores'; END IF;
 IF coalesce(cardinality(targets),0)=0 OR cardinality(targets)>50 OR array_position(targets,NULL) IS NOT NULL THEN RAISE EXCEPTION 'Escolha entre 1 e 50 destinatários'; END IF;
 IF btrim(coalesce(p_subject,''))='' OR btrim(coalesce(p_content,''))='' THEN RAISE EXCEPTION 'Preencha assunto e conteúdo'; END IF;
 request_doc:=jsonb_build_object('origin',p_origin,'targets',targets,'subject',p_subject,'content',p_content,'court',p_court,'unit',p_unit,'role',p_role,'draft',p_draft,'week',p_week);
 PERFORM pg_advisory_xact_lock(184522);
 SELECT * INTO prior FROM mail_submissions WHERE id=p_key;
 IF FOUND THEN
 IF prior.author_user_id<>auth.uid() OR prior.request<>request_doc THEN RAISE EXCEPTION 'Chave de envio já usada; revise a operação'; END IF;
 SELECT jsonb_agg(id ORDER BY id) INTO ids FROM campaign_letters WHERE batch_key=p_key AND sender_user_id=auth.uid();
 RETURN jsonb_build_object('ids',ids,'duplicate',true);
 END IF;
 sheet_version:=public.validate_mail_links(p_origin,p_court,p_unit,p_role);
 n:=public.open_letter_round();
 IF NOT p_draft AND NOT public.is_campaign_admin() AND n IS NULL THEN RAISE EXCEPTION 'Missivas fechadas; salve um rascunho'; END IF;
 delivery:=CASE WHEN public.is_campaign_admin() THEN coalesce(p_week,n+1,(SELECT coalesce(max(number),0)+1 FROM letter_rounds)) ELSE n END;
 IF NOT p_draft AND (delivery IS NULL OR delivery<1 OR EXISTS(SELECT 1 FROM letter_rounds WHERE number=delivery AND status='closed')) THEN RAISE EXCEPTION 'Semana inválida'; END IF;
 pname:=CASE WHEN public.is_campaign_admin() THEN 'Mestre' ELSE (SELECT name FROM campaign_players WHERE id=public.my_player_id()) END;
 INSERT INTO mail_submissions(id,author_user_id,request) VALUES(p_key,auth.uid(),request_doc);
 FOREACH target IN ARRAY targets LOOP
 pid:=NULL; hid:=NULL;
 IF target='narrator' THEN
 IF public.is_campaign_admin() THEN RAISE EXCEPTION 'Selecione um jogador ou casa'; END IF;
 ELSIF left(target,2)='p:' THEN
 SELECT id INTO pid FROM campaign_players WHERE id::text=substring(target FROM 3) AND active AND NOT require_password_change AND user_id IS NOT NULL AND user_id<>auth.uid();
 IF pid IS NULL THEN RAISE EXCEPTION 'Jogador destinatário indisponível'; END IF;
 ELSIF left(target,2)='h:' THEN
 SELECT id INTO hid FROM campaign_houses WHERE id=substring(target FROM 3) AND active AND season=2;
 IF hid IS NULL OR (NOT public.is_campaign_admin() AND public.in_campaign_house(hid)) THEN RAISE EXCEPTION 'Casa destinatária inválida'; END IF;
 ELSE RAISE EXCEPTION 'Destinatário inválido'; END IF;
 lid:=gen_random_uuid();
 INSERT INTO campaign_letters(id,sender_user_id,sender_player_id,sender_name,recipient_player_id,recipient_house_id,subject,content,letter_kind,letter_number,batch_key,conversation_id,publication_state,origin_house_id,court_member_id,military_unit_id,court_assignment,house_sheet_version)
 VALUES(lid,auth.uid(),CASE WHEN public.is_campaign_admin() THEN NULL ELSE public.my_player_id() END,pname,pid,hid,p_subject,p_content,CASE WHEN cardinality(targets)>1 THEN 'geral' ELSE 'reservada' END,delivery,p_key,lid,CASE WHEN p_draft THEN 'draft' ELSE 'scheduled' END,p_origin,p_court,p_unit,p_role,sheet_version);
 END LOOP;
 SELECT jsonb_agg(id ORDER BY id) INTO ids FROM campaign_letters WHERE batch_key=p_key AND sender_user_id=auth.uid();
 RETURN jsonb_build_object('ids',ids,'duplicate',false,'week',delivery,'state',CASE WHEN p_draft THEN 'draft' WHEN delivery=n THEN 'delivered' ELSE 'scheduled' END);
END $function$

COMMIT;
