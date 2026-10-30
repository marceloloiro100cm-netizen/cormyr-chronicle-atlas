-- Lote 1 (itens 01-03) — data da campanha e documentos existentes permanecem intocados.
-- As respostas diretas e os rascunhos continuam a consultar public.reply_delivery_week:
--   aberta N: Narrador->jogador chega N+1, jogador->Narrador chega N.
--   sem rodada aberta, Narrador->jogador chega max(rounds)+1 (nunca max+2).
-- creation_week é a rodada corrente ou a última rodada registrada, NÃO a de entrega.
-- O trigger não deve sobrescrever semanas explicitamente calculadas pela RPC.
-- CREATE OR REPLACE mantém permissões e SECURITY DEFINER previamente configurados.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='20000ms';
DO $check$
BEGIN
 IF to_regprocedure('public.reply_weekly_message(uuid,uuid,text,uuid,boolean)') IS NULL OR
    to_regprocedure('public.schedule_weekly_reply_draft(uuid)') IS NULL OR
    to_regprocedure('public.reply_current_week()') IS NULL OR
    to_regprocedure('public.reply_delivery_week(uuid)') IS NULL
 THEN RAISE EXCEPTION 'Required mail delivery functions missing'; END IF;
END $check$;

CREATE OR REPLACE FUNCTION public.reply_weekly_message(p_letter uuid, p_reply uuid, p_content text, p_key uuid, p_draft boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE l public.campaign_letters; prior public.letter_replies; rid uuid; n integer; delivery integer; recipient uuid; pname text; gm boolean:=public.is_campaign_admin(); BEGIN PERFORM pg_advisory_xact_lock(184522); SELECT * INTO l FROM public.campaign_letters WHERE id=p_letter FOR UPDATE; IF NOT FOUND OR l.deleted_at IS NOT NULL OR l.publication_state<>'delivered' OR NOT public.can_read_letter(l) THEN RAISE EXCEPTION 'Missiva indisponível'; END IF; n:=public.open_letter_round(); IF NOT gm AND public.my_player_id() IS NULL THEN RAISE EXCEPTION 'Jogador não autorizado'; END IF; IF NOT gm AND n IS NULL AND NOT p_draft THEN RAISE EXCEPTION 'Missivas fechadas, aguarde o narrador abrir a próxima semana'; END IF; IF p_reply IS NOT NULL THEN SELECT * INTO prior FROM public.letter_replies WHERE id=p_reply AND letter_id=p_letter; IF NOT FOUND OR prior.publication_state<>'delivered' OR NOT public.can_read_reply(prior) THEN RAISE EXCEPTION 'Resposta indisponível'; END IF; recipient:=prior.author_user_id; ELSE recipient:=l.sender_user_id; END IF; IF NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=recipient AND role='admin') AND NOT EXISTS(SELECT 1 FROM campaign_players p WHERE p.user_id=recipient AND p.active AND NOT p.require_password_change AND public.can_read_letter_as(l,p.user_id)) THEN RAISE EXCEPTION 'Destinatário indisponível'; END IF; IF recipient=auth.uid() THEN RAISE EXCEPTION 'Selecione a mensagem recebida à qual deseja responder'; END IF; IF btrim(p_content)='' THEN RAISE EXCEPTION 'Escreva a resposta'; END IF; SELECT id INTO rid FROM public.letter_replies WHERE author_user_id=auth.uid() AND idempotency_key=p_key; IF FOUND THEN IF NOT EXISTS(SELECT 1 FROM letter_replies WHERE id=rid AND letter_id=p_letter AND reply_to_id=coalesce(p_reply,p_letter) AND content=p_content) THEN RAISE EXCEPTION 'Chave de envio já utilizada para outra resposta'; END IF; RETURN rid; END IF; delivery:=public.reply_delivery_week(recipient); IF delivery IS NULL AND NOT p_draft THEN RAISE EXCEPTION 'Semana de entrega indisponível'; END IF; n:=coalesce(n,(SELECT max(number) FROM public.letter_rounds),delivery); IF gm THEN pname:='Mestre'; ELSE SELECT name INTO pname FROM public.campaign_players WHERE id=public.my_player_id(); END IF; INSERT INTO public.letter_replies(letter_id,author_user_id,author_player_id,author_name,house_id,recipient_user_id,content,idempotency_key,conversation_id,reply_to_id,creation_week,delivery_week,publication_state) VALUES(l.id,auth.uid(),public.my_player_id(),coalesce(pname,'Jogador'),l.recipient_house_id,recipient,p_content,p_key,l.conversation_id,coalesce(p_reply,l.id),n,delivery,CASE WHEN p_draft THEN 'draft' ELSE 'scheduled' END) RETURNING id INTO rid; IF NOT gm AND NOT p_draft THEN INSERT INTO public.letter_receipts(letter_id,user_id) VALUES(l.id,auth.uid()) ON CONFLICT DO NOTHING; END IF; RETURN rid; END $function$
;

CREATE OR REPLACE FUNCTION public.schedule_weekly_reply_draft(p_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r letter_replies; l campaign_letters; prior letter_replies; n integer; target integer;
BEGIN
 PERFORM pg_advisory_xact_lock(184522);
 IF NOT public.campaign_access_active() THEN RAISE EXCEPTION 'Jogador não autorizado'; END IF;
 SELECT * INTO r FROM letter_replies WHERE id=p_id AND author_user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Rascunho indisponível'; END IF;
 IF r.publication_state<>'draft' THEN RETURN; END IF;
 SELECT * INTO l FROM campaign_letters WHERE id=r.letter_id FOR UPDATE;
 IF NOT FOUND OR l.deleted_at IS NOT NULL OR l.publication_state<>'delivered' OR NOT public.can_read_letter(l) THEN RAISE EXCEPTION 'Missiva indisponível'; END IF;
 IF r.reply_to_id<>l.id THEN
 SELECT * INTO prior FROM letter_replies WHERE id=r.reply_to_id AND letter_id=l.id;
 IF NOT FOUND OR prior.publication_state<>'delivered' OR NOT public.can_read_reply(prior) OR prior.author_user_id<>r.recipient_user_id THEN RAISE EXCEPTION 'Resposta indisponível'; END IF;
 ELSIF r.recipient_user_id<>l.sender_user_id THEN RAISE EXCEPTION 'Destinatário inválido'; END IF;
 IF NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=r.recipient_user_id AND role='admin') AND NOT EXISTS(SELECT 1 FROM campaign_players p WHERE p.user_id=r.recipient_user_id AND p.active AND NOT p.require_password_change AND public.can_read_letter_as(l,p.user_id)) THEN RAISE EXCEPTION 'Destinatário indisponível'; END IF;
 target:=public.reply_delivery_week(r.recipient_user_id);
 IF target IS NULL THEN RAISE EXCEPTION 'Missivas fechadas, aguarde o narrador abrir a próxima semana'; END IF;
 n:=coalesce(public.open_letter_round(),(SELECT max(number) FROM public.letter_rounds),target);
 IF btrim(coalesce(r.content,''))='' THEN RAISE EXCEPTION 'Escreva a resposta'; END IF;
 UPDATE letter_replies SET creation_week=n,delivery_week=target,publication_state=CASE WHEN target=public.open_letter_round() THEN 'delivered' ELSE 'scheduled' END,delivered_at=CASE WHEN target=public.open_letter_round() THEN now() END WHERE id=r.id;
 INSERT INTO sync_outbox(entity_type,entity_id,version,payload) SELECT 'reply',id,1,to_jsonb(t) FROM letter_replies t WHERE id=r.id ON CONFLICT DO NOTHING;
 UPDATE sync_outbox SET state='pending',next_attempt_at=now() WHERE entity_id=r.id;
END $function$
;

CREATE OR REPLACE FUNCTION public.reply_current_week()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE n integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF;
  SELECT number INTO n FROM public.letter_rounds WHERE status='open' ORDER BY number DESC LIMIT 1;
  IF n IS NULL THEN SELECT max(number) INTO n FROM public.letter_rounds; END IF;
  IF n IS NOT NULL THEN NEW.creation_week:=coalesce(NEW.creation_week,n); END IF;
  RETURN NEW;
END $function$
;

COMMIT;
