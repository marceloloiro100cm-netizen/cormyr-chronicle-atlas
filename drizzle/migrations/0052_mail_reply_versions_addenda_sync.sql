-- Lote 5 (21-25): respostas do Narrador, auditoria, sync e separação de conversas.
-- Sem alterar o conteúdo de missivas antigas; correção de threads legadas feita na UI.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='25000ms';

ALTER TABLE public.letter_replies
 ADD COLUMN version integer NOT NULL DEFAULT 1,
 ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN deleted_at timestamptz;

CREATE TABLE public.letter_reply_versions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 reply_id uuid NOT NULL REFERENCES public.letter_replies(id),
 version integer NOT NULL,
 snapshot jsonb NOT NULL,
 author uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(reply_id,version)
);
GRANT SELECT ON public.letter_reply_versions TO authenticated;
GRANT ALL ON public.letter_reply_versions TO service_role;
ALTER TABLE public.letter_reply_versions ENABLE ROW LEVEL SECURITY;
CREATE POLICY reply_versions_read ON public.letter_reply_versions FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM public.letter_replies r
 JOIN public.campaign_letters l ON l.id=r.letter_id
 WHERE r.id=reply_id AND public.can_read_letter(l)
   AND (r.author_user_id=auth.uid()
     OR (r.publication_state<>'draft' AND public.is_campaign_admin()))
 )
);
INSERT INTO public.letter_reply_versions(reply_id,version,snapshot,author)
SELECT id,version,to_jsonb(r),author_user_id FROM public.letter_replies r;

CREATE OR REPLACE FUNCTION public.can_read_reply_as(r public.letter_replies, viewer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT r.deleted_at IS NULL AND (CASE WHEN r.publication_state='draft'
   THEN r.author_user_id=viewer AND EXISTS(
     SELECT 1 FROM campaign_letters l WHERE l.id=r.letter_id
       AND l.deleted_at IS NULL AND public.can_read_letter_as(l,viewer))
 ELSE EXISTS(SELECT 1 FROM user_roles WHERE user_id=viewer AND role='admin')
   OR (EXISTS(SELECT 1 FROM campaign_letters l WHERE l.id=r.letter_id AND public.can_read_letter_as(l,viewer))
     AND EXISTS(SELECT 1 FROM campaign_players p WHERE p.user_id=viewer AND p.active AND NOT p.require_password_change
     AND (r.author_user_id=viewer OR (r.publication_state='delivered' AND
        (r.recipient_user_id=viewer OR (r.house_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM house_memberships m WHERE m.player_id=p.id AND m.house_id=r.house_id)))))))
 END);
$$;
CREATE OR REPLACE FUNCTION public.can_export_mail(p_type text,p_id uuid,p_viewer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN p_type='letter' THEN EXISTS(
   SELECT 1 FROM campaign_letters l WHERE l.id=p_id AND l.deleted_at IS NULL
     AND l.publication_state='delivered' AND public.can_read_letter_as(l,p_viewer))
 WHEN p_type='reply' THEN EXISTS(
   SELECT 1 FROM letter_replies r JOIN campaign_letters l ON l.id=r.letter_id
   WHERE r.id=p_id AND l.deleted_at IS NULL AND l.publication_state='delivered'
     AND r.publication_state='delivered' AND public.can_read_letter_as(l,p_viewer)
     AND (public.can_read_reply_as(r,p_viewer) OR (r.deleted_at IS NOT NULL AND (
       EXISTS(SELECT 1 FROM user_roles u WHERE u.user_id=p_viewer AND u.role='admin')
       OR r.author_user_id=p_viewer OR r.recipient_user_id=p_viewer
       OR (r.house_id IS NOT NULL AND EXISTS(
         SELECT 1 FROM campaign_players p JOIN house_memberships hm ON hm.player_id=p.id
         WHERE p.user_id=p_viewer AND p.active AND NOT p.require_password_change AND hm.house_id=r.house_id))
     ))))
 ELSE false END;
$$;
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
 END IF; IF NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=recipient AND role='admin') AND NOT EXISTS(SELECT 1 FROM campaign_players p WHERE p.user_id=recipient AND p.active AND NOT p.require_password_change AND public.can_read_letter_as(l,p.user_id)) THEN RAISE EXCEPTION 'Destinatário indisponível'; END IF; IF recipient=auth.uid() THEN RAISE EXCEPTION 'Selecione a mensagem recebida à qual deseja responder'; END IF; IF btrim(p_content)='' THEN RAISE EXCEPTION 'Escreva a resposta'; END IF; SELECT id INTO rid FROM public.letter_replies WHERE author_user_id=auth.uid() AND idempotency_key=p_key; IF FOUND THEN IF NOT EXISTS(SELECT 1 FROM letter_replies WHERE id=rid AND letter_id=p_letter AND reply_to_id=coalesce(p_reply,p_letter) AND content=p_content) THEN RAISE EXCEPTION 'Chave de envio já utilizada para outra resposta'; END IF; RETURN rid; END IF; delivery:=public.reply_delivery_week(recipient); IF delivery IS NULL AND NOT p_draft THEN RAISE EXCEPTION 'Semana de entrega indisponível'; END IF; n:=coalesce(n,(SELECT max(number) FROM public.letter_rounds),delivery); IF gm THEN pname:='Mestre'; ELSE SELECT name INTO pname FROM public.campaign_players WHERE id=public.my_player_id(); END IF; INSERT INTO public.letter_replies(letter_id,author_user_id,author_player_id,author_name,house_id,recipient_user_id,content,idempotency_key,conversation_id,reply_to_id,creation_week,delivery_week,publication_state) VALUES(l.id,auth.uid(),public.my_player_id(),coalesce(pname,'Jogador'),l.recipient_house_id,recipient,p_content,p_key,l.conversation_id,coalesce(p_reply,l.id),n,delivery,CASE WHEN p_draft THEN 'draft' ELSE 'scheduled' END) RETURNING id INTO rid; IF NOT gm AND NOT p_draft THEN INSERT INTO public.letter_receipts(letter_id,user_id) VALUES(l.id,auth.uid()) ON CONFLICT DO NOTHING; END IF; RETURN rid; END $function$
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
 ELSIF r.recipient_user_id<>l.sender_user_id AND NOT (
     public.is_campaign_admin() AND l.sender_user_id=r.author_user_id AND (
        (l.recipient_player_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM campaign_players p WHERE p.id=l.recipient_player_id AND p.user_id=r.recipient_user_id AND p.active))
        OR (l.recipient_house_id IS NOT NULL AND EXISTS(
          SELECT 1 FROM campaign_players p JOIN house_memberships hm ON hm.player_id=p.id
          WHERE hm.house_id=l.recipient_house_id AND p.user_id=r.recipient_user_id AND p.active))
     )) THEN RAISE EXCEPTION 'Destinatário inválido'; END IF;
 IF NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=r.recipient_user_id AND role='admin') AND NOT EXISTS(SELECT 1 FROM campaign_players p WHERE p.user_id=r.recipient_user_id AND p.active AND NOT p.require_password_change AND public.can_read_letter_as(l,p.user_id)) THEN RAISE EXCEPTION 'Destinatário indisponível'; END IF;
 target:=public.reply_delivery_week(r.recipient_user_id);
 IF target IS NULL THEN RAISE EXCEPTION 'Missivas fechadas, aguarde o narrador abrir a próxima semana'; END IF;
 n:=coalesce(public.open_letter_round(),(SELECT max(number) FROM public.letter_rounds),target);
 IF btrim(coalesce(r.content,''))='' THEN RAISE EXCEPTION 'Escreva a resposta'; END IF;
 UPDATE letter_replies SET creation_week=n,delivery_week=target,publication_state=CASE WHEN target=public.open_letter_round() THEN 'delivered' ELSE 'scheduled' END,delivered_at=CASE WHEN target=public.open_letter_round() THEN now() END WHERE id=r.id;
 INSERT INTO sync_outbox(entity_type,entity_id,version,payload) SELECT 'reply',id,version,to_jsonb(t) FROM letter_replies t WHERE id=r.id
 ON CONFLICT(entity_type,entity_id,version) DO UPDATE SET payload=excluded.payload,state='pending',next_attempt_at=now();
 UPDATE sync_outbox SET state='pending',next_attempt_at=now() WHERE entity_id=r.id;
END $function$
;
CREATE OR REPLACE FUNCTION public.set_letter_round(p_number integer, p_closed boolean)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_number integer;
  latest_number integer;
  existing_status text;
BEGIN
  IF NOT public.is_campaign_admin() THEN
    RAISE EXCEPTION 'Somente o Narrador abre ou encerra semanas';
  END IF;
  IF p_number IS NULL OR p_number<1 OR p_closed IS NULL THEN
    RAISE EXCEPTION 'Semana ou operação inválida';
  END IF;
  PERFORM pg_advisory_xact_lock(184522);
  SELECT number INTO current_number FROM public.letter_rounds
   WHERE status='open' ORDER BY number DESC LIMIT 1;
  SELECT coalesce(max(number),0) INTO latest_number FROM public.letter_rounds
   WHERE status IN ('open','closed');
  SELECT status INTO existing_status FROM public.letter_rounds
   WHERE number=p_number;

  IF p_closed THEN
    IF existing_status='closed' THEN
      RETURN; -- repetir fechamento é seguro; preserva o momento original
    END IF;
    IF current_number IS DISTINCT FROM p_number OR existing_status IS DISTINCT FROM 'open' THEN
      RAISE EXCEPTION 'Só é possível encerrar a semana que está aberta';
    END IF;
    UPDATE public.letter_rounds
      SET closed=true,status='closed',closed_by=auth.uid(),
          closed_at=now(),updated_at=now()
      WHERE number=p_number AND status='open';
    RETURN;
  END IF;

  IF current_number=p_number THEN
    RETURN; -- não republicar cartas ou respostas ao repetir abertura
  END IF;
  IF existing_status='closed' THEN
    RAISE EXCEPTION 'Semana histórica encerrada não pode ser reaberta';
  END IF;
  IF p_number<>latest_number+1 THEN
    RAISE EXCEPTION 'As semanas devem avançar em sequência. Próxima semana: %',latest_number+1;
  END IF;
  IF existing_status IS NOT NULL AND existing_status<>'prepared' THEN
    RAISE EXCEPTION 'Estado de semana inválido: %',existing_status;
  END IF;

  IF current_number IS NOT NULL THEN
    UPDATE public.letter_rounds
      SET status='closed',closed=true,closed_by=auth.uid(),
          closed_at=now(),updated_at=now()
      WHERE number=current_number AND status='open';
  END IF;
  INSERT INTO public.letter_rounds(number,closed,status,opened_by,opened_at,closed_by,closed_at)
    VALUES(p_number,false,'open',auth.uid(),now(),NULL,NULL)
  ON CONFLICT(number) DO UPDATE
    SET closed=false,status='open',
        opened_by=coalesce(letter_rounds.opened_by,excluded.opened_by),
        opened_at=coalesce(letter_rounds.opened_at,excluded.opened_at),
        closed_by=NULL,closed_at=NULL,updated_at=now()
    WHERE letter_rounds.status='prepared';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Não foi possível abrir a próxima semana';
  END IF;

  -- Publicar e reenfileirar SOMENTE as mensagens que estavam programadas.
  -- Não reenviar mensagens históricas já entregues.
  WITH transitioned AS (
    UPDATE public.campaign_letters
       SET publication_state='delivered',delivered_at=now()
     WHERE delivery_week=p_number AND publication_state='scheduled'
    RETURNING id,version,to_jsonb(campaign_letters) AS payload
  )
  INSERT INTO public.sync_outbox(entity_type,entity_id,version,payload)
    SELECT 'letter',id,version,payload FROM transitioned
  ON CONFLICT(entity_type,entity_id,version)
    DO UPDATE SET payload=excluded.payload,state='pending',next_attempt_at=now();

  WITH transitioned AS (
    UPDATE public.letter_replies
       SET publication_state='delivered',delivered_at=now()
     WHERE delivery_week=p_number AND publication_state='scheduled'
    RETURNING id,version,to_jsonb(letter_replies) AS payload
  )
  INSERT INTO public.sync_outbox(entity_type,entity_id,version,payload)
    SELECT 'reply',id,version,payload FROM transitioned
  ON CONFLICT(entity_type,entity_id,version)
    DO UPDATE SET payload=excluded.payload,state='pending',next_attempt_at=now();
END
$function$;
CREATE OR REPLACE FUNCTION public.weekly_message_defaults() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE n integer; BEGIN n:=public.open_letter_round(); IF TG_TABLE_NAME='campaign_letters' THEN NEW.conversation_id:=coalesce(NEW.conversation_id,NEW.id); NEW.creation_week:=coalesce(NEW.creation_week,n,NEW.letter_number); NEW.delivery_week:=coalesce(NEW.delivery_week,NEW.letter_number,n); NEW.letter_number:=NEW.delivery_week; END IF; IF NEW.publication_state NOT IN ('draft','scheduled','delivered') THEN RAISE EXCEPTION 'Situação inválida'; END IF; IF NEW.publication_state='scheduled' AND NEW.delivery_week=n THEN NEW.publication_state:='delivered'; NEW.delivered_at:=now(); END IF; RETURN NEW; END $$;

CREATE OR REPLACE FUNCTION public.save_weekly_reply_draft(p_id uuid,p_letter uuid,p_reply uuid,p_content text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r letter_replies; l campaign_letters;
BEGIN
 IF NOT public.campaign_access_active() THEN RAISE EXCEPTION 'Jogador não autorizado'; END IF;
 SELECT * INTO l FROM campaign_letters WHERE id=p_letter;
 IF NOT FOUND OR l.deleted_at IS NOT NULL OR NOT public.can_read_letter(l) THEN RAISE EXCEPTION 'Missiva indisponível'; END IF;
 SELECT * INTO r FROM letter_replies WHERE id=p_id OR (author_user_id=auth.uid() AND idempotency_key=p_id) FOR UPDATE;
 IF FOUND THEN
 IF r.deleted_at IS NOT NULL OR r.author_user_id<>auth.uid() OR r.publication_state<>'draft' OR r.letter_id<>p_letter OR r.reply_to_id IS DISTINCT FROM coalesce(p_reply,p_letter) THEN RAISE EXCEPTION 'Rascunho indisponível'; END IF;
 UPDATE letter_replies SET content=p_content,version=version+1,updated_at=clock_timestamp() WHERE id=r.id AND content IS DISTINCT FROM p_content; RETURN r.id;
 END IF;
 RETURN public.reply_weekly_message(p_letter,p_reply,p_content,p_id,true);
END $$;

-- A atualização gera uma versão auditável e uma fila dedicada ao novo conteúdo.
CREATE OR REPLACE FUNCTION public.audit_reply_edit() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.letter_reply_versions(reply_id,version,snapshot,author)
 VALUES(NEW.id,NEW.version,to_jsonb(NEW),coalesce(auth.uid(),NEW.author_user_id));
 IF NEW.publication_state='delivered' THEN
   INSERT INTO public.sync_outbox(entity_type,entity_id,version,payload)
   VALUES('reply',NEW.id,NEW.version,to_jsonb(NEW))
   ON CONFLICT(entity_type,entity_id,version)
     DO UPDATE SET payload=excluded.payload,state='pending',next_attempt_at=now();
 END IF;
 RETURN NEW;
END $$;
-- Novas respostas precisam de snapshot inicial antes da primeira edição.
CREATE TRIGGER reply_version_created AFTER INSERT ON public.letter_replies
 FOR EACH ROW EXECUTE FUNCTION public.audit_reply_edit();
CREATE TRIGGER reply_version_audit AFTER UPDATE OF content,deleted_at
 ON public.letter_replies FOR EACH ROW
 WHEN (OLD.content IS DISTINCT FROM NEW.content OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
 EXECUTE FUNCTION public.audit_reply_edit();

-- Edição de rascunho pelo autor, ou de resposta programada/entregue pelo Narrador.
CREATE FUNCTION public.edit_letter_reply(p_id uuid,p_version integer,p_content text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.letter_replies;
BEGIN
 IF NOT public.campaign_access_active() THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
 SELECT * INTO r FROM public.letter_replies WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR r.deleted_at IS NOT NULL OR NOT EXISTS(
    SELECT 1 FROM public.campaign_letters l WHERE l.id=r.letter_id
      AND l.deleted_at IS NULL AND public.can_read_letter(l))
 THEN RAISE EXCEPTION 'Resposta indisponível'; END IF;
 IF r.publication_state='draft' AND r.author_user_id<>auth.uid() THEN
   RAISE EXCEPTION 'Rascunho privado de outro jogador'; END IF;
 IF NOT public.is_campaign_admin() AND NOT (r.author_user_id=auth.uid() AND r.publication_state='draft')
 THEN RAISE EXCEPTION 'Somente o Narrador pode editar respostas publicadas'; END IF;
 IF r.version<>p_version THEN RAISE EXCEPTION 'Conflito de versão; atualize a resposta antes de salvar'; END IF;
 IF btrim(coalesce(p_content,''))='' THEN RAISE EXCEPTION 'Preencha o texto da resposta'; END IF;
 IF r.content IS DISTINCT FROM p_content THEN
   UPDATE public.letter_replies SET content=p_content,version=version+1,
     updated_at=clock_timestamp(),sync_state='pending' WHERE id=p_id RETURNING * INTO r;
 END IF;
 RETURN to_jsonb(r);
END $$;
REVOKE ALL ON FUNCTION public.edit_letter_reply(uuid,integer,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.edit_letter_reply(uuid,integer,text) TO authenticated;

-- Exclusão lógica evita perder respostas referenciadas por outras partes do fio.
CREATE FUNCTION public.delete_letter_reply(p_id uuid,p_version integer)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.letter_replies;
BEGIN
 IF NOT public.campaign_access_active() THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
 SELECT * INTO r FROM public.letter_replies WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR r.deleted_at IS NOT NULL OR NOT EXISTS(
    SELECT 1 FROM public.campaign_letters l WHERE l.id=r.letter_id
      AND l.deleted_at IS NULL AND public.can_read_letter(l))
 THEN RAISE EXCEPTION 'Resposta indisponível'; END IF;
 IF r.publication_state='draft' AND r.author_user_id<>auth.uid() THEN
   RAISE EXCEPTION 'Rascunho privado de outro jogador'; END IF;
 IF NOT public.is_campaign_admin() AND NOT (r.author_user_id=auth.uid() AND r.publication_state='draft')
 THEN RAISE EXCEPTION 'Somente o Narrador pode excluir respostas publicadas'; END IF;
 IF r.version<>p_version THEN RAISE EXCEPTION 'Conflito de versão; atualize a resposta antes de excluir'; END IF;
 UPDATE public.letter_replies SET deleted_at=clock_timestamp(),version=version+1,
   updated_at=clock_timestamp(),sync_state='pending' WHERE id=p_id;
END $$;
REVOKE ALL ON FUNCTION public.delete_letter_reply(uuid,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.delete_letter_reply(uuid,integer) TO authenticated;

-- Atualizações de missivas exigem upsert; o trigger anterior falhava caso versão
-- já estivesse na fila. Preserva snapshots e reenvia a versão atual.
CREATE OR REPLACE FUNCTION public.audit_letter_edit() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 INSERT INTO public.letter_versions(letter_id,version,snapshot,author)
 VALUES(NEW.id,NEW.version,to_jsonb(NEW),coalesce(auth.uid(),NEW.sender_user_id))
 ON CONFLICT(letter_id,version) DO UPDATE SET snapshot=excluded.snapshot;
 IF TG_OP='UPDATE' THEN
   INSERT INTO public.sync_outbox(entity_type,entity_id,version,payload)
   VALUES('letter',NEW.id,NEW.version,to_jsonb(NEW))
   ON CONFLICT(entity_type,entity_id,version)
     DO UPDATE SET payload=excluded.payload,state='pending',next_attempt_at=now();
 END IF;
 RETURN NEW;
END $$;

COMMIT;
