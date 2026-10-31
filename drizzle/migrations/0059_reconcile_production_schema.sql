-- Incremental repair for production drift discovered on 2026-10-31.
-- Previously recorded migrations (0000-0040) remain untouched; existing
-- 0042 workbook import history, house state, private messages and RPCs are preserved.
-- Later 0057 signed-mail routing is not replaced by obsolete 0052-0054 variants.
-- Safe to apply after 0058 on freshly migrated databases as well as drifted instances.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='25000ms';
-- Missing 0041 localization infrastructure.


CREATE TABLE IF NOT EXISTS public.campaign_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('house', 'region', 'event', 'adventure', 'catalog_item', 'record', 'festival', 'constitution')),
  entity_id text NOT NULL,
  field_name text NOT NULL,
  locale text NOT NULL CHECK (locale IN ('pt', 'en', 'es', 'de')),
  translated_text text NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, field_name, locale)
);

CREATE INDEX IF NOT EXISTS idx_campaign_translations_lookup
  ON public.campaign_translations (locale, entity_type, entity_id);

ALTER TABLE public.campaign_translations ENABLE ROW LEVEL SECURITY;

-- Leitura liberada para todos (público e autenticados) para traduzir tanto o Atlas público quanto a Ficha
DROP POLICY IF EXISTS "campaign_translations_read_all" ON public.campaign_translations;
CREATE POLICY "campaign_translations_read_all"
  ON public.campaign_translations
  FOR SELECT
  USING (true);

-- Escrita permitida apenas ao Administrador/Narrador da campanha
DROP POLICY IF EXISTS "campaign_translations_admin_write" ON public.campaign_translations;
CREATE POLICY "campaign_translations_admin_write"
  ON public.campaign_translations
  FOR ALL
  USING (public.is_campaign_admin())
  WITH CHECK (public.is_campaign_admin());

GRANT SELECT ON public.campaign_translations TO anon,authenticated;
GRANT INSERT,UPDATE,DELETE ON public.campaign_translations TO authenticated;
GRANT ALL ON public.campaign_translations TO service_role;


-- 0052: reply versioned audit and backfill. No existing reply content is altered.
ALTER TABLE public.letter_replies
 ADD COLUMN IF NOT EXISTS version integer NOT NULL DEFAULT 1,
 ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now(),
 ADD COLUMN IF NOT EXISTS deleted_at timestamptz;


CREATE TABLE IF NOT EXISTS public.letter_reply_versions(
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
DROP POLICY IF EXISTS reply_versions_read ON public.letter_reply_versions;
CREATE POLICY reply_versions_read ON public.letter_reply_versions FOR SELECT TO authenticated USING(
 EXISTS(SELECT 1 FROM public.letter_replies r
 JOIN public.campaign_letters l ON l.id=r.letter_id
 WHERE r.id=reply_id AND public.can_read_letter(l)
   AND (r.author_user_id=auth.uid()
     OR (r.publication_state<>'draft' AND public.is_campaign_admin()))
 )
);

INSERT INTO public.letter_reply_versions(reply_id,version,snapshot,author)
SELECT r.id,r.version,to_jsonb(r),r.author_user_id FROM public.letter_replies r
ON CONFLICT(reply_id,version) DO NOTHING;

CREATE OR REPLACE FUNCTION public.can_read_reply_version(p_reply uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS (
  SELECT 1 FROM letter_replies r JOIN campaign_letters l ON l.id=r.letter_id
  WHERE r.id=p_reply AND l.deleted_at IS NULL AND public.can_read_letter_as(l,auth.uid())
   AND (r.author_user_id=auth.uid() OR
     (r.publication_state<>'draft' AND EXISTS (
       SELECT 1 FROM user_roles u WHERE u.user_id=auth.uid() AND u.role='admin')))
 );
$$;
REVOKE ALL ON FUNCTION public.can_read_reply_version(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_read_reply_version(uuid) TO authenticated;

DROP POLICY IF EXISTS reply_versions_read ON public.letter_reply_versions;
CREATE POLICY reply_versions_read ON public.letter_reply_versions FOR SELECT TO authenticated USING(public.can_read_reply_version(reply_id));

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

DO $reconcile_triggers$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.letter_replies'::regclass AND tgname='reply_version_created' AND NOT tgisinternal) THEN
  CREATE TRIGGER reply_version_created AFTER INSERT ON public.letter_replies FOR EACH ROW EXECUTE FUNCTION public.audit_reply_edit();
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.letter_replies'::regclass AND tgname='reply_version_audit' AND NOT tgisinternal) THEN
  CREATE TRIGGER reply_version_audit AFTER UPDATE OF content,deleted_at ON public.letter_replies FOR EACH ROW
  WHEN (OLD.content IS DISTINCT FROM NEW.content OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at) EXECUTE FUNCTION public.audit_reply_edit();
 END IF;
END $reconcile_triggers$;

CREATE OR REPLACE FUNCTION public.edit_letter_reply(p_id uuid,p_version integer,p_content text)
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

CREATE OR REPLACE FUNCTION public.delete_letter_reply(p_id uuid,p_version integer)
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

CREATE OR REPLACE FUNCTION public.can_read_reply_as(r public.letter_replies, viewer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT r.deleted_at IS NULL AND EXISTS (
  SELECT 1 FROM public.campaign_letters l WHERE l.id=r.letter_id
    AND l.deleted_at IS NULL AND public.can_read_letter_as(l,viewer)
    AND (CASE WHEN r.publication_state='draft' THEN r.author_user_id=viewer
      ELSE EXISTS(SELECT 1 FROM public.user_roles u WHERE u.user_id=viewer AND u.role='admin')
       OR EXISTS(SELECT 1 FROM public.campaign_players p WHERE p.user_id=viewer
        AND p.active AND NOT p.require_password_change AND
        (r.author_user_id=viewer OR (r.publication_state='delivered' AND (
           r.recipient_user_id=viewer OR (l.recipient_player_id IS NULL
            AND r.house_id IS NOT NULL AND r.house_id=l.recipient_house_id
            AND EXISTS(SELECT 1 FROM public.house_memberships hm
             WHERE hm.player_id=p.id AND hm.house_id=l.recipient_house_id))
        ))))
    END)
 );
$$;
-- Apply the same limits to deleted reply tombstones; no house audience for individual mail.
CREATE OR REPLACE FUNCTION public.can_export_mail(p_type text,p_id uuid,p_viewer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN p_type='letter' THEN EXISTS(
  SELECT 1 FROM public.campaign_letters l WHERE l.id=p_id AND l.deleted_at IS NULL
  AND l.publication_state='delivered' AND public.can_read_letter_as(l,p_viewer))
 WHEN p_type='reply' THEN EXISTS(
  SELECT 1 FROM public.letter_replies r JOIN public.campaign_letters l ON l.id=r.letter_id
  WHERE r.id=p_id AND l.deleted_at IS NULL AND l.publication_state='delivered'
  AND r.publication_state='delivered' AND public.can_read_letter_as(l,p_viewer)
  AND (public.can_read_reply_as(r,p_viewer) OR (r.deleted_at IS NOT NULL
   AND (EXISTS(SELECT 1 FROM public.user_roles u WHERE u.user_id=p_viewer AND u.role='admin')
    OR r.author_user_id=p_viewer OR r.recipient_user_id=p_viewer
    OR (l.recipient_player_id IS NULL AND r.house_id=l.recipient_house_id AND EXISTS(
      SELECT 1 FROM public.campaign_players p JOIN public.house_memberships hm ON hm.player_id=p.id
      WHERE p.user_id=p_viewer AND p.active AND NOT p.require_password_change AND hm.house_id=l.recipient_house_id))))))
 ELSE false END;
$$;

CREATE OR REPLACE FUNCTION public.send_campaign_letter(p_player uuid,p_house text,p_subject text,p_content text,p_key uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target text; lid uuid; current_week integer;
BEGIN
 IF NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Somente o Narrador pode enviar missivas'; END IF;
 IF p_key IS NULL OR (p_player IS NULL AND p_house IS NULL) OR (p_player IS NOT NULL AND p_house IS NOT NULL)
 THEN RAISE EXCEPTION 'Informe exatamente um destinatário e chave de envio'; END IF;
 IF p_player IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.campaign_players p WHERE p.id=p_player
   AND p.active AND NOT p.require_password_change AND p.user_id IS NOT NULL)
  THEN RAISE EXCEPTION 'Jogador destinatário indisponível'; END IF;
  target:='p:'||p_player::text;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.campaign_houses h WHERE h.id=p_house AND h.active AND h.season=2)
  THEN RAISE EXCEPTION 'Casa destinatária inválida'; END IF;
  target:='h:'||p_house;
 END IF;
 SELECT l.id INTO lid FROM public.campaign_letters l WHERE l.batch_key=p_key AND l.sender_user_id=auth.uid()
   AND (l.recipient_player_id IS NOT DISTINCT FROM p_player)
   AND (l.recipient_house_id IS NOT DISTINCT FROM p_house);
 IF lid IS NOT NULL THEN RETURN lid; END IF;
 SELECT number INTO current_week FROM public.letter_rounds WHERE status='open';
 PERFORM public.send_campaign_letter_batch('reservada',coalesce(current_week,
  (SELECT coalesce(max(number),0)+1 FROM public.letter_rounds)),p_subject,p_content,ARRAY[target],p_key);
 SELECT id INTO lid FROM public.campaign_letters WHERE batch_key=p_key AND sender_user_id=auth.uid()
   AND recipient_player_id IS NOT DISTINCT FROM p_player AND recipient_house_id IS NOT DISTINCT FROM p_house;
 IF lid IS NULL THEN RAISE EXCEPTION 'Envio legado não pôde ser confirmado'; END IF;
 RETURN lid;
END $$;

-- 0053: restore administrative representation safeguards and validated batch drafts.
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

CREATE OR REPLACE FUNCTION public.campaign_representation_action(p_action text,p_args jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE actor_id uuid:=auth.uid();p public.campaign_players;claims text:=current_setting('request.jwt.claims',true);claim_sub text:=current_setting('request.jwt.claim.sub',true);representation_flag text:=current_setting('app.is_representation',true);result jsonb;rid uuid; BEGIN IF NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Acesso restrito ao Narrador'; END IF; SELECT player.* INTO p FROM public.campaign_representation_sessions s JOIN public.campaign_players player ON player.id=s.player_id WHERE s.actor=actor_id AND s.expires_at>now() AND player.active AND NOT player.require_password_change; IF NOT FOUND OR p.user_id IS NULL THEN RAISE EXCEPTION 'Representação expirada ou jogador inativo'; END IF; PERFORM set_config('request.jwt.claims',jsonb_build_object('sub',p.user_id,'role','authenticated')::text,true); PERFORM set_config('request.jwt.claim.sub',p.user_id::text,true);
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
PERFORM set_config('request.jwt.claims',coalesce(claims,''),true); PERFORM set_config('request.jwt.claim.sub',coalesce(claim_sub,''),true); IF p_action<>'read' THEN INSERT INTO public.campaign_admin_audit(actor,target_player,action,details) VALUES(actor_id,p.id,'representation_'||p_action,jsonb_build_object('entity',coalesce(p_args->>'id',p_args->>'letter',result->>'id'))); END IF; RETURN result; END $$;

-- Missing 0055 narrator-only structured notes.

CREATE TABLE IF NOT EXISTS public.narrator_mail_notes(
 id text PRIMARY KEY,
 letter_id uuid REFERENCES public.campaign_letters(id) ON DELETE CASCADE,
 reply_id uuid REFERENCES public.letter_replies(id) ON DELETE CASCADE,
 notes jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 updated_by uuid NOT NULL,
 CONSTRAINT one_mail_subject CHECK((letter_id IS NOT NULL)::integer+(reply_id IS NOT NULL)::integer=1),
 CONSTRAINT structured_notes_only CHECK(jsonb_typeof(notes)='object' AND (notes - ARRAY['ordem_recebida','execucao','resultado','conhecimento','pendencia'])='{}'::jsonb),
 CONSTRAINT subject_identifier CHECK(
  (letter_id IS NOT NULL AND id='letter:'||letter_id::text) OR
  (reply_id IS NOT NULL AND id='reply:'||reply_id::text)
 )
);
ALTER TABLE public.narrator_mail_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS narrator_mail_notes_private ON public.narrator_mail_notes;
CREATE POLICY narrator_mail_notes_private ON public.narrator_mail_notes
 FOR ALL TO authenticated USING(public.is_campaign_admin()) WITH CHECK(public.is_campaign_admin());
GRANT SELECT,INSERT,UPDATE,DELETE ON public.narrator_mail_notes TO authenticated;
GRANT ALL ON public.narrator_mail_notes TO service_role;

-- Missing 0056 round Harptos reference.

ALTER TABLE public.letter_rounds ADD COLUMN IF NOT EXISTS harptos_period text;
CREATE OR REPLACE FUNCTION public.set_round_harptos_period() RETURNS trigger
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE d public.campaign_calendar;
BEGIN
 IF NEW.status='open' AND NEW.harptos_period IS NULL THEN
  SELECT * INTO d FROM public.campaign_calendar WHERE id=true;
  IF FOUND THEN
   NEW.harptos_period:=CASE WHEN d.festival IS NOT NULL
     THEN lpad(d.year::text,4,'0')||'-F-'||d.festival
     ELSE lpad(d.year::text,4,'0')||'-'||lpad((d.month+1)::text,2,'0')||
       ':désdia-'||((d.day-1)/10+1)::text END;
  END IF;
 END IF;
 RETURN NEW;
END $$;
DO $harptos_guard$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.letter_rounds'::regclass AND tgname='z_round_harptos_period' AND NOT tgisinternal) THEN
  CREATE TRIGGER z_round_harptos_period BEFORE INSERT OR UPDATE OF status ON public.letter_rounds
  FOR EACH ROW EXECUTE FUNCTION public.set_round_harptos_period();
 END IF;
END $harptos_guard$;

-- Missing 0058 granular attribute permissions and heraldry-file RLS.

ALTER TABLE public.house_memberships
 ADD COLUMN IF NOT EXISTS can_edit_attributes boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.house_memberships.can_edit_attributes IS
 'Permissão explícita do Narrador para distribuir pontos-base via point buy, apenas em rascunhos. Não autoriza editar recursos de casas ativas.';
-- Private crest files are accessible only to the house or the Narrator.
-- They are not published as public URLs and do not expose other campaign images.
DROP POLICY IF EXISTS campaign_house_crests_read ON storage.objects;
CREATE POLICY campaign_house_crests_read ON storage.objects
 FOR SELECT TO authenticated USING (
  bucket_id='campaign-images'
  AND name LIKE 'house-crests/%'
  AND EXISTS (
   SELECT 1 FROM public.noble_house_sheets s
   WHERE s.state #>> '{identity,crestPath}'=objects.name
   AND objects.name LIKE ('house-crests/'||s.house_id||'/%')
   AND (public.is_campaign_admin() OR public.in_campaign_house(s.house_id,false))
  )
 );

COMMIT;