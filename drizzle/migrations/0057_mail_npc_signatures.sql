-- Item 39: narrator-only diegetic author labels for letters and replies.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.dated_mail_action(p_action text,p_args jsonb,p_date text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb; previous text:=current_setting('cormyr.mail_date',true);
 previous_sign text:=current_setting('cormyr.mail_signature',true);
 existing_date text; signer text;
BEGIN
 IF NOT public.campaign_access_active() THEN RAISE EXCEPTION 'Jogador não autorizado'; END IF;
 IF NOT public.valid_campaign_date(p_date) THEN RAISE EXCEPTION 'Selecione uma data válida de Harptos'; END IF;
 PERFORM pg_advisory_xact_lock(184522);
 IF p_action='send_linked_mail' THEN
 IF EXISTS(SELECT 1 FROM campaign_letters WHERE batch_key=(p_args->>'p_key')::uuid AND sender_user_id=auth.uid() AND campaign_date IS DISTINCT FROM p_date) THEN RAISE EXCEPTION 'Chave já utilizada com outra data'; END IF;
 ELSIF p_action='reply_weekly_message' THEN
 IF EXISTS(SELECT 1 FROM letter_replies WHERE idempotency_key=(p_args->>'p_key')::uuid AND author_user_id=auth.uid() AND campaign_date IS DISTINCT FROM p_date) THEN RAISE EXCEPTION 'Chave já utilizada com outra data'; END IF;
 END IF;
 signer:=nullif(btrim(coalesce(p_args->>'p_signed_by','')),'');
 IF signer IS NOT NULL AND NOT public.is_campaign_admin() THEN
  RAISE EXCEPTION 'Somente o Narrador escolhe o remetente diegético';
 END IF;
 IF length(coalesce(signer,''))>120 THEN RAISE EXCEPTION 'Assinatura longa demais (máximo 120 caracteres)'; END IF;
 PERFORM set_config('cormyr.mail_signature',coalesce(signer,''),true);
 PERFORM set_config('cormyr.mail_date',p_date,true);
 CASE p_action
 WHEN 'send_linked_mail' THEN result:=public.send_linked_mail((p_args->>'p_key')::uuid,p_args->>'p_origin',ARRAY(SELECT jsonb_array_elements_text(p_args->'p_targets')),p_args->>'p_subject',p_args->>'p_content',p_args->>'p_court',p_args->>'p_unit',p_args->>'p_role',coalesce((p_args->>'p_draft')::boolean,false),(p_args->>'p_week')::integer);
 WHEN 'reply_weekly_message' THEN result:=to_jsonb(public.reply_weekly_message((p_args->>'p_letter')::uuid,(p_args->>'p_reply')::uuid,p_args->>'p_content',(p_args->>'p_key')::uuid,coalesce((p_args->>'p_draft')::boolean,false)));
 WHEN 'save_weekly_reply_draft' THEN result:=to_jsonb(public.save_weekly_reply_draft((p_args->>'p_id')::uuid,(p_args->>'p_letter')::uuid,(p_args->>'p_reply')::uuid,p_args->>'p_content'));
 WHEN 'edit_linked_mail_draft' THEN result:=public.edit_linked_mail_draft((p_args->>'p_id')::uuid,(p_args->>'p_version')::integer,p_args->>'p_subject',p_args->>'p_content',p_args->>'p_origin',p_args->>'p_court',p_args->>'p_unit',p_args->>'p_role');
 WHEN 'edit_campaign_letter' THEN result:=public.edit_campaign_letter((p_args->>'p_id')::uuid,(p_args->>'p_version')::integer,p_args->>'p_subject',p_args->>'p_content');
 WHEN 'representation' THEN result:=public.campaign_representation_action(p_args->>'p_action',p_args->'p_args');
 ELSE RAISE EXCEPTION 'Operação de missiva inválida';
 END CASE;
 PERFORM set_config('cormyr.mail_signature',coalesce(previous_sign,''),true);
 PERFORM set_config('cormyr.mail_date',coalesce(previous,''),true);
 RETURN result;
END $$;
CREATE OR REPLACE FUNCTION public.send_linked_mail(p_key uuid,p_origin text,p_targets text[],p_subject text,p_content text,p_court text DEFAULT NULL,p_unit text DEFAULT NULL,p_role text DEFAULT NULL,p_draft boolean DEFAULT false,p_week integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE targets text[]; request_doc jsonb; prior mail_submissions; sheet_version integer; target text; pid uuid; hid text; lid uuid; n integer; delivery integer; pname text; ids jsonb;
BEGIN
 IF NOT public.campaign_access_active() THEN RAISE EXCEPTION 'Jogador não autorizado'; END IF;
 IF p_key IS NULL THEN RAISE EXCEPTION 'Chave de envio obrigatória'; END IF;
 SELECT array_agg(DISTINCT t ORDER BY t) INTO targets FROM unnest(p_targets) t;
 IF coalesce(cardinality(targets),0)=0 OR cardinality(targets)>50 OR array_position(targets,NULL) IS NOT NULL THEN RAISE EXCEPTION 'Escolha entre 1 e 50 destinatários'; END IF;
 IF btrim(coalesce(p_subject,''))='' OR btrim(coalesce(p_content,''))='' THEN RAISE EXCEPTION 'Preencha assunto e conteúdo'; END IF;
 request_doc:=jsonb_build_object('origin',p_origin,'targets',targets,'subject',p_subject,'content',p_content,'court',p_court,'unit',p_unit,'role',p_role,'draft',p_draft,'week',p_week,
 'signed_by',CASE WHEN public.is_campaign_admin() THEN nullif(btrim(current_setting('cormyr.mail_signature',true)),'') ELSE NULL END);
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
 pname:=CASE WHEN public.is_campaign_admin()
 THEN coalesce(nullif(btrim(current_setting('cormyr.mail_signature',true)),''),'Mestre')
 ELSE (SELECT name FROM campaign_players WHERE id=public.my_player_id()) END;
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
END $$;
CREATE OR REPLACE FUNCTION public.reply_weekly_message(p_letter uuid, p_reply uuid, p_content text, p_key uuid, p_draft boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE l public.campaign_letters; prior public.letter_replies; rid uuid; n integer; delivery integer; recipient uuid; pname text; gm boolean:=public.is_campaign_admin(); BEGIN PERFORM pg_advisory_xact_lock(184522); SELECT * INTO l FROM public.campaign_letters WHERE id=p_letter FOR UPDATE; IF NOT FOUND OR l.deleted_at IS NOT NULL OR l.publication_state<>'delivered' OR NOT public.can_read_letter(l) THEN RAISE EXCEPTION 'Missiva indisponível'; END IF; n:=public.open_letter_round(); IF NOT gm AND public.my_player_id() IS NULL THEN RAISE EXCEPTION 'Jogador não autorizado'; END IF; IF NOT gm AND n IS NULL AND NOT p_draft THEN RAISE EXCEPTION 'Missivas fechadas, aguarde o narrador abrir a próxima semana'; END IF; IF p_reply IS NOT NULL THEN SELECT * INTO prior FROM public.letter_replies WHERE id=p_reply AND letter_id=p_letter; IF NOT FOUND OR prior.publication_state<>'delivered' OR NOT public.can_read_reply(prior) THEN RAISE EXCEPTION 'Resposta indisponível'; END IF; recipient:=prior.author_user_id;
 ELSE
  IF gm AND l.sender_user_id=auth.uid() THEN
    IF l.recipient_player_id IS NOT NULL THEN
      SELECT p.user_id INTO recipient FROM public.campaign_players p
      WHERE p.id=l.recipient_player_id AND p.active AND NOT p.require_password_change AND p.user_id IS NOT NULL;
    ELSIF l.recipient_house_id IS NOT NULL THEN
      SELECT p.user_id INTO recipient FROM public.campaign_players p
        JOIN public.house_memberships hm ON hm.player_id=p.id
      WHERE hm.house_id=l.recipient_house_id AND p.active AND NOT p.require_password_change
        AND p.user_id IS NOT NULL AND p.user_id<>auth.uid()
      ORDER BY p.id LIMIT 1;
    END IF;
    IF recipient IS NULL THEN RAISE EXCEPTION 'A missiva não possui jogador destinatário ativo para receber complemento'; END IF;
  ELSE recipient:=l.sender_user_id; END IF;
 END IF; IF NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=recipient AND role='admin') AND NOT EXISTS(SELECT 1 FROM campaign_players p WHERE p.user_id=recipient AND p.active AND NOT p.require_password_change AND public.can_read_letter_as(l,p.user_id)) THEN RAISE EXCEPTION 'Destinatário indisponível'; END IF; IF recipient=auth.uid() THEN RAISE EXCEPTION 'Selecione a mensagem recebida à qual deseja responder'; END IF; IF btrim(p_content)='' THEN RAISE EXCEPTION 'Escreva a resposta'; END IF; SELECT id INTO rid FROM public.letter_replies WHERE author_user_id=auth.uid() AND idempotency_key=p_key; IF FOUND THEN IF NOT EXISTS(SELECT 1 FROM letter_replies WHERE id=rid AND letter_id=p_letter AND reply_to_id=coalesce(p_reply,p_letter) AND content=p_content) THEN RAISE EXCEPTION 'Chave de envio já utilizada para outra resposta'; END IF; RETURN rid; END IF; delivery:=public.reply_delivery_week(recipient); IF delivery IS NULL AND NOT p_draft THEN RAISE EXCEPTION 'Semana de entrega indisponível'; END IF; n:=coalesce(n,(SELECT max(number) FROM public.letter_rounds),delivery); IF gm THEN pname:=coalesce(nullif(btrim(current_setting('cormyr.mail_signature',true)),''),'Mestre'); ELSE SELECT name INTO pname FROM public.campaign_players WHERE id=public.my_player_id(); END IF; INSERT INTO public.letter_replies(letter_id,author_user_id,author_player_id,author_name,house_id,recipient_user_id,content,idempotency_key,conversation_id,reply_to_id,creation_week,delivery_week,publication_state) VALUES(l.id,auth.uid(),public.my_player_id(),coalesce(pname,'Jogador'),CASE WHEN l.recipient_player_id IS NULL AND recipient<>l.sender_user_id
 AND EXISTS(SELECT 1 FROM public.campaign_players cp JOIN public.house_memberships hm ON hm.player_id=cp.id
    WHERE cp.user_id=recipient AND hm.house_id=l.recipient_house_id AND cp.active)
 THEN l.recipient_house_id ELSE NULL END,recipient,p_content,p_key,l.conversation_id,coalesce(p_reply,l.id),n,delivery,CASE WHEN p_draft THEN 'draft' ELSE 'scheduled' END) RETURNING id INTO rid; IF NOT gm AND NOT p_draft AND coalesce(current_setting('app.is_representation',true),'')<>'true' THEN INSERT INTO public.letter_receipts(letter_id,user_id) VALUES(l.id,auth.uid()) ON CONFLICT DO NOTHING; END IF; RETURN rid; END $function$
;
COMMIT;
