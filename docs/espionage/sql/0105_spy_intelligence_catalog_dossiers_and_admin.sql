-- 0105 | Dossiês de espionagem — lote 4 (inventários) + lotes 5/6 (consultas).
-- Pré-requisito: 0104. Dados já descobertos ficam congelados até revalidação.
BEGIN;
SET LOCAL lock_timeout='8s';

-- As descobertas concedidas manualmente são administrativas, não missões fictícias.
ALTER TABLE public.spy_intelligence_findings
 ALTER COLUMN discovered_operation_id DROP NOT NULL,
 ALTER COLUMN verified_operation_id DROP NOT NULL;

CREATE TABLE IF NOT EXISTS public.spy_intelligence_admin_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 dossier_id uuid NOT NULL REFERENCES public.spy_intelligence_dossiers(id),
 objective text NOT NULL CHECK(objective IN('house_resources','army','possessions')),
 subject_key text NOT NULL,
 action text NOT NULL CHECK(action IN('reveal','revalidate','revoke')),
 before_snapshot jsonb,
 after_snapshot jsonb,
 campaign_date_key text NOT NULL CHECK(public.valid_campaign_date(campaign_date_key)),
 reason text NOT NULL CHECK(length(btrim(reason)) BETWEEN 10 AND 1200),
 actor uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS spy_intelligence_admin_audit_dossier_idx
 ON public.spy_intelligence_admin_audit(dossier_id,created_at DESC);
ALTER TABLE public.spy_intelligence_admin_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.spy_intelligence_admin_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.spy_intelligence_admin_audit TO service_role;

-- Catálogo seguro de itens atualmente disponíveis (APENAS no servidor).
-- NULL = fonte ausente ou não validada; [] = ficha operacional confirma ausência.
CREATE OR REPLACE FUNCTION public.spy_intelligence_source_items(
 p_target text,p_objective text,p_resources jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $catalog$
DECLARE v_state jsonb;v_stats record;v_items jsonb:='[]'::jsonb;
 v_item jsonb;v_key text;v_snapshot jsonb;v_resource text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
  OR NOT public.is_campaign_admin()
 THEN RAISE EXCEPTION 'Inventário de inteligência reservado ao Narrador'; END IF;
 IF p_objective NOT IN('house_resources','army','possessions')
 THEN RAISE EXCEPTION 'Modalidade inválida'; END IF;
 SELECT n.state INTO v_state FROM public.noble_house_sheets n
  WHERE n.house_id=p_target;
 IF p_objective='house_resources' THEN
  IF v_state IS NOT NULL THEN
   IF p_resources IS NULL OR jsonb_typeof(p_resources)<>'object'
   THEN RETURN NULL; END IF;
   FOREACH v_resource IN ARRAY ARRAY[
    'defense','influence','lands','law','power','population','wealth'
   ]::text[] LOOP
    IF jsonb_typeof(p_resources->v_resource)<>'number'
     OR (p_resources->>v_resource) !~ '^-?[0-9]{1,6}$'
    THEN RAISE EXCEPTION 'Valor de atributo inválido ou ausente: %',v_resource; END IF;
    v_snapshot:=jsonb_build_object('value',(p_resources->>v_resource)::integer,
     'source','operational_house_balances');
    v_items:=v_items||jsonb_build_array(jsonb_build_object(
     'key',v_resource,'snapshot',v_snapshot));
   END LOOP;
   RETURN v_items;
  END IF;
  SELECT * INTO v_stats FROM public.spy_noble_house_stats s WHERE s.house_id=p_target;
  IF NOT FOUND THEN RETURN NULL; END IF;
  FOREACH v_resource IN ARRAY ARRAY[
   'defense','influence','lands','law','power','population','wealth'
  ]::text[] LOOP
   v_items:=v_items||jsonb_build_array(jsonb_build_object(
    'key',v_resource,'snapshot',jsonb_build_object(
     'value',(to_jsonb(v_stats)->>v_resource)::integer,
     'source','official_noble_stats')));
  END LOOP;
  RETURN v_items;
 END IF;
 IF v_state IS NULL THEN RETURN NULL; END IF;
 IF p_objective='army' THEN
  FOR v_item IN
   SELECT u.value FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(v_state->'units')='array'
     THEN v_state->'units' ELSE '[]'::jsonb END) AS u(value)
   WHERE nullif(u.value->>'id','') IS NOT NULL
    AND coalesce(u.value->>'destroyed','false')<>'true'
  LOOP
   v_key:=v_item->>'id';
   v_snapshot:=jsonb_build_object(
    'name',coalesce(nullif(v_item->>'name',''),'Unidade sem nome'),
    'category','Unidade militar',
    'types',CASE WHEN jsonb_typeof(v_item->'types')='array'
     THEN v_item->'types' ELSE '[]'::jsonb END,
    'strength',v_item->'strength',
    'training',v_item->'training',
    'source','operational_army');
   v_items:=v_items||jsonb_build_array(jsonb_build_object(
    'key',v_key,'snapshot',v_snapshot));
  END LOOP;
 ELSIF p_objective='possessions' THEN
  FOR v_item IN
   SELECT d.value FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(v_state->'domains')='array'
     THEN v_state->'domains' ELSE '[]'::jsonb END) AS d(value)
   WHERE nullif(d.value->>'id','') IS NOT NULL
  LOOP
   v_key:='domain:'||(v_item->>'id');
   v_snapshot:=jsonb_build_object(
    'name',coalesce(nullif(v_item->>'name',''),'Domínio'),
    'category','Domínio','source','operational_domains');
   v_items:=v_items||jsonb_build_array(jsonb_build_object(
    'key',v_key,'snapshot',v_snapshot));
  END LOOP;
  FOR v_item IN
   SELECT h.value FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(v_state->'holdings')='array'
     THEN v_state->'holdings' ELSE '[]'::jsonb END) AS h(value)
   WHERE nullif(h.value->>'id','') IS NOT NULL
    AND h.value->>'status'='active'
  LOOP
   v_key:='holding:'||(v_item->>'id');
   v_snapshot:=jsonb_build_object(
    'name',coalesce(nullif(v_item->>'name',''),'Posse adquirida'),
    'category',coalesce(nullif(v_item->>'category',''),'Posse'),
    'source','operational_holdings');
   v_items:=v_items||jsonb_build_array(jsonb_build_object(
    'key',v_key,'snapshot',v_snapshot));
  END LOOP;
 END IF;
 RETURN v_items;
END $catalog$;

-- Executada pelo Narrador APÓS a resolução oficial (idempotente por operação).
-- Preserva a data efetiva registrada em 0104, sem inventar missões históricas.
CREATE OR REPLACE FUNCTION public.spy_intelligence_finalize(
 p_operation uuid,p_resources jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,pg_temp AS $finalize$
DECLARE v_award record;v_op record;v_catalog jsonb;v_row record;
 v_seen jsonb;v_snapshot jsonb;v_previous jsonb;v_version integer;
 v_new integer:=0;v_refreshed integer:=0;v_available integer;
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
   p_operation,p_operation,v_award.campaign_date_key,v_award.campaign_date_key);
  INSERT INTO public.spy_intelligence_events(
   dossier_id,operation_id,objective,subject_key,event_type,
   new_snapshot,campaign_date_key,calendar_version)
  VALUES(v_award.dossier_id,p_operation,v_award.objective,
   v_row.item_key,'revealed',v_row.item_snapshot,v_award.campaign_date_key,v_version);
  v_new:=v_new+1;
 END LOOP;
 v_available:=v_award.reveal_capacity-v_new;
 IF v_available>0 THEN
  FOR v_row IN
   SELECT f.subject_key AS item_key,f.value_snapshot AS old_snapshot,
    j.value->'snapshot' AS item_snapshot
   FROM public.spy_intelligence_findings f
   JOIN jsonb_array_elements(v_catalog) AS j(value)
    ON j.value->>'key'=f.subject_key
   WHERE f.dossier_id=v_award.dossier_id AND f.objective=v_award.objective
   ORDER BY md5(p_operation::text||':'||f.subject_key)
   LIMIT v_available
  LOOP
   UPDATE public.spy_intelligence_findings SET
    value_snapshot=v_row.item_snapshot,
    verified_operation_id=p_operation,verified_date_key=v_award.campaign_date_key,
    verified_at=now()
   WHERE dossier_id=v_award.dossier_id
    AND objective=v_award.objective AND subject_key=v_row.item_key;
   INSERT INTO public.spy_intelligence_events(
    dossier_id,operation_id,objective,subject_key,event_type,
    previous_snapshot,new_snapshot,campaign_date_key,calendar_version)
   VALUES(v_award.dossier_id,p_operation,v_award.objective,
    v_row.item_key,'refreshed',v_row.old_snapshot,v_row.item_snapshot,
    v_award.campaign_date_key,v_version);
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

-- Read only the captured snapshots — NEVER query the live target to fill blanks.
CREATE OR REPLACE FUNCTION public.spy_intelligence_read(p_house text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $read$
DECLARE v_rows jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
 THEN RAISE EXCEPTION 'Sessão não autorizada'; END IF;
 IF public.is_campaign_admin() THEN
  NULL;
 ELSIF p_house IS NULL OR NOT public.in_campaign_house(p_house,false)
 THEN RAISE EXCEPTION 'Acesso não autorizado ao dossiê desta Casa'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',d.id,'ownerHouseId',d.owner_house_id,'targetHouseId',d.target_house_id,
  'ownerHouseName',coalesce(oc.name,d.owner_house_id),
  'targetHouseName',coalesce(tc.name,d.target_house_id),
  'targetRegion',tc.region,
  'updatedAt',d.updated_at,
  'findings',coalesce((
   SELECT jsonb_agg(jsonb_build_object(
    'id',f.id,'objective',f.objective,'key',f.subject_key,
    'snapshot',f.value_snapshot,'discoveredDate',f.discovered_date_key,
    'verifiedDate',f.verified_date_key)
    ORDER BY f.verified_at DESC,f.subject_key)
   FROM public.spy_intelligence_findings f WHERE f.dossier_id=d.id),
   '[]'::jsonb),
  'history',coalesce((
   SELECT jsonb_agg(jsonb_build_object(
    'id',e.id,'objective',e.objective,'key',e.subject_key,
    'action',e.event_type,'dateKey',e.campaign_date_key,
    'oldSnapshot',e.previous_snapshot,'newSnapshot',e.new_snapshot)
    ORDER BY e.created_at DESC)
   FROM public.spy_intelligence_events e WHERE e.dossier_id=d.id),
   '[]'::jsonb),
  'adminHistory',CASE WHEN public.is_campaign_admin() THEN
   coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',a.id,'objective',a.objective,'key',a.subject_key,
    'action',a.action,'dateKey',a.campaign_date_key,'reason',a.reason)
    ORDER BY a.created_at DESC)
    FROM public.spy_intelligence_admin_audit a WHERE a.dossier_id=d.id),
    '[]'::jsonb)
   ELSE '[]'::jsonb END
 ) ORDER BY d.updated_at DESC),'[]'::jsonb) INTO v_rows
 FROM public.spy_intelligence_dossiers d
 LEFT JOIN public.house_catalog oc ON oc.id=d.owner_house_id
 LEFT JOIN public.house_catalog tc ON tc.id=d.target_house_id
 WHERE public.is_campaign_admin() AND (p_house IS NULL OR d.owner_house_id=p_house)
    OR (NOT public.is_campaign_admin() AND d.owner_house_id=p_house);
 RETURN v_rows;
END $read$;

-- Admin actions are audited; granting requires an actual item from the
-- active official inventory. For an operational resource, server supplies
-- balances(state).total, never a public player's request.
CREATE OR REPLACE FUNCTION public.spy_intelligence_admin_action(
 p_dossier uuid,p_objective text,p_subject_key text,p_action text,
 p_reason text,p_resources jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,pg_temp AS $admin$
DECLARE v_dossier record;v_catalog jsonb;v_snapshot jsonb;
 v_previous jsonb;v_day text;v_old record;v_count integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
  OR NOT public.is_campaign_admin()
 THEN RAISE EXCEPTION 'Somente o Narrador pode alterar dossiês'; END IF;
 IF p_action NOT IN('reveal','revalidate','revoke')
  OR p_objective NOT IN('house_resources','army','possessions')
  OR p_subject_key IS NULL OR length(p_subject_key) NOT BETWEEN 1 AND 160
  OR length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 1200
 THEN RAISE EXCEPTION 'Alteração inválida'; END IF;
 SELECT * INTO v_dossier FROM public.spy_intelligence_dossiers
  WHERE id=p_dossier FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Dossiê inexistente'; END IF;
 SELECT * INTO v_old FROM public.spy_intelligence_findings f
  WHERE f.dossier_id=p_dossier AND f.objective=p_objective
   AND f.subject_key=p_subject_key FOR UPDATE;
 IF p_action='revoke' THEN
  IF NOT FOUND THEN RAISE EXCEPTION 'Conhecimento já ausente'; END IF;
  v_previous:=v_old.value_snapshot;
  DELETE FROM public.spy_intelligence_findings
  WHERE dossier_id=p_dossier AND objective=p_objective
   AND subject_key=p_subject_key;
 ELSE
  v_previous:=CASE WHEN FOUND THEN v_old.value_snapshot ELSE NULL END;
  IF p_action='revalidate' AND v_previous IS NULL
  THEN RAISE EXCEPTION 'Conhecimento não encontrado para revalidar'; END IF;
  v_catalog:=public.spy_intelligence_source_items(
   v_dossier.target_house_id,p_objective,p_resources);
  IF v_catalog IS NULL THEN RAISE EXCEPTION 'Fonte oficial indisponível'; END IF;
  SELECT j.value->'snapshot' INTO v_snapshot
   FROM jsonb_array_elements(v_catalog) AS j(value)
   WHERE j.value->>'key'=p_subject_key LIMIT 1;
  IF v_snapshot IS NULL THEN RAISE EXCEPTION 'Informação não existe no inventário oficial'; END IF;
  v_day:=public.spy_official_date_key();
  INSERT INTO public.spy_intelligence_findings(
   dossier_id,objective,subject_key,value_snapshot,
   discovered_operation_id,verified_operation_id,
   discovered_date_key,verified_date_key)
  VALUES(p_dossier,p_objective,p_subject_key,v_snapshot,NULL,NULL,v_day,v_day)
  ON CONFLICT(dossier_id,objective,subject_key) DO UPDATE SET
   value_snapshot=EXCLUDED.value_snapshot,
   verified_date_key=EXCLUDED.verified_date_key,verified_at=now(),
   verified_operation_id=NULL;
 END IF;
 IF v_day IS NULL THEN v_day:=public.spy_official_date_key(); END IF;
 INSERT INTO public.spy_intelligence_admin_audit(
  dossier_id,objective,subject_key,action,before_snapshot,
  after_snapshot,campaign_date_key,reason,actor)
 VALUES(p_dossier,p_objective,p_subject_key,p_action,
  v_previous,v_snapshot,v_day,btrim(p_reason),auth.uid());
 UPDATE public.spy_intelligence_dossiers SET updated_at=now() WHERE id=p_dossier;
 SELECT count(*) INTO v_count FROM public.spy_intelligence_findings
  WHERE dossier_id=p_dossier AND objective=p_objective;
 RETURN jsonb_build_object('status','applied','knownCount',v_count);
END $admin$;

-- Narrator-only pending operations and official item keys for the admin controls.
CREATE OR REPLACE FUNCTION public.spy_intelligence_admin_options(p_dossier uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $options$
DECLARE v_d record;v_state jsonb;v_items jsonb:='[]'::jsonb;
 v_objective text;v_catalog jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
  OR NOT public.is_campaign_admin()
 THEN RAISE EXCEPTION 'Consulta administrativa não autorizada'; END IF;
 SELECT * INTO v_d FROM public.spy_intelligence_dossiers WHERE id=p_dossier;
 IF NOT FOUND THEN RAISE EXCEPTION 'Dossiê não encontrado'; END IF;
 FOR v_objective IN SELECT unnest(ARRAY['house_resources','army','possessions']::text[])
 LOOP
  IF v_objective='house_resources' THEN
   v_catalog:=(SELECT jsonb_agg(jsonb_build_object('key',k,'snapshot','{}'::jsonb))
    FROM unnest(ARRAY['defense','influence','lands','law','power',
     'population','wealth']::text[]) k);
  ELSE
   v_catalog:=public.spy_intelligence_source_items(v_d.target_house_id,v_objective);
  END IF;
  IF v_catalog IS NOT NULL THEN
   SELECT v_items||coalesce(jsonb_agg(jsonb_build_object(
    'objective',v_objective,'key',j.value->>'key',
    'name',coalesce(j.value#>>'{snapshot,name}',j.value->>'key'))
    ORDER BY j.value->>'key'),'[]'::jsonb) INTO v_items
   FROM jsonb_array_elements(v_catalog) j(value);
  END IF;
 END LOOP;
 -- Posses destruídas/unidades dissolvidas podem continuar conhecidas
 -- historicamente. A revogação deve continuar acessível ao Narrador.
 SELECT v_items||coalesce(jsonb_agg(jsonb_build_object(
  'objective',f.objective,'key',f.subject_key,
  'name',coalesce(f.value_snapshot->>'name',f.subject_key))
  ORDER BY f.objective,f.subject_key),'[]'::jsonb) INTO v_items
 FROM public.spy_intelligence_findings f
 WHERE f.dossier_id=p_dossier AND NOT EXISTS(
  SELECT 1 FROM jsonb_array_elements(v_items) j(value)
  WHERE j.value->>'objective'=f.objective
   AND j.value->>'key'=f.subject_key);
 RETURN v_items;
END $options$;

CREATE OR REPLACE FUNCTION public.spy_intelligence_admin_pending()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $pending$
DECLARE v_result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
  OR NOT public.is_campaign_admin()
 THEN RAISE EXCEPTION 'Consulta administrativa não autorizada'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'operationId',a.operation_id,'objective',a.objective,
  'ownerHouseId',d.owner_house_id,'targetHouseId',d.target_house_id,
  'dateKey',a.campaign_date_key,'capacity',a.reveal_capacity)
 ORDER BY a.created_at DESC),'[]'::jsonb)
 INTO v_result FROM public.spy_intelligence_mission_awards a
 JOIN public.spy_intelligence_dossiers d ON d.id=a.dossier_id
 WHERE a.processing_state='waiting_catalog';
 RETURN v_result;
END $pending$;

REVOKE ALL ON FUNCTION public.spy_intelligence_source_items(text,text,jsonb)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.spy_intelligence_finalize(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.spy_intelligence_read(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.spy_intelligence_admin_action(uuid,text,text,text,text,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.spy_intelligence_admin_options(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.spy_intelligence_admin_pending() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spy_intelligence_finalize(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.spy_intelligence_read(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.spy_intelligence_admin_action(uuid,text,text,text,text,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.spy_intelligence_admin_options(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.spy_intelligence_admin_pending() TO authenticated;
COMMIT;
