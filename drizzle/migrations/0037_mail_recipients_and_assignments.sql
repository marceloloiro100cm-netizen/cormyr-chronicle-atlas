-- Multiple private deliveries and optional structured house references.
ALTER TABLE public.campaign_letters
 ADD COLUMN origin_house_id text REFERENCES public.campaign_houses(id),
 ADD COLUMN court_member_id text,
 ADD COLUMN court_assignment text CHECK(court_assignment IN ('executor','order_recipient')),
 ADD COLUMN military_unit_id text,
 ADD COLUMN house_sheet_version integer;
ALTER TABLE public.campaign_letters ADD CONSTRAINT mail_assignment_requires_member CHECK(court_assignment IS NULL OR court_member_id IS NOT NULL);
CREATE INDEX mail_origin_court ON public.campaign_letters(origin_house_id,court_member_id) WHERE deleted_at IS NULL;
CREATE INDEX mail_origin_unit ON public.campaign_letters(origin_house_id,military_unit_id) WHERE deleted_at IS NULL;
CREATE INDEX mail_delivery_state ON public.campaign_letters(publication_state,delivery_week,created_at DESC);
CREATE INDEX mail_reply_week ON public.letter_replies(letter_id,publication_state,delivery_week);
CREATE TABLE public.mail_submissions(id uuid PRIMARY KEY,author_user_id uuid NOT NULL,request jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE public.mail_submissions ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.mail_submissions TO service_role;

CREATE FUNCTION public.mail_compose_options() RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE directory jsonb; houses jsonb;
BEGIN
 IF NOT public.campaign_access_active() THEN RAISE EXCEPTION 'Jogador não autorizado'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'houses',(SELECT coalesce(jsonb_agg(m.house_id),'[]'::jsonb) FROM house_memberships m WHERE m.player_id=p.id)) ORDER BY p.name),'[]'::jsonb) INTO directory
 FROM campaign_players p WHERE p.active AND NOT p.require_password_change AND p.user_id IS NOT NULL;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',h.id,'name',h.name,'version',s.version,
 'court',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',c->>'id','name',coalesce(r.title,nullif(c->>'name',''),'Integrante sem identificação'),'role',c->>'role')),'[]'::jsonb)
 FROM jsonb_array_elements(coalesce(s.state->'court','[]'::jsonb)) c
 LEFT JOIN campaign_records r ON r.id::text=c->>'npcId' AND r.house_id=h.id AND r.kind='character' AND public.can_read_record(r)
 WHERE c->>'id' IS NOT NULL AND (nullif(c->>'npcId','') IS NULL OR r.id IS NOT NULL)),
 'units',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',u->>'id','name',u->>'name','available',coalesce(u->>'destroyed','false')<>'true')),'[]'::jsonb) FROM jsonb_array_elements(coalesce(s.state->'units','[]'::jsonb)) u WHERE u->>'id' IS NOT NULL)
 ) ORDER BY h.name),'[]'::jsonb) INTO houses
 FROM campaign_houses h LEFT JOIN noble_house_sheets s ON s.house_id=h.id
 WHERE h.active AND h.season=2 AND (public.is_campaign_admin() OR public.in_campaign_house(h.id));
 RETURN jsonb_build_object('players',directory,'houses',houses);
END $$;

CREATE FUNCTION public.validate_mail_links(p_origin text,p_court text,p_unit text,p_role text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s noble_house_sheets; c jsonb;
BEGIN
 IF NOT public.campaign_access_active() THEN RAISE EXCEPTION 'Jogador não autorizado'; END IF;
 IF p_origin IS NULL THEN
 IF NOT public.is_campaign_admin() OR p_court IS NOT NULL OR p_unit IS NOT NULL THEN RAISE EXCEPTION 'Selecione a casa remetente autorizada'; END IF;
 RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM campaign_houses WHERE id=p_origin AND active AND season=2) OR NOT (public.is_campaign_admin() OR public.in_campaign_house(p_origin)) THEN RAISE EXCEPTION 'Casa remetente não autorizada'; END IF;
 -- Serialize with house edits so a selected member/unit is current at send time.
 PERFORM pg_advisory_xact_lock(hashtextextended('noble:'||p_origin,0));
 SELECT * INTO s FROM noble_house_sheets WHERE house_id=p_origin;
 IF p_court IS NOT NULL THEN
 SELECT value INTO c FROM jsonb_array_elements(coalesce(s.state->'court','[]')) WHERE value->>'id'=p_court;
 IF c IS NULL OR (nullif(c->>'npcId','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM campaign_records r WHERE r.id::text=c->>'npcId' AND r.house_id=p_origin AND r.kind='character' AND public.can_read_record(r))) THEN RAISE EXCEPTION 'Membro da corte indisponível; atualize a ficha'; END IF;
 IF p_role IS NULL OR p_role NOT IN ('executor','order_recipient') THEN RAISE EXCEPTION 'Responsabilidade inválida'; END IF;
 ELSIF p_role IS NOT NULL THEN RAISE EXCEPTION 'Selecione um membro para atribuir responsabilidade'; END IF;
 IF p_unit IS NOT NULL AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(s.state->'units','[]')) u WHERE u->>'id'=p_unit AND coalesce(u->>'destroyed','false')<>'true') THEN RAISE EXCEPTION 'Unidade militar indisponível; atualize a ficha'; END IF;
 RETURN s.version;
END $$;
REVOKE ALL ON FUNCTION public.validate_mail_links(text,text,text,text) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.send_linked_mail(p_key uuid,p_origin text,p_targets text[],p_subject text,p_content text,p_court text DEFAULT NULL,p_unit text DEFAULT NULL,p_role text DEFAULT NULL,p_draft boolean DEFAULT false,p_week integer DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE targets text[]; request_doc jsonb; prior mail_submissions; sheet_version integer; target text; pid uuid; hid text; lid uuid; n integer; delivery integer; pname text; ids jsonb;
BEGIN
 IF NOT public.campaign_access_active() THEN RAISE EXCEPTION 'Jogador não autorizado'; END IF;
 IF p_key IS NULL THEN RAISE EXCEPTION 'Chave de envio obrigatória'; END IF;
 SELECT array_agg(DISTINCT t ORDER BY t) INTO targets FROM unnest(p_targets) t;
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
END $$;
REVOKE ALL ON FUNCTION public.mail_compose_options(),public.send_linked_mail(uuid,text,text[],text,text,text,text,text,boolean,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mail_compose_options(),public.send_linked_mail(uuid,text,text[],text,text,text,text,text,boolean,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.schedule_letter_draft(p_id uuid,p_week integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l campaign_letters; n integer; target integer;
BEGIN
 PERFORM pg_advisory_xact_lock(184522);
 IF NOT public.campaign_access_active() THEN RAISE EXCEPTION 'Jogador não autorizado'; END IF;
 SELECT * INTO l FROM campaign_letters WHERE id=p_id AND sender_user_id=auth.uid() AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR l.publication_state<>'draft' THEN RAISE EXCEPTION 'Rascunho indisponível'; END IF;
 IF l.origin_house_id IS NOT NULL THEN
 PERFORM public.validate_mail_links(l.origin_house_id,l.court_member_id,l.military_unit_id,l.court_assignment);
 END IF;
 n:=public.open_letter_round();
 IF NOT public.is_campaign_admin() THEN
 IF n IS NULL THEN RAISE EXCEPTION 'Missivas fechadas, aguarde o narrador abrir a próxima semana'; END IF;
 IF NOT EXISTS(SELECT 1 FROM house_memberships WHERE player_id=public.my_player_id()) THEN RAISE EXCEPTION 'Nenhuma casa autorizada'; END IF;
 IF public.in_campaign_house(l.recipient_house_id) THEN RAISE EXCEPTION 'Destinatário inválido'; END IF;
 END IF;
 IF l.recipient_house_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM campaign_houses WHERE id=l.recipient_house_id AND active AND season=2) THEN RAISE EXCEPTION 'Casa destinatária inválida'; END IF;
 IF l.recipient_player_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM campaign_players WHERE id=l.recipient_player_id AND active AND NOT require_password_change AND user_id IS NOT NULL AND user_id<>auth.uid()) THEN RAISE EXCEPTION 'Jogador destinatário inválido'; END IF;
 target:=CASE WHEN public.is_campaign_admin() THEN p_week ELSE n END;
 IF target IS NULL OR target<1 OR EXISTS(SELECT 1 FROM letter_rounds WHERE number=target AND status='closed') THEN RAISE EXCEPTION 'Semana de entrega inválida'; END IF;
 IF btrim(coalesce(l.subject,''))='' OR btrim(coalesce(l.content,''))='' THEN RAISE EXCEPTION 'Preencha o rascunho antes de enviar'; END IF;
 UPDATE campaign_letters SET delivery_week=target,letter_number=target,creation_week=coalesce(n,target),publication_state=CASE WHEN target=n THEN 'delivered' ELSE 'scheduled' END,delivered_at=CASE WHEN target=n THEN now() END WHERE id=p_id;
 INSERT INTO sync_outbox(entity_type,entity_id,version,payload) SELECT 'letter',id,version,to_jsonb(t) FROM campaign_letters t WHERE id=p_id ON CONFLICT DO NOTHING;
 UPDATE sync_outbox SET state='pending',next_attempt_at=now() WHERE entity_id=p_id;
END $$;

CREATE FUNCTION public.edit_linked_mail_draft(p_id uuid,p_version integer,p_subject text,p_content text,p_origin text,p_court text,p_unit text,p_role text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l campaign_letters; sv integer;
BEGIN
 PERFORM pg_advisory_xact_lock(184522);
 SELECT * INTO l FROM campaign_letters WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT public.campaign_access_active() OR l.sender_user_id<>auth.uid() OR l.deleted_at IS NOT NULL OR l.publication_state<>'draft' THEN RAISE EXCEPTION 'Rascunho indisponível'; END IF;
 IF l.version<>p_version THEN RAISE EXCEPTION 'A missiva mudou; atualize antes de salvar'; END IF;
 IF btrim(coalesce(p_subject,''))='' OR btrim(coalesce(p_content,''))='' THEN RAISE EXCEPTION 'Preencha assunto e conteúdo'; END IF;
 sv:=public.validate_mail_links(p_origin,p_court,p_unit,p_role);
 UPDATE campaign_letters SET subject=p_subject,content=p_content,origin_house_id=p_origin,court_member_id=p_court,military_unit_id=p_unit,court_assignment=p_role,house_sheet_version=sv,version=version+1,updated_at=now(),sync_state='pending' WHERE id=p_id RETURNING * INTO l;
 RETURN to_jsonb(l);
END $$;
REVOKE ALL ON FUNCTION public.edit_linked_mail_draft(uuid,integer,text,text,text,text,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.edit_linked_mail_draft(uuid,integer,text,text,text,text,text,text) TO authenticated;

ALTER POLICY receipts_read ON public.letter_receipts USING(public.is_campaign_admin() OR (public.campaign_access_active() AND
 (user_id=auth.uid() OR EXISTS(SELECT 1 FROM campaign_letters l WHERE l.id=letter_id AND l.sender_user_id=auth.uid() AND public.can_read_letter(l)))));


CREATE FUNCTION public.mail_recipient_read(p_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM campaign_letters l JOIN letter_receipts rr ON rr.letter_id=l.id
 WHERE l.id=p_id AND public.campaign_access_active() AND (l.sender_user_id=auth.uid() OR public.is_campaign_admin()) AND public.can_read_letter(l)
 AND rr.user_id<>l.sender_user_id AND (
 (l.recipient_player_id IS NOT NULL AND EXISTS(SELECT 1 FROM campaign_players cp WHERE cp.id=l.recipient_player_id AND cp.user_id=rr.user_id))
 OR (l.recipient_house_id IS NOT NULL AND EXISTS(SELECT 1 FROM campaign_players cp JOIN house_memberships hm ON hm.player_id=cp.id WHERE cp.user_id=rr.user_id AND hm.house_id=l.recipient_house_id))
 OR (l.recipient_player_id IS NULL AND l.recipient_house_id IS NULL AND EXISTS(SELECT 1 FROM user_roles ur WHERE ur.user_id=rr.user_id AND ur.role='admin'))));
$$;
REVOKE ALL ON FUNCTION public.mail_recipient_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mail_recipient_read(uuid) TO authenticated;
CREATE FUNCTION public.mail_page(p_filters jsonb DEFAULT '{}'::jsonb,p_page integer DEFAULT 0,p_size integer DEFAULT 20)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.campaign_access_active() THEN RAISE EXCEPTION 'Jogador não autorizado'; END IF;
 IF p_page IS NULL OR p_size IS NULL OR p_page<0 OR p_size<1 OR p_size>50 THEN RAISE EXCEPTION 'Página inválida'; END IF;
 WITH visible AS (
 SELECT l.* FROM campaign_letters l
 WHERE CASE WHEN p_filters->>'box'='excluidas' THEN l.deleted_at IS NOT NULL ELSE l.deleted_at IS NULL END
 AND (coalesce(p_filters->>'box','') NOT IN ('recebidas','enviadas') OR (p_filters->>'box'='recebidas' AND l.sender_user_id<>auth.uid()) OR (p_filters->>'box'='enviadas' AND l.sender_user_id=auth.uid()))
 AND (coalesce(p_filters->>'box','') NOT IN ('rascunhos','programadas','historico') OR
 l.publication_state=CASE p_filters->>'box' WHEN 'rascunhos' THEN 'draft' WHEN 'programadas' THEN 'scheduled' ELSE 'delivered' END
 OR EXISTS(SELECT 1 FROM letter_replies r WHERE r.letter_id=l.id AND r.publication_state=CASE p_filters->>'box' WHEN 'rascunhos' THEN 'draft' WHEN 'programadas' THEN 'scheduled' ELSE 'delivered' END))
 AND (coalesce(p_filters->>'number','')='' OR l.delivery_week::text=p_filters->>'number' OR EXISTS(SELECT 1 FROM letter_replies r WHERE r.letter_id=l.id AND r.publication_state='delivered' AND r.delivery_week::text=p_filters->>'number'))
 AND (coalesce(p_filters->>'kind','')='' OR l.letter_kind=p_filters->>'kind')
 AND (coalesce(p_filters->>'origin','')='' OR (p_filters->>'origin'='none' AND l.origin_house_id IS NULL) OR l.origin_house_id=p_filters->>'origin')
 AND (coalesce(p_filters->>'house','')='' OR l.recipient_house_id=p_filters->>'house' OR (l.recipient_house_id IS NULL AND EXISTS(SELECT 1 FROM campaign_players p WHERE p.id=l.sender_player_id AND p.roster_house_id=p_filters->>'house')))
 AND (coalesce(p_filters->>'court','')='' OR (p_filters->>'court'='none' AND l.court_member_id IS NULL) OR l.origin_house_id||':'||l.court_member_id=p_filters->>'court')
 AND (coalesce(p_filters->>'unit','')='' OR (p_filters->>'unit'='none' AND l.military_unit_id IS NULL) OR l.origin_house_id||':'||l.military_unit_id=p_filters->>'unit')
 AND (coalesce(p_filters->>'answered','')='' OR (CASE WHEN EXISTS(SELECT 1 FROM letter_replies r WHERE r.letter_id=l.id AND r.publication_state='delivered' AND r.author_user_id<>l.sender_user_id) THEN 'yes' ELSE 'no' END)=p_filters->>'answered')
 AND (coalesce(p_filters->>'read','')='' OR (CASE WHEN EXISTS(SELECT 1 FROM letter_receipts rr WHERE rr.letter_id=l.id AND rr.user_id=auth.uid() AND NOT EXISTS(SELECT 1 FROM letter_replies r WHERE r.letter_id=l.id AND r.publication_state='delivered' AND r.author_user_id<>auth.uid() AND coalesce(r.delivered_at,r.created_at)>rr.read_at)) THEN 'yes' ELSE 'no' END)=p_filters->>'read')
 AND (coalesce(p_filters->>'text','')='' OR strpos(lower(l.subject||' '||l.content||' '||l.sender_name),lower(p_filters->>'text'))>0 OR EXISTS(SELECT 1 FROM letter_replies r WHERE r.letter_id=l.id AND strpos(lower(r.content),lower(p_filters->>'text'))>0))
 ), page_rows AS (SELECT * FROM visible ORDER BY created_at DESC,id DESC LIMIT p_size OFFSET p_page*p_size)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM visible),'letters',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('recipient_read',public.mail_recipient_read(p.id)) ORDER BY p.created_at DESC,p.id DESC) FROM page_rows p),'[]'::jsonb),
 'replies',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at,r.id) FROM letter_replies r WHERE r.letter_id IN (SELECT id FROM page_rows)),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.mail_page(jsonb,integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mail_page(jsonb,integer,integer) TO authenticated;

CREATE FUNCTION public.mail_insights() RETURNS jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM (
 SELECT l.origin_house_id,l.court_member_id,l.court_assignment,l.military_unit_id,
 count(DISTINCT coalesce(l.batch_key,l.id)) AS messages,count(*) AS deliveries,
 count(*) FILTER(WHERE l.publication_state='delivered') AS delivered,
 count(*) FILTER(WHERE l.publication_state='delivered' AND EXISTS(SELECT 1 FROM letter_replies r WHERE r.letter_id=l.id AND r.publication_state='delivered' AND r.author_user_id<>l.sender_user_id)) AS answered
 FROM campaign_letters l WHERE l.deleted_at IS NULL AND public.campaign_access_active()
 GROUP BY l.origin_house_id,l.court_member_id,l.court_assignment,l.military_unit_id
 ORDER BY l.origin_house_id,l.court_member_id,l.military_unit_id
 ) t;
$$;
REVOKE ALL ON FUNCTION public.mail_insights() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mail_insights() TO authenticated;
