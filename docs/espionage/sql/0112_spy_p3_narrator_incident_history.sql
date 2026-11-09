-- 0112 | P3 — Livro de incidentes do Narrador (apenas leitura).
-- Fatos registrados; NÃO altera moral, risco, agentes ou contraespionagem.
-- Requer tabelas existentes spy_operations, spy_agent_history e house_catalog.
BEGIN;
SET LOCAL lock_timeout='8s';

CREATE OR REPLACE FUNCTION public.spy_narrator_incident_history()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $incidents$
DECLARE v_rows jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
   OR NOT public.is_campaign_admin()
 THEN RAISE EXCEPTION 'Incidentes reservados ao Narrador'; END IF;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',events.id,
  'dateKey',events.event_date_key,
  'outcome',events.event_type,
  'ownerHouseName',events.owner_name,
  'targetHouseName',events.target_name,
  'agentName',events.agent_name,
  'targetRegion',events.target_region,
  'detail',events.detail
 ) ORDER BY events.event_date_key DESC,events.created_at DESC,events.id),'[]'::jsonb)
 INTO v_rows
 FROM (
  SELECT h.id,h.event_date_key,h.event_type,h.target_region,
   h.created_at,coalesce(h.detail,'') AS detail,
   coalesce(oc.name,h.owner_house_id) AS owner_name,
   coalesce(tc.name,h.target_house_id,'Casa não identificada') AS target_name,
   coalesce(a.codename,'Agente histórico') AS agent_name
  FROM public.spy_agent_history h
  JOIN public.spy_operations o ON o.id=h.operation_id
  LEFT JOIN public.spy_assets a ON a.id=h.agent_id
  LEFT JOIN public.house_catalog oc ON oc.id=h.owner_house_id
  LEFT JOIN public.house_catalog tc ON tc.id=h.target_house_id
  WHERE h.event_type IN('escaped','captured','dead')
   AND o.status='completed'
   AND o.target_type='house'
   AND o.owner_house_id=h.owner_house_id
  ORDER BY h.event_date_key DESC,h.created_at DESC,h.id
  LIMIT 800
 ) events;
 RETURN v_rows;
END $incidents$;
REVOKE ALL ON FUNCTION public.spy_narrator_incident_history() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spy_narrator_incident_history() TO authenticated;
COMMIT;
