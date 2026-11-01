-- Ficha V2 · Lote 11/12: estruturas ADITIVAS para migração assistida.
-- MINUTA: não integrar ao diretório executável até preflight das migrations reais.
-- Antes da aplicação: inventário real das migrations, backup restaurável e ensaios de RLS.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45000ms';

CREATE TABLE IF NOT EXISTS public.character_v2_drafts(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_record_id uuid NOT NULL UNIQUE REFERENCES public.campaign_records(id) ON DELETE RESTRICT,
 canonical_character_id uuid NOT NULL REFERENCES public.campaign_characters(id) ON DELETE RESTRICT,
 house_id text NOT NULL REFERENCES public.campaign_houses(id) ON DELETE RESTRICT,
 source_version integer NOT NULL CHECK(source_version>=1),
 source_md5 text NOT NULL CHECK(source_md5 ~ '^[0-9a-f]{32}$'),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 status text NOT NULL DEFAULT 'draft'
  CHECK(status IN('draft','reviewed','rejected','rolled_back')),
 version integer NOT NULL DEFAULT 1 CHECK(version>=1),
 reviewed_by uuid REFERENCES auth.users(id),
 reviewed_at timestamptz,
 review_reason text,
 created_by uuid NOT NULL REFERENCES auth.users(id),
 updated_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS character_v2_drafts_character_idx
 ON public.character_v2_drafts(canonical_character_id,status);
ALTER TABLE public.character_v2_drafts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.character_v2_drafts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.character_v2_drafts TO authenticated;
GRANT ALL ON public.character_v2_drafts TO service_role;
DROP POLICY IF EXISTS character_v2_gm_only ON public.character_v2_drafts;
CREATE POLICY character_v2_gm_only ON public.character_v2_drafts
 FOR SELECT TO authenticated USING(auth.uid() IS NOT NULL AND public.campaign_access_active()
 AND public.is_campaign_admin());

CREATE TABLE IF NOT EXISTS public.character_v2_draft_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 operation_key uuid NOT NULL UNIQUE,
 draft_id uuid NOT NULL REFERENCES public.character_v2_drafts(id) ON DELETE RESTRICT,
 actor uuid NOT NULL REFERENCES auth.users(id),
 operation text NOT NULL CHECK(operation IN('stage','restage','review','reject','rollback')),
 before_state jsonb,
 after_state jsonb NOT NULL,
 reason text NOT NULL CHECK(length(btrim(reason))>=10),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.character_v2_draft_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.character_v2_draft_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.character_v2_draft_audit TO authenticated;
GRANT ALL ON public.character_v2_draft_audit TO service_role;
DROP POLICY IF EXISTS character_v2_audit_gm_only ON public.character_v2_draft_audit;
CREATE POLICY character_v2_audit_gm_only ON public.character_v2_draft_audit
 FOR SELECT TO authenticated USING(auth.uid() IS NOT NULL AND public.campaign_access_active()
 AND public.is_campaign_admin());

-- No player mutation is exposed; this RPC records a draft ONLY after explicit canonical linking.
CREATE OR REPLACE FUNCTION public.stage_character_v2_draft(
 p_source_record uuid,p_canonical_character uuid,p_expected_source_version integer,
 p_expected_source_md5 text,p_expected_draft_version integer,
 p_snapshot jsonb,p_operation_key uuid,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 v_actor uuid:=auth.uid();v_rec public.campaign_records%ROWTYPE;
 v_char public.campaign_characters%ROWTYPE;v_draft public.character_v2_drafts%ROWTYPE;
 v_audit public.character_v2_draft_audit%ROWTYPE;v_next_version integer;
 v_action text;
BEGIN
 IF v_actor IS NULL OR NOT public.campaign_access_active() OR NOT public.is_campaign_admin() THEN
  RAISE EXCEPTION 'Narrador ativo obrigatório' USING ERRCODE='42501';
 END IF;
 IF p_operation_key IS NULL OR p_source_record IS NULL OR p_canonical_character IS NULL
  OR p_expected_draft_version IS NULL OR p_expected_source_version IS NULL
  OR length(btrim(coalesce(p_reason,'')))<10 THEN
  RAISE EXCEPTION 'Chaves, versão e justificativa obrigatórias';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('character-v2:'||p_source_record::text,0));
 SELECT * INTO v_audit FROM public.character_v2_draft_audit WHERE operation_key=p_operation_key;
 IF FOUND THEN
  IF v_audit.operation NOT IN ('stage','restage') OR
   (SELECT source_record_id FROM public.character_v2_drafts WHERE id=v_audit.draft_id)<>p_source_record THEN
   RAISE EXCEPTION 'Chave idempotente reutilizada com operação divergente';
  END IF;
  RETURN jsonb_build_object('duplicate',true,'id',v_audit.draft_id,'status','draft');
 END IF;
 SELECT * INTO v_rec FROM public.campaign_records WHERE id=p_source_record FOR SHARE;
 IF NOT FOUND OR v_rec.kind<>'character' OR v_rec.house_id IS NULL OR
  v_rec.version<>p_expected_source_version OR md5(v_rec.content)<>p_expected_source_md5 THEN
  RAISE EXCEPTION 'Fonte não encontrada ou modificada; atualize a comparação';
 END IF;
 SELECT * INTO v_char FROM public.campaign_characters
 WHERE id=p_canonical_character FOR SHARE;
 IF NOT FOUND OR v_char.house_id IS DISTINCT FROM v_rec.house_id
   OR v_char.review_status<>'reviewed' OR v_char.confidence NOT IN ('supported','confirmed') THEN
  RAISE EXCEPTION 'Identidade canônica e Casa exigem revisão';
 END IF;
 IF NOT EXISTS(
  SELECT 1 FROM public.character_source_links l
  WHERE l.character_id=v_char.id AND l.source_kind='campaign_record'
  AND l.source_key=p_source_record::text
 ) THEN RAISE EXCEPTION 'Fonte não vinculada à identidade canônica'; END IF;
 IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot)<>'object'
  OR p_snapshot->>'schemaVersion'<>'2'
  OR p_snapshot->>'id'<>p_source_record::text
  OR p_snapshot->>'houseId'<>v_rec.house_id
  OR p_snapshot->'source'->>'recordId'<>p_source_record::text
  OR p_snapshot->'source'->>'recordVersion'<>v_rec.version::text
  OR p_snapshot->'source'->>'originalContent'<>v_rec.content
  OR p_snapshot->>'migrationStatus'<>'read_only_preview'
  THEN RAISE EXCEPTION 'Prévia V2 não corresponde ao registro original'; END IF;
 SELECT * INTO v_draft FROM public.character_v2_drafts
 WHERE source_record_id=p_source_record FOR UPDATE;
 IF FOUND AND (v_draft.version<>p_expected_draft_version OR
  v_draft.canonical_character_id<>p_canonical_character
  OR v_draft.status='reviewed') THEN
  RAISE EXCEPTION 'Revisão V2 defasada ou já homologada';
 END IF;
 IF NOT FOUND AND p_expected_draft_version<>0 THEN
  RAISE EXCEPTION 'Prévia ainda não foi criada; versão esperada 0';
 END IF;
 v_action:=CASE WHEN FOUND THEN 'restage' ELSE 'stage' END;
 IF v_action='stage' THEN
  INSERT INTO public.character_v2_drafts(
   source_record_id,canonical_character_id,house_id,source_version,
   source_md5,snapshot,status,version,created_by,updated_by)
  VALUES(p_source_record,v_char.id,v_rec.house_id,v_rec.version,
   p_expected_source_md5,p_snapshot,'draft',1,v_actor,v_actor)
  RETURNING * INTO v_draft;
 ELSE
  UPDATE public.character_v2_drafts SET
   source_version=v_rec.version,source_md5=p_expected_source_md5,snapshot=p_snapshot,
   status='draft',version=version+1,updated_by=v_actor,updated_at=now(),
   reviewed_by=NULL,reviewed_at=NULL,review_reason=NULL
  WHERE id=v_draft.id RETURNING * INTO v_draft;
 END IF;
 INSERT INTO public.character_v2_draft_audit(operation_key,draft_id,actor,
  operation,before_state,after_state,reason)
 VALUES(p_operation_key,v_draft.id,v_actor,v_action,NULL,
  jsonb_build_object('source_version',v_rec.version,'draft_version',v_draft.version,
   'status',v_draft.status),p_reason);
 RETURN jsonb_build_object('duplicate',false,'id',v_draft.id,'version',v_draft.version,
  'status',v_draft.status);
END $$;
REVOKE ALL ON FUNCTION public.stage_character_v2_draft(
 uuid,uuid,integer,text,integer,jsonb,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.stage_character_v2_draft(
 uuid,uuid,integer,text,integer,jsonb,uuid,text) TO authenticated;

-- Explicit review never flips the player-facing feature flag or edits the source.
CREATE OR REPLACE FUNCTION public.review_character_v2_draft(
 p_id uuid,p_expected_version integer,p_action text,p_operation_key uuid,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v_actor uuid:=auth.uid(); v_draft public.character_v2_drafts%ROWTYPE;
 v_rec public.campaign_records%ROWTYPE;
 v_audit public.character_v2_draft_audit%ROWTYPE;v_status text;
BEGIN
 IF v_actor IS NULL OR NOT public.campaign_access_active() OR NOT public.is_campaign_admin() THEN
  RAISE EXCEPTION 'Narrador ativo obrigatório' USING ERRCODE='42501';
 END IF;
 IF p_action NOT IN ('review','reject','rollback') OR
  p_id IS NULL OR p_operation_key IS NULL OR p_expected_version IS NULL OR
  length(btrim(coalesce(p_reason,'')))<10 THEN
  RAISE EXCEPTION 'Operação, versão e justificativa inválidas';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('character-v2-draft:'||p_id::text,0));
 SELECT * INTO v_audit FROM public.character_v2_draft_audit WHERE operation_key=p_operation_key;
 IF FOUND THEN
  IF v_audit.draft_id<>p_id OR v_audit.operation<>p_action THEN
    RAISE EXCEPTION 'Chave idempotente reutilizada';
  END IF;
  RETURN jsonb_build_object('duplicate',true,'id',p_id);
 END IF;
 SELECT * INTO v_draft FROM public.character_v2_drafts WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR v_draft.version<>p_expected_version THEN
  RAISE EXCEPTION 'Prévia inexistente ou versão defasada';
 END IF;
 SELECT * INTO v_rec FROM public.campaign_records WHERE id=v_draft.source_record_id;
 IF NOT FOUND OR v_rec.version<>v_draft.source_version OR md5(v_rec.content)<>v_draft.source_md5 THEN
  RAISE EXCEPTION 'A ficha original mudou; recrie a prévia';
 END IF;
 IF p_action='review' AND (v_draft.snapshot->'review'->>'status'<>'approved'
   OR jsonb_array_length(coalesce(v_draft.snapshot->'review'->'warnings','[]'::jsonb))>0) THEN
  RAISE EXCEPTION 'Pendências da ficha devem ser conciliadas antes do aceite';
 END IF;
 v_status:=CASE p_action WHEN 'review' THEN 'reviewed'
  WHEN 'reject' THEN 'rejected' ELSE 'rolled_back' END;
 UPDATE public.character_v2_drafts SET status=v_status,version=version+1,
  reviewed_by=v_actor,reviewed_at=now(),review_reason=p_reason,
  updated_by=v_actor,updated_at=now()
 WHERE id=v_draft.id;
 INSERT INTO public.character_v2_draft_audit(operation_key,draft_id,actor,operation,
  before_state,after_state,reason)
 VALUES(p_operation_key,p_id,v_actor,p_action,
  jsonb_build_object('status',v_draft.status,'version',v_draft.version),
  jsonb_build_object('status',v_status,'version',v_draft.version+1),p_reason);
 RETURN jsonb_build_object('id',p_id,'status',v_status,'version',v_draft.version+1);
END $$;
REVOKE ALL ON FUNCTION public.review_character_v2_draft(
 uuid,integer,text,uuid,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.review_character_v2_draft(
 uuid,integer,text,uuid,text) TO authenticated;

COMMIT;
