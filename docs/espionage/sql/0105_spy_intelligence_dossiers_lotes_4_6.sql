-- 0105 | Dossiês de Espionagem · lotes 4–6.
-- Fontes oficiais, consultas por Casa, painel do Narrador e auditoria.
BEGIN;
SET LOCAL lock_timeout='8s';

-- Administração pode conceder/revogar uma descoberta sem falsificar missão.
ALTER TABLE public.spy_intelligence_findings
 ALTER COLUMN discovered_operation_id DROP NOT NULL,
 ALTER COLUMN verified_operation_id DROP NOT NULL;
ALTER TABLE public.spy_intelligence_events
 ALTER COLUMN operation_id DROP NOT NULL;
CREATE TABLE IF NOT EXISTS public.spy_intelligence_admin_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 dossier_id uuid NOT NULL REFERENCES public.spy_intelligence_dossiers(id),
 objective text NOT NULL CHECK(objective IN('house_resources','army','possessions')),
 subject_key text NOT NULL,
 action text NOT NULL CHECK(action IN('reveal','revalidate','revoke')),
 reason text NOT NULL CHECK(char_length(btrim(reason)) BETWEEN 10 AND 1200),
 previous_snapshot jsonb,
 new_snapshot jsonb,
 campaign_date_key text NOT NULL CHECK(public.valid_campaign_date(campaign_date_key)),
 actor uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.spy_intelligence_admin_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.spy_intelligence_admin_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.spy_intelligence_admin_audit TO service_role;

-- Only authoritative ACTIVE items and non-destroyed units. Do not read
-- planned purchases, other houses' sheets or private data in the browser.
CREATE OR REPLACE FUNCTION public.spy_intelligence_catalog(
 p_target text,p_objective text,p_resources jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $catalog$
DECLARE v_state jsonb;v_result jsonb;v_stats jsonb;v_resources jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
  OR NOT public.is_campaign_admin()
 THEN RAISE EXCEPTION 'Catálogo privado: acesso exclusivo ao Narrador'; END IF;
 IF p_objective NOT IN ('house_resources','army','possessions')
 THEN RAISE EXCEPTION 'Modalidade inválida'; END IF;
 SELECT n.state INTO v_state FROM public.noble_house_sheets n
  WHERE n.house_id=p_target;
 IF p_objective='house_resources' THEN
  IF v_state IS NOT NULL THEN
   IF jsonb_typeof(p_resources)<>'object'
   THEN RETURN NULL; END IF;
   v_resources:=p_resources;
  ELSE
   SELECT to_jsonb(s) INTO v_resources
    FROM public.spy_noble_house_stats s WHERE s.house_id=p_target;
   IF v_resources IS NULL THEN RETURN NULL; END IF;
  END IF;
  IF EXISTS(SELECT 1 FROM unnest(ARRAY[
   'defense','influence','lands','law','power','population','wealth'
  ]::text[]) k WHERE NOT(v_resources?k)
   OR jsonb_typeof(v_resources->k)<>'number')
  THEN RAISE EXCEPTION 'Atributos oficiais incompletos'; END IF;
  SELECT coalesce(jsonb_object_agg(k,jsonb_build_object(
   'value',(v_resources->>k)::integer,
   'source',CASE WHEN v_state IS NULL THEN 'official_noble_stats' ELSE 'operational_sheet' END
  )),'{}'::jsonb) INTO v_result
  FROM unnest(ARRAY['defense','influence','lands','law','power','population','wealth']::text[]) k;
  RETURN v_result;
 END IF;
 IF v_state IS NULL THEN RETURN NULL; END IF;
 IF p_objective='army' THEN
  SELECT coalesce(jsonb_object_agg(u->>'id',jsonb_build_object(
   'name',coalesce(nullif(u->>'name',''),'Unidade'),
   'types',coalesce(u->'types','[]'::jsonb),
   'strength',CASE WHEN u->>'strength' ~ '^[0-9]+$'
    THEN (u->>'strength')::integer ELSE NULL END
  )),'{}'::jsonb) INTO v_result
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_state->'units')='array'
   THEN v_state->'units' ELSE '[]'::jsonb END) u
  WHERE coalesce(u->>'id','')<>'' AND coalesce(u->>'destroyed','false')<>'true';
 ELSE
  SELECT coalesce(jsonb_object_agg(p.key,p.snapshot),'{}'::jsonb)
  INTO v_result FROM (
   SELECT 'holding:'||(h->>'id') AS key,jsonb_build_object(
    'name',coalesce(nullif(h->>'name',''),'Posse'),
    'category',coalesce(h->>'category','Posse'),
    'domainId',h->>'domainId') AS snapshot
   FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_state->'holdings')='array'
    THEN v_state->'holdings' ELSE '[]'::jsonb END) h
   WHERE h->>'status'='active' AND coalesce(h->>'id','')<>''
   UNION ALL
   SELECT 'domain:'||(d->>'id') AS key,jsonb_build_object(
    'name',coalesce(nullif(d->>'name',''),'Domínio'),
    'category','Terras e Domínios') AS snapshot
   FROM jsonb_array_elements(CASE WHEN jsonb_typeof(v_state->'domains')='array'
    THEN v_state->'domains' ELSE '[]'::jsonb END) d
   WHERE coalesce(d->>'id','')<>''
  ) p;
 END IF;
 RETURN v_result;
END $catalog$;

-- Materialize adjudicated success only. Row-level locks + immutable award
-- ensure that two narrator retries cannot duplicate or overwrite history.
CREATE OR REPLACE FUNCTION public.spy_intelligence_finalize(
 p_operation uuid,p_resources jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,pg_temp AS $finalize$
DECLARE v_award record;v_op record;v_catalog jsonb;v_key text;
 v_snapshot jsonb;v_prior jsonb;v_calendar int;v_new int:=0;v_refresh int:=0;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
  OR NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Narrador obrigatório'; END IF;
 SELECT a.* INTO v_award FROM public.spy_intelligence_mission_awards a
 WHERE a.operation_id=p_operation FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('status','no_success_award'); END IF;
 IF v_award.processing_state='complete' THEN
  RETURN jsonb_build_object('status','complete','revealed',v_award.revealed_count,
   'refreshed',v_award.refreshed_count);
 END IF;
 SELECT o.* INTO v_op FROM public.spy_operations o WHERE o.id=p_operation;
 IF NOT FOUND OR v_op.status<>'completed' OR v_op.target_type<>'house'
  OR NOT EXISTS(SELECT 1 FROM public.spy_mission_decisions d
   WHERE d.operation_id=p_operation AND d.resolution='success')
 THEN RAISE EXCEPTION 'Missão sem resultado oficial aprovado'; END IF;
 v_catalog:=public.spy_intelligence_catalog(v_op.target_id,v_award.objective,p_resources);
 IF v_catalog IS NULL THEN RETURN jsonb_build_object('status','waiting_catalog'); END IF;
 SELECT version INTO v_calendar FROM public.campaign_calendar WHERE id=true;
 IF v_calendar IS NULL THEN RAISE EXCEPTION 'Hub Temporal indisponível'; END IF;
 -- Never select the same key twice, even with duplicate/retried requests.
 FOR v_key IN
  SELECT k FROM jsonb_object_keys(v_catalog) AS k
  WHERE NOT EXISTS(SELECT 1 FROM public.spy_intelligence_findings f
   WHERE f.dossier_id=v_award.dossier_id AND f.objective=v_award.objective
    AND f.subject_key=k)
  ORDER BY md5(p_operation::text||':'||k)
  LIMIT v_award.reveal_capacity
 LOOP
  v_snapshot:=v_catalog->v_key;
  INSERT INTO public.spy_intelligence_findings(
   dossier_id,objective,subject_key,value_snapshot,discovered_operation_id,
   verified_operation_id,discovered_date_key,verified_date_key)
  VALUES(v_award.dossier_id,v_award.objective,v_key,v_snapshot,p_operation,
   p_operation,v_award.campaign_date_key,v_award.campaign_date_key);
  INSERT INTO public.spy_intelligence_events(
   dossier_id,operation_id,objective,subject_key,event_type,
   new_snapshot,campaign_date_key,calendar_version)
  VALUES(v_award.dossier_id,p_operation,v_award.objective,v_key,'revealed',
   v_snapshot,v_award.campaign_date_key,v_calendar);
  v_new:=v_new+1;
 END LOOP;
 FOR v_key,v_prior IN
  SELECT f.subject_key,f.value_snapshot
  FROM public.spy_intelligence_findings f
  WHERE f.dossier_id=v_award.dossier_id AND f.objective=v_award.objective
   AND v_catalog ? f.subject_key AND f.discovered_operation_id IS DISTINCT FROM p_operation
  ORDER BY md5(p_operation::text||':'||f.subject_key)
  LIMIT (v_award.reveal_capacity-v_new)
 LOOP
  v_snapshot:=v_catalog->v_key;
  UPDATE public.spy_intelligence_findings SET
   value_snapshot=v_snapshot,verified_operation_id=p_operation,
   verified_date_key=v_award.campaign_date_key,verified_at=now()
  WHERE dossier_id=v_award.dossier_id AND objective=v_award.objective
   AND subject_key=v_key;
  INSERT INTO public.spy_intelligence_events(
   dossier_id,operation_id,objective,subject_key,event_type,
   previous_snapshot,new_snapshot,campaign_date_key,calendar_version)
  VALUES(v_award.dossier_id,p_operation,v_award.objective,v_key,
   'refreshed',v_prior,v_snapshot,v_award.campaign_date_key,v_calendar);
  v_refresh:=v_refresh+1;
 END LOOP;
 UPDATE public.spy_intelligence_mission_awards SET
  processing_state='complete',revealed_count=v_new,refreshed_count=v_refresh
 WHERE operation_id=p_operation;
 UPDATE public.spy_intelligence_dossiers SET updated_at=now()
  WHERE id=v_award.dossier_id;
 RETURN jsonb_build_object('status','complete','revealed',v_new,'refreshed',v_refresh);
END $finalize$;

-- Filter both at RPC boundary and per-owner. No SELECT grants to players.
CREATE OR REPLACE FUNCTION public.spy_intelligence_read(p_house text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $read$
DECLARE v_admin boolean;v_rows jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
 THEN RAISE EXCEPTION 'Sessão de campanha não autorizada'; END IF;
 v_admin:=public.is_campaign_admin();
 IF p_house IS NULL AND NOT v_admin
 THEN RAISE EXCEPTION 'Somente o Narrador consulta todos os dossiês'; END IF;
 IF p_house IS NOT NULL AND NOT(v_admin OR public.in_campaign_house(p_house,false))
 THEN RAISE EXCEPTION 'Casa investigadora não autorizada'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',d.id,'ownerHouseId',d.owner_house_id,'targetHouseId',d.target_house_id,
  'ownerHouseName',coalesce(oc.name,d.owner_house_id),
  'targetHouseName',coalesce(tc.name,d.target_house_id),
  'targetRegion',tc.region,'updatedAt',d.updated_at,
  'findings',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'id',f.id,'objective',f.objective,'key',f.subject_key,
   'snapshot',f.value_snapshot,'discoveredDate',f.discovered_date_key,
   'verifiedDate',f.verified_date_key) ORDER BY f.discovered_at)
   FROM public.spy_intelligence_findings f WHERE f.dossier_id=d.id),'[]'::jsonb),
  'history',coalesce((SELECT jsonb_agg(jsonb_build_object(
   'id',e.id,'objective',e.objective,'key',e.subject_key,
   'action',e.event_type,'dateKey',e.campaign_date_key,
   'oldSnapshot',e.previous_snapshot,'newSnapshot',e.new_snapshot)
   ORDER BY e.created_at DESC) FROM public.spy_intelligence_events e
   WHERE e.dossier_id=d.id),'[]'::jsonb),
  'adminHistory',CASE WHEN v_admin THEN
   coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',a.id,'objective',a.objective,'key',a.subject_key,
    'action',a.action,'dateKey',a.campaign_date_key,'reason',a.reason)
    ORDER BY a.created_at DESC) FROM public.spy_intelligence_admin_audit a
    WHERE a.dossier_id=d.id),'[]'::jsonb)
   ELSE '[]'::jsonb END
 ) ORDER BY d.updated_at DESC),'[]'::jsonb) INTO v_rows
 FROM public.spy_intelligence_dossiers d
 LEFT JOIN public.house_catalog tc ON tc.id=d.target_house_id
 LEFT JOIN public.house_catalog oc ON oc.id=d.owner_house_id
 WHERE p_house IS NULL OR d.owner_house_id=p_house;
 RETURN v_rows;
END $read$;

CREATE OR REPLACE FUNCTION public.spy_intelligence_admin_pending()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $pending$
DECLARE v_rows jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
  OR NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Somente Narrador'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'operationId',a.operation_id,'objective',a.objective,
  'ownerHouseId',d.owner_house_id,'targetHouseId',d.target_house_id,
  'dateKey',a.campaign_date_key,'capacity',a.reveal_capacity)
  ORDER BY a.created_at DESC),'[]'::jsonb) INTO v_rows
 FROM public.spy_intelligence_mission_awards a
 JOIN public.spy_intelligence_dossiers d ON d.id=a.dossier_id
 WHERE a.processing_state='waiting_catalog';
 RETURN v_rows;
END $pending$;

CREATE OR REPLACE FUNCTION public.spy_intelligence_admin_options(p_dossier uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $options$
DECLARE v_dossier record;v_rows jsonb;v_catalog jsonb;v_objective text;v_key text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
  OR NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Somente Narrador'; END IF;
 SELECT * INTO v_dossier FROM public.spy_intelligence_dossiers
  WHERE id=p_dossier;
 IF NOT FOUND THEN RETURN '[]'::jsonb; END IF;
 v_rows:='[]'::jsonb;
 FOR v_objective IN SELECT unnest(ARRAY['house_resources','army','possessions']::text[]) LOOP
  v_catalog:=public.spy_intelligence_catalog(v_dossier.target_house_id,v_objective);
  IF v_objective='house_resources' AND v_catalog IS NULL THEN
   -- Resource keys available as choices even if operational snapshot pending.
   FOR v_key IN SELECT unnest(ARRAY[
    'defense','influence','lands','law','power','population','wealth']::text[]) LOOP
    v_rows:=v_rows||jsonb_build_array(jsonb_build_object(
     'objective',v_objective,'key',v_key,'name',v_key));
   END LOOP;
  ELSIF v_catalog IS NOT NULL THEN
   FOR v_key IN SELECT jsonb_object_keys(v_catalog) LOOP
    v_rows:=v_rows||jsonb_build_array(jsonb_build_object(
     'objective',v_objective,'key',v_key,
     'name',coalesce(v_catalog->v_key->>'name',v_key)));
   END LOOP;
  END IF;
 END LOOP;
 RETURN v_rows;
END $options$;

CREATE OR REPLACE FUNCTION public.spy_intelligence_admin_action(
 p_dossier uuid,p_objective text,p_subject_key text,p_action text,
 p_reason text,p_resources jsonb DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,pg_temp AS $admin$
DECLARE v_dossier record;v_catalog jsonb;v_snapshot jsonb;v_old jsonb;
 v_date text;v_count int;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
  OR NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Somente Narrador'; END IF;
 IF p_objective NOT IN('house_resources','army','possessions')
  OR p_action NOT IN('reveal','revalidate','revoke')
  OR char_length(btrim(coalesce(p_reason,''))) NOT BETWEEN 10 AND 1200
 THEN RAISE EXCEPTION 'Intervenção inválida'; END IF;
 SELECT * INTO v_dossier FROM public.spy_intelligence_dossiers
  WHERE id=p_dossier FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Dossiê não encontrado'; END IF;
 SELECT f.value_snapshot INTO v_old FROM public.spy_intelligence_findings f
 WHERE f.dossier_id=p_dossier AND f.objective=p_objective
  AND f.subject_key=p_subject_key;
 IF p_action='revoke' THEN
  IF v_old IS NULL THEN RAISE EXCEPTION 'Segredo ainda não descoberto'; END IF;
  DELETE FROM public.spy_intelligence_findings f
   WHERE f.dossier_id=p_dossier AND f.objective=p_objective AND f.subject_key=p_subject_key;
 ELSE
  v_catalog:=public.spy_intelligence_catalog(
   v_dossier.target_house_id,p_objective,p_resources);
  IF v_catalog IS NULL OR NOT(v_catalog ? p_subject_key)
  THEN RAISE EXCEPTION 'Registro oficial do segredo indisponível'; END IF;
  v_snapshot:=v_catalog->p_subject_key;
  IF p_action='revalidate' AND v_old IS NULL
  THEN RAISE EXCEPTION 'Não há conhecimento anterior para revalidar'; END IF;
  IF p_action='reveal' AND v_old IS NOT NULL
  THEN RAISE EXCEPTION 'Segredo já conhecido'; END IF;
  INSERT INTO public.spy_intelligence_findings(
   dossier_id,objective,subject_key,value_snapshot,
   discovered_date_key,verified_date_key)
  VALUES(p_dossier,p_objective,p_subject_key,v_snapshot,
   public.spy_official_date_key(),public.spy_official_date_key())
  ON CONFLICT(dossier_id,objective,subject_key) DO UPDATE SET
   value_snapshot=EXCLUDED.value_snapshot,verified_at=now(),
   verified_date_key=EXCLUDED.verified_date_key,
   verified_operation_id=NULL;
 END IF;
 v_date:=public.spy_official_date_key();
 INSERT INTO public.spy_intelligence_admin_audit(
  dossier_id,objective,subject_key,action,reason,previous_snapshot,
  new_snapshot,campaign_date_key,actor)
 VALUES(p_dossier,p_objective,p_subject_key,p_action,btrim(p_reason),
  v_old,v_snapshot,v_date,auth.uid());
 UPDATE public.spy_intelligence_dossiers SET updated_at=now() WHERE id=p_dossier;
 SELECT count(*) INTO v_count FROM public.spy_intelligence_findings f
  WHERE f.dossier_id=p_dossier AND f.objective=p_objective;
 RETURN jsonb_build_object('status','applied','knownCount',v_count);
END $admin$;

-- SECURITY DEFINER functions have a narrow, explicit execution surface.
REVOKE ALL ON FUNCTION public.spy_intelligence_catalog(text,text,jsonb) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.spy_intelligence_finalize(uuid,jsonb) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.spy_intelligence_read(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.spy_intelligence_admin_pending() FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.spy_intelligence_admin_options(uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.spy_intelligence_admin_action(uuid,text,text,text,text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spy_intelligence_finalize(uuid,jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.spy_intelligence_read(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.spy_intelligence_admin_pending() TO authenticated;
GRANT EXECUTE ON FUNCTION public.spy_intelligence_admin_options(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.spy_intelligence_admin_action(uuid,text,text,text,text,jsonb) TO authenticated;
COMMIT;
