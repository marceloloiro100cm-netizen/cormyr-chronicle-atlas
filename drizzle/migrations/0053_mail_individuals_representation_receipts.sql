-- Lote 6: confirmação e destinatários individuais (UI), representação e recibos (DB).
-- Evita alterar ou recriar qualquer dado histórico.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='25000ms';

CREATE OR REPLACE FUNCTION public.save_letter_batch_drafts(p_kind text,p_number integer,p_subject text,p_content text,p_recipients text[],p_key uuid) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE r text;sent integer:=0;n integer;pid uuid;hid text; BEGIN IF NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Somente o Narrador prepara missivas'; END IF; IF p_kind NOT IN('geral','reservada') OR cardinality(p_recipients)=0 OR (p_kind='reservada' AND cardinality(p_recipients)<>1) THEN RAISE EXCEPTION 'Destinatários inválidos'; END IF; n:=coalesce(p_number,public.open_letter_round()+1,(SELECT coalesce(max(number),0)+1 FROM public.letter_rounds)); FOREACH r IN ARRAY p_recipients LOOP
 pid:=NULL;hid:=NULL;
 IF left(r,2)='h:' THEN
   SELECT id INTO hid FROM public.campaign_houses WHERE id=substring(r FROM 3) AND active AND season=2;
   IF hid IS NULL THEN RAISE EXCEPTION 'Casa inválida'; END IF;
 ELSIF left(r,2)='p:' THEN
   SELECT id INTO pid FROM public.campaign_players WHERE id::text=substring(r FROM 3)
      AND active AND NOT require_password_change AND user_id IS NOT NULL;
   IF pid IS NULL THEN RAISE EXCEPTION 'Jogador destinatário indisponível'; END IF;
 ELSE RAISE EXCEPTION 'Destinatário inválido'; END IF;
 INSERT INTO public.campaign_letters(id,sender_user_id,sender_name,recipient_player_id,recipient_house_id,subject,content,letter_number,letter_kind,batch_key,publication_state)
 VALUES(gen_random_uuid(),auth.uid(),'Mestre',pid,hid,p_subject,p_content,n,p_kind,p_key,'draft') ON CONFLICT(batch_key,coalesce(recipient_player_id::text,''),coalesce(recipient_house_id,'')) WHERE batch_key IS NOT NULL DO NOTHING; IF FOUND THEN sent:=sent+1; END IF; END LOOP; RETURN sent; END $$;

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
 END IF; IF NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=recipient AND role='admin') AND NOT EXISTS(SELECT 1 FROM campaign_players p WHERE p.user_id=recipient AND p.active AND NOT p.require_password_change AND public.can_read_letter_as(l,p.user_id)) THEN RAISE EXCEPTION 'Destinatário indisponível'; END IF; IF recipient=auth.uid() THEN RAISE EXCEPTION 'Selecione a mensagem recebida à qual deseja responder'; END IF; IF btrim(p_content)='' THEN RAISE EXCEPTION 'Escreva a resposta'; END IF; SELECT id INTO rid FROM public.letter_replies WHERE author_user_id=auth.uid() AND idempotency_key=p_key; IF FOUND THEN IF NOT EXISTS(SELECT 1 FROM letter_replies WHERE id=rid AND letter_id=p_letter AND reply_to_id=coalesce(p_reply,p_letter) AND content=p_content) THEN RAISE EXCEPTION 'Chave de envio já utilizada para outra resposta'; END IF; RETURN rid; END IF; delivery:=public.reply_delivery_week(recipient); IF delivery IS NULL AND NOT p_draft THEN RAISE EXCEPTION 'Semana de entrega indisponível'; END IF; n:=coalesce(n,(SELECT max(number) FROM public.letter_rounds),delivery); IF gm THEN pname:='Mestre'; ELSE SELECT name INTO pname FROM public.campaign_players WHERE id=public.my_player_id(); END IF; INSERT INTO public.letter_replies(letter_id,author_user_id,author_player_id,author_name,house_id,recipient_user_id,content,idempotency_key,conversation_id,reply_to_id,creation_week,delivery_week,publication_state) VALUES(l.id,auth.uid(),public.my_player_id(),coalesce(pname,'Jogador'),l.recipient_house_id,recipient,p_content,p_key,l.conversation_id,coalesce(p_reply,l.id),n,delivery,CASE WHEN p_draft THEN 'draft' ELSE 'scheduled' END) RETURNING id INTO rid; IF NOT gm AND NOT p_draft AND coalesce(current_setting('app.is_representation',true),'')<>'true' THEN INSERT INTO public.letter_receipts(letter_id,user_id) VALUES(l.id,auth.uid()) ON CONFLICT DO NOTHING; END IF; RETURN rid; END $function$
;

CREATE OR REPLACE FUNCTION public.reply_marks_letter_unread()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF coalesce(current_setting('app.is_representation',true),'')<>'true' AND NEW.publication_state = 'delivered' AND (TG_OP = 'INSERT' OR OLD.publication_state <> 'delivered') THEN
    DELETE FROM public.letter_receipts
    WHERE letter_id = NEW.letter_id AND user_id <> NEW.author_user_id;
  END IF;
  RETURN NEW;
END
$$;

CREATE OR REPLACE FUNCTION public.campaign_representation_action(p_action text,p_args jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE actor_id uuid:=auth.uid();p public.campaign_players;claims text:=current_setting('request.jwt.claims',true);representation_flag text:=current_setting('app.is_representation',true);result jsonb;rid uuid; BEGIN IF NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Acesso restrito ao Narrador'; END IF; SELECT player.* INTO p FROM public.campaign_representation_sessions s JOIN public.campaign_players player ON player.id=s.player_id WHERE s.actor=actor_id AND s.expires_at>now() AND player.active AND NOT player.require_password_change; IF NOT FOUND OR p.user_id IS NULL THEN RAISE EXCEPTION 'Representação expirada ou jogador inativo'; END IF; PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p.user_id,'role','authenticated')::text,true);
IF p_action='read' THEN result:=jsonb_build_object('player',to_jsonb(p),'houses',(SELECT coalesce(jsonb_agg(to_jsonb(h)),'[]') FROM public.campaign_houses h WHERE public.in_campaign_house(h.id)),'records',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM public.campaign_records r WHERE public.can_read_record(r)),'letters',(SELECT coalesce(jsonb_agg(to_jsonb(l)),'[]') FROM public.campaign_letters l WHERE public.can_read_letter(l)),'replies',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM public.letter_replies r WHERE public.can_read_reply(r)),'week',public.open_letter_round());
ELSIF p_action='save_record' THEN result:=public.save_campaign_record((p_args->>'id')::uuid,(p_args->>'version')::integer,p_args->>'title',p_args->>'content');
ELSIF p_action='send' THEN rid:=public.player_send_letter_to(p_args->>'subject',p_args->>'content',nullif(p_args->>'house',''),(p_args->>'key')::uuid); UPDATE public.campaign_letters SET administrative_actor=actor_id WHERE id=rid; result:=jsonb_build_object('id',rid);
ELSIF p_action='reply' THEN
 PERFORM set_config('app.is_representation','true',true);
 rid:=public.reply_weekly_message((p_args->>'letter')::uuid,nullif(p_args->>'reply','')::uuid,p_args->>'content',(p_args->>'key')::uuid,coalesce((p_args->>'draft')::boolean,false));
 UPDATE public.letter_replies SET administrative_actor=actor_id WHERE id=rid AND author_user_id=p.user_id;
 PERFORM set_config('app.is_representation',coalesce(representation_flag,''),true);
 result:=jsonb_build_object('id',rid,'draft',coalesce((p_args->>'draft')::boolean,false));
ELSIF p_action='draft' THEN rid:=public.save_letter_draft((p_args->>'key')::uuid,nullif(p_args->>'house',''),p_args->>'subject',p_args->>'content',public.open_letter_round()); UPDATE public.campaign_letters SET administrative_actor=actor_id WHERE id=rid; result:=jsonb_build_object('id',rid);
ELSIF p_action='delete' THEN PERFORM public.delete_campaign_letter((p_args->>'id')::uuid); result:='{}';
ELSE RAISE EXCEPTION 'Action non autorisée'; END IF;
PERFORM set_config('request.jwt.claims',coalesce(claims,''),true); IF p_action<>'read' THEN INSERT INTO public.campaign_admin_audit(actor,target_player,action,details) VALUES(actor_id,p.id,'representation_'||p_action,jsonb_build_object('entity',coalesce(p_args->>'id',p_args->>'letter',result->>'id'))); END IF; RETURN result; END $$;

-- Versions remain auditor-visible even after their parent reply is soft-deleted.
-- The helper is SECURITY DEFINER so RLS on letter_replies cannot hide the
-- historical snapshot row from the very audit policy that authorizes it.
CREATE OR REPLACE FUNCTION public.can_read_reply_version(p_reply uuid,p_viewer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS (
  SELECT 1 FROM letter_replies r JOIN campaign_letters l ON l.id=r.letter_id
  WHERE r.id=p_reply AND l.deleted_at IS NULL AND public.can_read_letter_as(l,p_viewer)
   AND (r.author_user_id=p_viewer OR
     (r.publication_state<>'draft' AND EXISTS (
       SELECT 1 FROM user_roles u WHERE u.user_id=p_viewer AND u.role='admin')))
 );
$$;
REVOKE ALL ON FUNCTION public.can_read_reply_version(uuid,uuid) FROM PUBLIC,anon,authenticated;
DROP POLICY IF EXISTS reply_versions_read ON public.letter_reply_versions;
CREATE POLICY reply_versions_read ON public.letter_reply_versions
 FOR SELECT TO authenticated USING(public.can_read_reply_version(reply_id,auth.uid()));

COMMIT;
