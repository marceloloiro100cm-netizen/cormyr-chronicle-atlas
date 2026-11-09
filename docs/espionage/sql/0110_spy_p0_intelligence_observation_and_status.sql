-- 0110 | P0 — usar data da captura real da informação, nunca retroagir snapshots.
-- Quando a fonte ficar disponível depois da missão, o histórico registra a data
-- da efetiva consulta ao inventário, não a data da missão já encerrada.
-- Mantém idempotência, bloqueios de linha, RLS e a prioridade de segredos novos.
-- Preserva a assinatura da RPC, idempotência, RLS e o histórico já existente.
-- Reexecução segura: CREATE OR REPLACE altera apenas o código da função.
BEGIN;
SET LOCAL lock_timeout='8s';
CREATE OR REPLACE FUNCTION public.spy_intelligence_finalize(
 p_operation uuid,p_resources jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,pg_temp AS $finalize$
DECLARE v_award record;v_op record;v_catalog jsonb;v_row record;
 v_seen jsonb;v_snapshot jsonb;v_previous jsonb;v_version integer;
 v_new integer:=0;v_refreshed integer:=0;v_available integer;
 v_observed_date text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
  OR NOT public.is_campaign_admin()
 THEN RAISE EXCEPTION 'Somente o Narrador confirma descobertas'; END IF;
 SELECT a.* INTO v_award FROM public.spy_intelligence_mission_awards a
  WHERE a.operation_id=p_operation FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','no_success_award'); END IF;
 IF v_award.processing_state='complete'
 THEN RETURN jsonb_build_object('status','complete','alreadyApplied',true,
  'revealed',v_award.revealed_count,'refreshed',v_award.refreshed_count); END IF;
 SELECT o.* INTO v_op FROM public.spy_operations o
  JOIN public.spy_mission_decisions d ON d.operation_id=o.id
  WHERE o.id=p_operation AND o.target_type='house'
   AND o.owner_house_id=(
    SELECT owner_house_id FROM public.spy_intelligence_dossiers
    WHERE id=v_award.dossier_id)
   AND d.resolution='success' AND o.status='completed';
 IF NOT FOUND THEN RAISE EXCEPTION 'Missão homologada não encontrada'; END IF;
 PERFORM 1 FROM public.spy_intelligence_dossiers
  WHERE id=v_award.dossier_id FOR UPDATE;
 v_catalog:=public.spy_intelligence_source_items(
  v_op.target_id,v_award.objective,p_resources);
 IF v_catalog IS NULL
 THEN RETURN jsonb_build_object('status','waiting_catalog'); END IF;
 v_observed_date:=public.spy_official_date_key();
 IF v_observed_date IS NULL OR NOT public.valid_campaign_date(v_observed_date)
 THEN RAISE EXCEPTION 'Data oficial inválida para confirmar inteligência'; END IF;
 IF public.spy_campaign_ordinal(v_observed_date)<
    public.spy_campaign_ordinal(v_award.campaign_date_key)
 THEN RAISE EXCEPTION 'HUB Temporal anterior à missão: reprocessamento bloqueado'; END IF;
 SELECT version INTO v_version FROM public.campaign_calendar WHERE id=true;
 IF v_version IS NULL THEN RAISE EXCEPTION 'HUB Temporal indisponível'; END IF;
 -- Dados omitidos e duplicações no inventário não geram segredos adicionais.
 FOR v_row IN
  SELECT item_key,item_snapshot FROM (
   SELECT DISTINCT ON(j.value->>'key')
    j.value->>'key' AS item_key,j.value->'snapshot' AS item_snapshot
   FROM jsonb_array_elements(v_catalog) AS j(value)
   WHERE nullif(j.value->>'key','') IS NOT NULL
    AND jsonb_typeof(j.value->'snapshot')='object'
    AND NOT EXISTS(
     SELECT 1 FROM public.spy_intelligence_findings f
     WHERE f.dossier_id=v_award.dossier_id AND f.objective=v_award.objective
      AND f.subject_key=j.value->>'key')
   ORDER BY j.value->>'key'
  ) unknown_items
  ORDER BY md5(p_operation::text||':'||item_key)
 LOOP
  EXIT WHEN v_new>=v_award.reveal_capacity;
  INSERT INTO public.spy_intelligence_findings(
   dossier_id,objective,subject_key,value_snapshot,
   discovered_operation_id,verified_operation_id,
   discovered_date_key,verified_date_key)
  VALUES(v_award.dossier_id,v_award.objective,v_row.item_key,v_row.item_snapshot,
   p_operation,p_operation,v_observed_date,v_observed_date);
  INSERT INTO public.spy_intelligence_events(
   dossier_id,operation_id,objective,subject_key,event_type,
   new_snapshot,campaign_date_key,calendar_version)
  VALUES(v_award.dossier_id,p_operation,v_award.objective,
   v_row.item_key,'revealed',v_row.item_snapshot,v_observed_date,v_version);
  v_new:=v_new+1;
 END LOOP;
 v_available:=v_award.reveal_capacity-v_new;
 IF v_available>0 THEN
  -- Revalidate only data known BEFORE this mission. Do not count a new
  -- discovery twice, and collapse repeated catalog entries by their key.
  FOR v_row IN
   SELECT item_key,old_snapshot,item_snapshot FROM (
    SELECT DISTINCT ON(f.subject_key)
     f.subject_key AS item_key,f.value_snapshot AS old_snapshot,
     j.value->'snapshot' AS item_snapshot
    FROM public.spy_intelligence_findings f
    JOIN jsonb_array_elements(v_catalog) AS j(value)
     ON j.value->>'key'=f.subject_key
    WHERE f.dossier_id=v_award.dossier_id AND f.objective=v_award.objective
     AND f.discovered_operation_id IS DISTINCT FROM p_operation
    ORDER BY f.subject_key
   ) previously_known
   ORDER BY md5(p_operation::text||':'||item_key)
   LIMIT v_available
  LOOP
   UPDATE public.spy_intelligence_findings SET
    value_snapshot=v_row.item_snapshot,
    verified_operation_id=p_operation,verified_date_key=v_observed_date,
    verified_at=now()
   WHERE dossier_id=v_award.dossier_id
    AND objective=v_award.objective AND subject_key=v_row.item_key;
   INSERT INTO public.spy_intelligence_events(
    dossier_id,operation_id,objective,subject_key,event_type,
    previous_snapshot,new_snapshot,campaign_date_key,calendar_version)
   VALUES(v_award.dossier_id,p_operation,v_award.objective,
    v_row.item_key,'refreshed',v_row.old_snapshot,v_row.item_snapshot,
    v_observed_date,v_version);
   v_refreshed:=v_refreshed+1;
  END LOOP;
 END IF;
 UPDATE public.spy_intelligence_mission_awards SET
  revealed_count=v_new,refreshed_count=v_refreshed,processing_state='complete'
 WHERE operation_id=p_operation;
 UPDATE public.spy_intelligence_dossiers SET updated_at=now()
 WHERE id=v_award.dossier_id;
 RETURN jsonb_build_object('status','complete','revealed',v_new,
  'refreshed',v_refreshed,'alreadyApplied',false);
END $finalize$;
REVOKE ALL ON FUNCTION public.spy_intelligence_finalize(uuid,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spy_intelligence_finalize(uuid,jsonb) TO authenticated;

-- P0.2: checagem explícita do resultado da missão: uma missão bem-sucedida
-- sem prêmio não pode ser confundida com um dossiê concluído.
CREATE OR REPLACE FUNCTION public.spy_intelligence_operation_status(p_operation uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $status$
DECLARE v_operation_status text;v_decision text;v_award_status text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
    OR NOT public.is_campaign_admin()
 THEN RAISE EXCEPTION 'Consulta de inteligência reservada ao Narrador'; END IF;
 SELECT o.status,d.resolution,a.processing_state
 INTO v_operation_status,v_decision,v_award_status
 FROM public.spy_operations o
 LEFT JOIN public.spy_mission_decisions d ON d.operation_id=o.id
 LEFT JOIN public.spy_intelligence_mission_awards a ON a.operation_id=o.id
 WHERE o.id=p_operation AND o.target_type='house';
 IF NOT FOUND THEN RAISE EXCEPTION 'Operação de espionagem não encontrada'; END IF;
 IF v_operation_status<>'completed' OR v_decision IS NULL
 THEN RETURN jsonb_build_object('status','pending_resolution'); END IF;
 IF v_decision<>'success'
 THEN RETURN jsonb_build_object('status','no_success_award'); END IF;
 IF v_award_status IS NULL
 THEN RETURN jsonb_build_object('status','missing_award'); END IF;
 RETURN jsonb_build_object('status',v_award_status);
END $status$;
REVOKE ALL ON FUNCTION public.spy_intelligence_operation_status(uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spy_intelligence_operation_status(uuid)
 TO authenticated;
COMMIT;
