-- CORMYR V3.5 — adjudicação oficial MANUAL de perdas, em duas casas.
-- Não implantar antes de aprovação explícita das regras e ensaio em clone PostgreSQL.
-- Nunca executar a partir do fluxo de treino V3.4. PTE-2.0 com fonte oficial apenas.
BEGIN;
CREATE TABLE IF NOT EXISTS public.battle_v35_cases(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 battle_session_id uuid NOT NULL UNIQUE REFERENCES public.battle_sim_sessions(id),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 house_a_id text NOT NULL,house_b_id text NOT NULL,
 expected_version_a integer NOT NULL CHECK (expected_version_a>=0),
 expected_version_b integer NOT NULL CHECK (expected_version_b>=0),
 source_hash_a text NOT NULL CHECK (source_hash_a ~ '^[0-9a-f]{64}$'),
 source_hash_b text NOT NULL CHECK (source_hash_b ~ '^[0-9a-f]{64}$'),
 battle_hash text NOT NULL CHECK (battle_hash ~ '^[0-9a-f]{64}$'),
 sources_json jsonb NOT NULL CHECK (jsonb_typeof(sources_json)='array'),
 report_json jsonb NOT NULL,
 decisions_json jsonb NOT NULL DEFAULT '[]'::jsonb,
 plan_hash text CHECK (plan_hash IS NULL OR plan_hash ~ '^[0-9a-f]{64}$'),
 review_version integer NOT NULL DEFAULT 0 CHECK (review_version BETWEEN 0 AND 100),
 status text NOT NULL DEFAULT 'draft'
  CHECK (status IN ('draft','approved','applied','rejected')),
 approved_by uuid REFERENCES auth.users(id),
 approved_at timestamptz,
 applied_by uuid REFERENCES auth.users(id),
 applied_at timestamptz,apply_id uuid UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT battle_v35_distinct_houses CHECK(house_a_id<>house_b_id),
 CONSTRAINT battle_v35_has_approval CHECK
  (status NOT IN ('approved','applied') OR (approved_by IS NOT NULL AND approved_at IS NOT NULL AND plan_hash IS NOT NULL)),
 CONSTRAINT battle_v35_has_application CHECK
  (status<>'applied' OR (applied_by IS NOT NULL AND applied_at IS NOT NULL AND apply_id IS NOT NULL))
);
CREATE TABLE IF NOT EXISTS public.battle_v35_receipts(
 case_id uuid PRIMARY KEY REFERENCES public.battle_v35_cases(id) ON DELETE RESTRICT,
 apply_id uuid NOT NULL UNIQUE,actor_id uuid NOT NULL REFERENCES auth.users(id),
 plan_hash text NOT NULL,previous_hash_a text NOT NULL,previous_hash_b text NOT NULL,
 new_hash_a text NOT NULL,new_hash_b text NOT NULL,
 decisions_json jsonb NOT NULL,applied_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS battle_v35_review_idx
 ON public.battle_v35_cases(status,updated_at DESC);
ALTER TABLE public.battle_v35_cases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_v35_cases FORCE ROW LEVEL SECURITY;
ALTER TABLE public.battle_v35_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_v35_receipts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS battle_v35_admin_read ON public.battle_v35_cases;
CREATE POLICY battle_v35_admin_read ON public.battle_v35_cases FOR SELECT TO authenticated
 USING (public.campaign_access_active() AND public.is_campaign_admin());
DROP POLICY IF EXISTS battle_v35_audit_read ON public.battle_v35_receipts;
CREATE POLICY battle_v35_audit_read ON public.battle_v35_receipts FOR SELECT TO authenticated
 USING (public.campaign_access_active() AND public.is_campaign_admin());
REVOKE ALL ON public.battle_v35_cases,public.battle_v35_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.battle_v35_cases,public.battle_v35_receipts TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.battle_v35_cases,public.battle_v35_receipts TO service_role;
CREATE OR REPLACE FUNCTION public.battle_v35_save_plan(
 p_actor uuid,p_case uuid,p_expected integer,p_decisions jsonb,p_hash text
) RETURNS integer LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,public AS $v35$
DECLARE v public.battle_v35_cases%ROWTYPE;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
 IF NOT public.is_campaign_admin() OR NOT public.campaign_access_active()
 THEN RAISE EXCEPTION 'NARRATOR_REVOKED'; END IF;
 SELECT * INTO v FROM public.battle_v35_cases WHERE id=p_case FOR UPDATE;
 IF NOT FOUND OR v.status<>'draft' OR v.review_version<>p_expected THEN
  RAISE EXCEPTION 'REVIEW_CONFLICT'; END IF;
 IF jsonb_typeof(p_decisions)<>'array' OR jsonb_array_length(p_decisions)<2
   OR p_hash !~ '^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'INVALID_PLAN'; END IF;
 UPDATE public.battle_v35_cases SET decisions_json=p_decisions,plan_hash=p_hash,
   review_version=review_version+1,updated_at=now() WHERE id=p_case;
 RETURN p_expected+1;
END;$v35$;
CREATE OR REPLACE FUNCTION public.battle_v35_approve_plan(
 p_actor uuid,p_case uuid,p_expected integer,p_hash text
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,public AS $v35$
DECLARE v public.battle_v35_cases%ROWTYPE;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
 IF NOT public.is_campaign_admin() OR NOT public.campaign_access_active()
 THEN RAISE EXCEPTION 'NARRATOR_REVOKED'; END IF;
 SELECT * INTO v FROM public.battle_v35_cases WHERE id=p_case FOR UPDATE;
 IF NOT FOUND OR v.status<>'draft' OR v.review_version<>p_expected OR
    v.plan_hash IS NULL OR v.plan_hash<>p_hash THEN
  RAISE EXCEPTION 'REVIEW_CONFLICT'; END IF;
 UPDATE public.battle_v35_cases SET status='approved',approved_by=p_actor,
    approved_at=now(),updated_at=now() WHERE id=p_case;
 RETURN true;
END;$v35$;
-- Defence in depth: even trusted server parameters may change ONLY casualties/notes.
-- The transaction rejects any altered XP, Power, health, buildings, roster or calendar.
CREATE OR REPLACE FUNCTION public.battle_v35_losses_only(p_before jsonb,p_after jsonb)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,public AS $v35$
DECLARE n integer;i integer;oldunit jsonb;newunit jsonb;before_count integer;after_count integer;
BEGIN
 IF jsonb_typeof(p_before)<>'object' OR jsonb_typeof(p_after)<>'object'
    OR jsonb_typeof(p_before->'units')<>'array'
    OR jsonb_typeof(p_after->'units')<>'array'
    OR (p_before-'units')<>(p_after-'units')
 THEN RETURN false; END IF;
 n:=jsonb_array_length(p_before->'units');
 IF n<>jsonb_array_length(p_after->'units') THEN RETURN false; END IF;
 FOR i IN 0..n-1 LOOP
  oldunit:=p_before->'units'->i;newunit:=p_after->'units'->i;
  IF jsonb_typeof(oldunit)<>'object' OR jsonb_typeof(newunit)<>'object' OR
     (oldunit-'casualties'-'notes')<>(newunit-'casualties'-'notes') OR
     jsonb_typeof(oldunit->'casualties')<>'number' OR
     jsonb_typeof(newunit->'casualties')<>'number' OR
     (oldunit->>'casualties') !~ '^[0-9]+
 p_actor uuid,p_case uuid,p_operation uuid,p_plan_hash text,
 p_before_a jsonb,p_before_b jsonb,p_after_a jsonb,p_after_b jsonb,
 p_version_a integer,p_version_b integer,p_new_hash_a text,p_new_hash_b text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,public AS $v35$
DECLARE v public.battle_v35_cases%ROWTYPE;
        a public.noble_house_sheets%ROWTYPE;
        b public.noble_house_sheets%ROWTYPE;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
 IF NOT public.is_campaign_admin() OR NOT public.campaign_access_active()
 THEN RAISE EXCEPTION 'NARRATOR_REVOKED'; END IF;
 SELECT * INTO v FROM public.battle_v35_cases WHERE id=p_case FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'REVIEW_NOT_FOUND'; END IF;
 IF v.status='applied' THEN
  IF v.apply_id=p_operation THEN
   RETURN jsonb_build_object('duplicate',true,'caseId',p_case); END IF;
  RAISE EXCEPTION 'ALREADY_APPLIED';
 END IF;
 IF v.status<>'approved' OR v.approved_by IS NULL OR v.plan_hash<>p_plan_hash OR
   v.expected_version_a<>p_version_a OR v.expected_version_b<>p_version_b OR
   p_new_hash_a !~ '^[0-9a-f]{64}$' OR p_new_hash_b !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'REVIEW_NOT_APPROVED_OR_OUTDATED'; END IF;
 -- Deadlock-safe ordem determinística antes da atualização das DUAS fichas.
 PERFORM 1 FROM public.noble_house_sheets
  WHERE house_id IN (v.house_a_id,v.house_b_id)
  ORDER BY house_id FOR UPDATE;
 SELECT * INTO a FROM public.noble_house_sheets WHERE house_id=v.house_a_id;
 SELECT * INTO b FROM public.noble_house_sheets WHERE house_id=v.house_b_id;
 IF a.house_id IS NULL OR b.house_id IS NULL OR
    a.version<>p_version_a OR b.version<>p_version_b OR
    a.state::jsonb<>p_before_a OR b.state::jsonb<>p_before_b THEN
  RAISE EXCEPTION 'SOURCE_VERSION_OR_SNAPSHOT_CHANGED';
 END IF;
 IF jsonb_typeof(p_after_a)<>'object' OR jsonb_typeof(p_after_b)<>'object' OR
    p_after_a->>'houseId'<>v.house_a_id OR p_after_b->>'houseId'<>v.house_b_id THEN
  RAISE EXCEPTION 'RESULT_STATE_INVALID';
 END IF;
 IF NOT public.battle_v35_losses_only(p_before_a,p_after_a) OR
    NOT public.battle_v35_losses_only(p_before_b,p_after_b)
 THEN RAISE EXCEPTION 'NON_CASUALTY_MUTATION_FORBIDDEN'; END IF;
 UPDATE public.noble_house_sheets SET state=p_after_a,version=version+1
  WHERE house_id=v.house_a_id;
 UPDATE public.noble_house_sheets SET state=p_after_b,version=version+1
  WHERE house_id=v.house_b_id;
 INSERT INTO public.battle_v35_receipts(case_id,apply_id,actor_id,plan_hash,
   previous_hash_a,previous_hash_b,new_hash_a,new_hash_b,decisions_json)
 VALUES(p_case,p_operation,p_actor,p_plan_hash,
   v.source_hash_a,v.source_hash_b,p_new_hash_a,p_new_hash_b,v.decisions_json);
 UPDATE public.battle_v35_cases SET status='applied',
    applied_by=p_actor,applied_at=now(),apply_id=p_operation,
    updated_at=now() WHERE id=p_case;
 RETURN jsonb_build_object('duplicate',false,'caseId',p_case,
  'houseA',v.house_a_id,'houseB',v.house_b_id);
END;$v35$;
REVOKE ALL ON FUNCTION public.battle_v35_save_plan(uuid,uuid,integer,jsonb,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.battle_v35_approve_plan(uuid,uuid,integer,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.battle_v35_apply(uuid,uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,
 integer,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.battle_v35_save_plan(uuid,uuid,integer,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.battle_v35_approve_plan(uuid,uuid,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.battle_v35_apply(uuid,uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,
 integer,integer,text,text) TO service_role;
COMMENT ON TABLE public.battle_v35_cases IS
 'Revisão oficial de PTE-2.0 com perdas manuais. Somente aprovação e aplicação explícitas do Narrador mudam as duas casas.';
COMMIT;
 OR
     (newunit->>'casualties') !~ '^[0-9]+
 p_actor uuid,p_case uuid,p_operation uuid,p_plan_hash text,
 p_before_a jsonb,p_before_b jsonb,p_after_a jsonb,p_after_b jsonb,
 p_version_a integer,p_version_b integer,p_new_hash_a text,p_new_hash_b text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,public AS $v35$
DECLARE v public.battle_v35_cases%ROWTYPE;
        a public.noble_house_sheets%ROWTYPE;
        b public.noble_house_sheets%ROWTYPE;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
 IF NOT public.is_campaign_admin() OR NOT public.campaign_access_active()
 THEN RAISE EXCEPTION 'NARRATOR_REVOKED'; END IF;
 SELECT * INTO v FROM public.battle_v35_cases WHERE id=p_case FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'REVIEW_NOT_FOUND'; END IF;
 IF v.status='applied' THEN
  IF v.apply_id=p_operation THEN
   RETURN jsonb_build_object('duplicate',true,'caseId',p_case); END IF;
  RAISE EXCEPTION 'ALREADY_APPLIED';
 END IF;
 IF v.status<>'approved' OR v.approved_by IS NULL OR v.plan_hash<>p_plan_hash OR
   v.expected_version_a<>p_version_a OR v.expected_version_b<>p_version_b OR
   p_new_hash_a !~ '^[0-9a-f]{64}$' OR p_new_hash_b !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'REVIEW_NOT_APPROVED_OR_OUTDATED'; END IF;
 -- Deadlock-safe ordem determinística antes da atualização das DUAS fichas.
 PERFORM 1 FROM public.noble_house_sheets
  WHERE house_id IN (v.house_a_id,v.house_b_id)
  ORDER BY house_id FOR UPDATE;
 SELECT * INTO a FROM public.noble_house_sheets WHERE house_id=v.house_a_id;
 SELECT * INTO b FROM public.noble_house_sheets WHERE house_id=v.house_b_id;
 IF a.house_id IS NULL OR b.house_id IS NULL OR
    a.version<>p_version_a OR b.version<>p_version_b OR
    a.state::jsonb<>p_before_a OR b.state::jsonb<>p_before_b THEN
  RAISE EXCEPTION 'SOURCE_VERSION_OR_SNAPSHOT_CHANGED';
 END IF;
 IF jsonb_typeof(p_after_a)<>'object' OR jsonb_typeof(p_after_b)<>'object' OR
    p_after_a->>'houseId'<>v.house_a_id OR p_after_b->>'houseId'<>v.house_b_id THEN
  RAISE EXCEPTION 'RESULT_STATE_INVALID';
 END IF;
 UPDATE public.noble_house_sheets SET state=p_after_a,version=version+1
  WHERE house_id=v.house_a_id;
 UPDATE public.noble_house_sheets SET state=p_after_b,version=version+1
  WHERE house_id=v.house_b_id;
 INSERT INTO public.battle_v35_receipts(case_id,apply_id,actor_id,plan_hash,
   previous_hash_a,previous_hash_b,new_hash_a,new_hash_b,decisions_json)
 VALUES(p_case,p_operation,p_actor,p_plan_hash,
   v.source_hash_a,v.source_hash_b,p_new_hash_a,p_new_hash_b,v.decisions_json);
 UPDATE public.battle_v35_cases SET status='applied',
    applied_by=p_actor,applied_at=now(),apply_id=p_operation,
    updated_at=now() WHERE id=p_case;
 RETURN jsonb_build_object('duplicate',false,'caseId',p_case,
  'houseA',v.house_a_id,'houseB',v.house_b_id);
END;$v35$;
REVOKE ALL ON FUNCTION public.battle_v35_save_plan(uuid,uuid,integer,jsonb,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.battle_v35_approve_plan(uuid,uuid,integer,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.battle_v35_apply(uuid,uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,
 integer,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.battle_v35_save_plan(uuid,uuid,integer,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.battle_v35_approve_plan(uuid,uuid,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.battle_v35_apply(uuid,uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,
 integer,integer,text,text) TO service_role;
COMMENT ON TABLE public.battle_v35_cases IS
 'Revisão oficial de PTE-2.0 com perdas manuais. Somente aprovação e aplicação explícitas do Narrador mudam as duas casas.';
COMMIT;

  THEN RETURN false; END IF;
  before_count:=(oldunit->>'casualties')::integer;
  after_count:=(newunit->>'casualties')::integer;
  IF after_count<before_count OR after_count>(newunit->>'strength')::integer
  THEN RETURN false; END IF;
 END LOOP;
 RETURN true;
END;$v35$;
REVOKE ALL ON FUNCTION public.battle_v35_losses_only(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.battle_v35_losses_only(jsonb,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.battle_v35_apply(
 p_actor uuid,p_case uuid,p_operation uuid,p_plan_hash text,
 p_before_a jsonb,p_before_b jsonb,p_after_a jsonb,p_after_b jsonb,
 p_version_a integer,p_version_b integer,p_new_hash_a text,p_new_hash_b text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,public AS $v35$
DECLARE v public.battle_v35_cases%ROWTYPE;
        a public.noble_house_sheets%ROWTYPE;
        b public.noble_house_sheets%ROWTYPE;
BEGIN
 PERFORM set_config('request.jwt.claim.sub',p_actor::text,true);
 IF NOT public.is_campaign_admin() OR NOT public.campaign_access_active()
 THEN RAISE EXCEPTION 'NARRATOR_REVOKED'; END IF;
 SELECT * INTO v FROM public.battle_v35_cases WHERE id=p_case FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'REVIEW_NOT_FOUND'; END IF;
 IF v.status='applied' THEN
  IF v.apply_id=p_operation THEN
   RETURN jsonb_build_object('duplicate',true,'caseId',p_case); END IF;
  RAISE EXCEPTION 'ALREADY_APPLIED';
 END IF;
 IF v.status<>'approved' OR v.approved_by IS NULL OR v.plan_hash<>p_plan_hash OR
   v.expected_version_a<>p_version_a OR v.expected_version_b<>p_version_b OR
   p_new_hash_a !~ '^[0-9a-f]{64}$' OR p_new_hash_b !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'REVIEW_NOT_APPROVED_OR_OUTDATED'; END IF;
 -- Deadlock-safe ordem determinística antes da atualização das DUAS fichas.
 PERFORM 1 FROM public.noble_house_sheets
  WHERE house_id IN (v.house_a_id,v.house_b_id)
  ORDER BY house_id FOR UPDATE;
 SELECT * INTO a FROM public.noble_house_sheets WHERE house_id=v.house_a_id;
 SELECT * INTO b FROM public.noble_house_sheets WHERE house_id=v.house_b_id;
 IF a.house_id IS NULL OR b.house_id IS NULL OR
    a.version<>p_version_a OR b.version<>p_version_b OR
    a.state::jsonb<>p_before_a OR b.state::jsonb<>p_before_b THEN
  RAISE EXCEPTION 'SOURCE_VERSION_OR_SNAPSHOT_CHANGED';
 END IF;
 IF jsonb_typeof(p_after_a)<>'object' OR jsonb_typeof(p_after_b)<>'object' OR
    p_after_a->>'houseId'<>v.house_a_id OR p_after_b->>'houseId'<>v.house_b_id THEN
  RAISE EXCEPTION 'RESULT_STATE_INVALID';
 END IF;
 UPDATE public.noble_house_sheets SET state=p_after_a,version=version+1
  WHERE house_id=v.house_a_id;
 UPDATE public.noble_house_sheets SET state=p_after_b,version=version+1
  WHERE house_id=v.house_b_id;
 INSERT INTO public.battle_v35_receipts(case_id,apply_id,actor_id,plan_hash,
   previous_hash_a,previous_hash_b,new_hash_a,new_hash_b,decisions_json)
 VALUES(p_case,p_operation,p_actor,p_plan_hash,
   v.source_hash_a,v.source_hash_b,p_new_hash_a,p_new_hash_b,v.decisions_json);
 UPDATE public.battle_v35_cases SET status='applied',
    applied_by=p_actor,applied_at=now(),apply_id=p_operation,
    updated_at=now() WHERE id=p_case;
 RETURN jsonb_build_object('duplicate',false,'caseId',p_case,
  'houseA',v.house_a_id,'houseB',v.house_b_id);
END;$v35$;
REVOKE ALL ON FUNCTION public.battle_v35_save_plan(uuid,uuid,integer,jsonb,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.battle_v35_approve_plan(uuid,uuid,integer,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.battle_v35_apply(uuid,uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,
 integer,integer,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.battle_v35_save_plan(uuid,uuid,integer,jsonb,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.battle_v35_approve_plan(uuid,uuid,integer,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.battle_v35_apply(uuid,uuid,uuid,text,jsonb,jsonb,jsonb,jsonb,
 integer,integer,text,text) TO service_role;
COMMENT ON TABLE public.battle_v35_cases IS
 'Revisão oficial de PTE-2.0 com perdas manuais. Somente aprovação e aplicação explícitas do Narrador mudam as duas casas.';
COMMIT;
