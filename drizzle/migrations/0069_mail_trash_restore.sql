-- Mail trash: preserve complete threads; allow restoring soft-deleted letters and replies.
-- Historical deleted_at rows are never rewritten by this migration.
BEGIN;

CREATE OR REPLACE FUNCTION public.delete_letter_reply(p_id uuid,p_version integer)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $body$
DECLARE v_reply public.letter_replies%ROWTYPE;
BEGIN
 IF NOT public.campaign_access_active() THEN
  RAISE EXCEPTION 'Acesso não autorizado' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_reply FROM public.letter_replies WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR v_reply.deleted_at IS NOT NULL OR NOT EXISTS(
  SELECT 1 FROM public.campaign_letters l
  WHERE l.id=v_reply.letter_id AND l.deleted_at IS NULL AND public.can_read_letter(l))
 THEN RAISE EXCEPTION 'Resposta indisponível'; END IF;
 IF NOT (public.is_campaign_admin() OR v_reply.author_user_id=auth.uid()) THEN
  RAISE EXCEPTION 'Somente o autor ou o Narrador pode excluir esta resposta' USING ERRCODE='42501';
 END IF;
 IF v_reply.version<>p_version THEN
  RAISE EXCEPTION 'Conflito de versão; atualize a resposta antes de excluir';
 END IF;
 UPDATE public.letter_replies SET
   deleted_at=clock_timestamp(),version=version+1,
   updated_at=clock_timestamp(),sync_state='pending'
 WHERE id=p_id;
 -- Parent missiva, other replies and conversation_id are unchanged.
END $body$;
REVOKE ALL ON FUNCTION public.delete_letter_reply(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.delete_letter_reply(uuid,integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_campaign_letter(p_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $body$
DECLARE v_letter public.campaign_letters%ROWTYPE; v_actor uuid:=auth.uid();
BEGIN
 IF v_actor IS NULL OR NOT public.campaign_access_active() THEN
  RAISE EXCEPTION 'Acesso não autorizado' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_letter FROM public.campaign_letters WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR v_letter.deleted_at IS NULL THEN
  RAISE EXCEPTION 'Missiva não encontrada na lixeira';
 END IF;
 IF NOT (public.is_campaign_admin() OR v_letter.sender_user_id=v_actor) THEN
  RAISE EXCEPTION 'Somente o autor ou o Narrador pode recuperar esta missiva' USING ERRCODE='42501';
 END IF;
 UPDATE public.campaign_letters
 SET deleted_at=NULL,deleted_by=NULL,updated_at=clock_timestamp(),
     version=version+1,sync_state='pending'
 WHERE id=p_id RETURNING * INTO v_letter;
 INSERT INTO public.letter_versions(letter_id,version,snapshot,author)
 VALUES (v_letter.id,v_letter.version,to_jsonb(v_letter),v_actor)
 ON CONFLICT(letter_id,version) DO UPDATE SET snapshot=excluded.snapshot;
 INSERT INTO public.sync_outbox(entity_type,entity_id,version,payload)
 VALUES('letter',v_letter.id,v_letter.version,to_jsonb(v_letter))
 ON CONFLICT(entity_type,entity_id,version)
 DO UPDATE SET payload=excluded.payload,state='pending',next_attempt_at=now();
END $body$;
REVOKE ALL ON FUNCTION public.restore_campaign_letter(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.restore_campaign_letter(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.restore_letter_reply(p_id uuid,p_version integer)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $body$
DECLARE v_reply public.letter_replies%ROWTYPE; v_actor uuid:=auth.uid();
BEGIN
 IF v_actor IS NULL OR NOT public.campaign_access_active() THEN
  RAISE EXCEPTION 'Acesso não autorizado' USING ERRCODE='42501';
 END IF;
 SELECT * INTO v_reply FROM public.letter_replies WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR v_reply.deleted_at IS NULL THEN
  RAISE EXCEPTION 'Resposta não encontrada na lixeira';
 END IF;
 IF NOT (public.is_campaign_admin() OR v_reply.author_user_id=v_actor) THEN
  RAISE EXCEPTION 'Somente o autor ou o Narrador pode recuperar esta resposta' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.campaign_letters l
  WHERE l.id=v_reply.letter_id AND l.deleted_at IS NULL
    AND (public.is_campaign_admin() OR public.can_read_letter_as(l,v_actor))
 ) THEN
  RAISE EXCEPTION 'Recupere primeiro a missiva original para restaurar a resposta';
 END IF;
 IF v_reply.version<>p_version THEN
  RAISE EXCEPTION 'Conflito de versão; atualize a resposta antes de restaurar';
 END IF;
 UPDATE public.letter_replies SET
   deleted_at=NULL,version=version+1,updated_at=clock_timestamp(),sync_state='pending'
 WHERE id=p_id;
END $body$;
REVOKE ALL ON FUNCTION public.restore_letter_reply(uuid,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.restore_letter_reply(uuid,integer) TO authenticated;

-- The ordinary mail_page uses RLS and intentionally hides deleted content.
-- This dedicated SECURITY DEFINER reader exposes ONLY the owner's own deleted
-- letters/replies, or all deleted items to the Narrator. It never changes data.
CREATE OR REPLACE FUNCTION public.mail_trash_page(
 p_filters jsonb DEFAULT '{}'::jsonb,p_page integer DEFAULT 0,p_size integer DEFAULT 20
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $body$
DECLARE v_actor uuid:=auth.uid(); v_admin boolean:=public.is_campaign_admin(); v_out jsonb;
BEGIN
 IF v_actor IS NULL OR NOT public.campaign_access_active() THEN
  RAISE EXCEPTION 'Acesso não autorizado' USING ERRCODE='42501';
 END IF;
 IF p_page IS NULL OR p_size IS NULL OR p_page<0 OR p_size<1 OR p_size>50 THEN
  RAISE EXCEPTION 'Página inválida';
 END IF;
 IF p_filters IS NULL OR jsonb_typeof(p_filters)<>'object' THEN
  RAISE EXCEPTION 'Filtros inválidos';
 END IF;
 WITH candidates AS (
  SELECT l.*,
    (l.deleted_at IS NOT NULL AND (v_admin OR l.sender_user_id=v_actor)) AS letter_eligible,
    EXISTS(SELECT 1 FROM public.letter_replies d
      WHERE d.letter_id=l.id AND d.deleted_at IS NOT NULL
        AND (v_admin OR (
          d.author_user_id=v_actor
          AND (
            (l.deleted_at IS NULL AND public.can_read_letter_as(l,v_actor))
            OR (l.deleted_at IS NOT NULL AND l.sender_user_id=v_actor)
          )
        ))) AS reply_eligible
  FROM public.campaign_letters l
  WHERE l.deleted_at IS NOT NULL OR EXISTS(
    SELECT 1 FROM public.letter_replies d WHERE d.letter_id=l.id AND d.deleted_at IS NOT NULL)
 ),
 visible AS (
  SELECT c.* FROM candidates c
  WHERE (c.letter_eligible OR c.reply_eligible)
    AND (coalesce(p_filters->>'number','')='' OR c.delivery_week::text=p_filters->>'number'
      OR EXISTS(SELECT 1 FROM public.letter_replies rr
                WHERE rr.letter_id=c.id AND rr.deleted_at IS NOT NULL
                  AND rr.delivery_week::text=p_filters->>'number'
                  AND (v_admin OR rr.author_user_id=v_actor)))
    AND (coalesce(p_filters->>'kind','')='' OR c.letter_kind=p_filters->>'kind')
    AND (coalesce(p_filters->>'origin','')='' OR c.origin_house_id=p_filters->>'origin'
         OR (p_filters->>'origin'='none' AND c.origin_house_id IS NULL))
    AND (coalesce(p_filters->>'house','')='' OR c.recipient_house_id=p_filters->>'house'
         OR EXISTS(SELECT 1 FROM public.campaign_players pp
                   WHERE pp.id=c.sender_player_id AND pp.roster_house_id=p_filters->>'house'))
    AND (coalesce(p_filters->>'court','')='' OR c.origin_house_id||':'||c.court_member_id=p_filters->>'court'
         OR (p_filters->>'court'='none' AND c.court_member_id IS NULL))
    AND (coalesce(p_filters->>'unit','')='' OR c.origin_house_id||':'||c.military_unit_id=p_filters->>'unit'
         OR (p_filters->>'unit'='none' AND c.military_unit_id IS NULL))
    AND (NOT (p_filters ? 'group_house_ids')
      OR (jsonb_typeof(p_filters->'group_house_ids')='array' AND EXISTS (
        SELECT 1 FROM jsonb_array_elements_text(p_filters->'group_house_ids') g(house_id)
        WHERE g.house_id=c.origin_house_id OR g.house_id=c.recipient_house_id
          OR EXISTS(SELECT 1 FROM public.campaign_players pp
                   WHERE pp.id IN (c.sender_player_id,c.recipient_player_id)
                     AND pp.roster_house_id=g.house_id))))
    AND (coalesce(p_filters->>'text','')=''
      OR strpos(lower(c.subject||' '||c.sender_name||' '||c.content),lower(p_filters->>'text'))>0
      OR EXISTS (SELECT 1 FROM public.letter_replies rr
        WHERE rr.letter_id=c.id AND rr.deleted_at IS NOT NULL
        AND (v_admin OR rr.author_user_id=v_actor)
        AND strpos(lower(rr.content||' '||rr.author_name),lower(p_filters->>'text'))>0))
 ),
 page_rows AS (
  SELECT * FROM visible ORDER BY
    greatest(coalesce(deleted_at,'epoch'::timestamptz),
      coalesce((SELECT max(r.deleted_at) FROM public.letter_replies r
                WHERE r.letter_id=visible.id AND r.deleted_at IS NOT NULL
                  AND (v_admin OR r.author_user_id=v_actor)),'epoch'::timestamptz)) DESC,
    id DESC LIMIT p_size OFFSET p_page*p_size
 )
 SELECT jsonb_build_object(
  'total',(SELECT count(*) FROM visible),
  'letters',coalesce((SELECT jsonb_agg(
    (to_jsonb(p)-'letter_eligible'-'reply_eligible')
      ||jsonb_build_object('recipient_read',false)
    ORDER BY p.created_at DESC,p.id DESC) FROM page_rows p),'[]'::jsonb),
  'replies',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.deleted_at DESC,d.id)
     FROM public.letter_replies d
     WHERE d.letter_id IN(SELECT id FROM page_rows)
       AND d.deleted_at IS NOT NULL AND (v_admin OR d.author_user_id=v_actor)
    ),'[]'::jsonb)
 ) INTO v_out;
 RETURN v_out;
END $body$;
REVOKE ALL ON FUNCTION public.mail_trash_page(jsonb,integer,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.mail_trash_page(jsonb,integer,integer) TO authenticated;
COMMIT;
