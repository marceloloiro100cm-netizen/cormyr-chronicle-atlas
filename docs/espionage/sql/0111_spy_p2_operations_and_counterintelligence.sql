-- 0111 | Espionagem P2 — painel de operações do Narrador e alertas passivos.
-- Somente leitura. Sem mudar missão, saldo, XP, fichas ou calendário.
-- Depende de 0102, 0104 e 0107. Não autoriza leitura cruzada de agentes.
BEGIN;
SET LOCAL lock_timeout='8s';

CREATE OR REPLACE FUNCTION public.spy_narrator_operations_dashboard()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $operations$
DECLARE v_rows jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
    OR NOT public.is_campaign_admin()
 THEN RAISE EXCEPTION 'Painel de operações exclusivo do Narrador'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'operationId',s.id,
  'ownerHouseId',s.owner_house_id,
  'ownerHouseName',s.owner_name,
  'targetHouseId',s.target_id,
  'targetHouseName',s.target_name,
  'agentName',s.agent_name,
  'agentStatus',s.agent_status,
  'status',s.status,
  'objective',s.objective,
  'departureKey',s.departure_key,
  'arrivalKey',s.arrival_key,
  'investigationEndKey',s.investigation_end_key,
  'outcome',s.outcome,
  'intelligenceStatus',s.intelligence_status,
  'createdAt',s.created_at
 ) ORDER BY s.priority,s.created_at DESC,s.id),'[]'::jsonb)
 INTO v_rows
 FROM (
  SELECT o.id,o.owner_house_id,
   coalesce(h.name,oc.name,o.owner_house_id) AS owner_name,
   o.target_id,coalesce(tc.name,o.target_id) AS target_name,
   coalesce(a.codename,'Agente histórico') AS agent_name,
   a.status AS agent_status,o.status,
   CASE WHEN o.requested_fields[1] IN ('house_resources','army','possessions')
    THEN o.requested_fields[1] ELSE 'house_resources' END AS objective,
   t.departure_key,t.arrival_key,t.investigation_end_key,
   d.resolution AS outcome,
   aw.processing_state AS intelligence_status,
   o.created_at,
   CASE WHEN o.status='pending_narrator_review' THEN 0
    WHEN o.status IN('traveling','operating','returning','planned') THEN 1
    ELSE 2 END AS priority
  FROM public.spy_operations o
  LEFT JOIN public.campaign_houses h ON h.id=o.owner_house_id
  LEFT JOIN public.house_catalog oc ON oc.id=o.owner_house_id
  LEFT JOIN public.house_catalog tc ON tc.id=o.target_id
  LEFT JOIN public.spy_assets a ON a.id=o.asset_id
  LEFT JOIN public.spy_mission_timeline t ON t.operation_id=o.id
  LEFT JOIN LATERAL (
   SELECT x.resolution FROM public.spy_mission_decisions x
   WHERE x.operation_id=o.id ORDER BY x.created_at DESC,x.id DESC LIMIT 1
  ) d ON true
  LEFT JOIN public.spy_intelligence_mission_awards aw ON aw.operation_id=o.id
  WHERE o.target_type='house'
  ORDER BY priority,o.created_at DESC,o.id
  LIMIT 1200
 ) s;
 RETURN v_rows;
END $operations$;
REVOKE ALL ON FUNCTION public.spy_narrator_operations_dashboard() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spy_narrator_operations_dashboard() TO authenticated;

-- A Casa atacada só recebe avisos APÓS detecção com resultado homologado.
-- Não expõe nome, origem, identidade, objetivo, ID ou ficha de espião inimigo.
-- Sem eventos de descoberta, retorna vazio (não revela missões ocultas).
CREATE OR REPLACE FUNCTION public.spy_house_counterintelligence(p_house text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $counter$
DECLARE v_recent jsonb;v_total integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
   OR nullif(btrim(coalesce(p_house,'')),'') IS NULL
   OR NOT(public.is_campaign_admin() OR public.in_campaign_house(p_house,false))
 THEN RAISE EXCEPTION 'Contraespionagem não autorizada para esta Casa'; END IF;
 SELECT count(*) INTO v_total FROM (
  SELECT DISTINCT h.operation_id
  FROM public.spy_agent_history h
  JOIN public.spy_operations o ON o.id=h.operation_id
  WHERE o.target_type='house' AND o.target_id=p_house
   AND o.owner_house_id<>p_house
   AND o.status='completed'
   AND h.owner_house_id=o.owner_house_id
   AND h.target_house_id=p_house
   AND h.event_type IN('escaped','captured','dead')
 ) detections;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'dateKey',x.event_date_key,
  'result',x.event_type
 ) ORDER BY x.event_date_key DESC),'[]'::jsonb)
 INTO v_recent
 FROM (
  SELECT h.event_date_key,h.event_type
  FROM public.spy_agent_history h
  JOIN public.spy_operations o ON o.id=h.operation_id
  WHERE o.target_type='house' AND o.target_id=p_house
   AND o.owner_house_id<>p_house
   AND o.status='completed'
   AND h.owner_house_id=o.owner_house_id
   AND h.target_house_id=p_house
   AND h.event_type IN('escaped','captured','dead')
   AND h.id=(
    SELECT h2.id FROM public.spy_agent_history h2
    WHERE h2.operation_id=h.operation_id
     AND h2.event_type IN('escaped','captured','dead')
    ORDER BY h2.created_at DESC,h2.id DESC LIMIT 1)
  ORDER BY h.event_date_key DESC,h.id DESC LIMIT 12
 ) x;
 RETURN jsonb_build_object('totalDetections',v_total,'alerts',v_recent);
END $counter$;
REVOKE ALL ON FUNCTION public.spy_house_counterintelligence(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spy_house_counterintelligence(text) TO authenticated;
COMMIT;
