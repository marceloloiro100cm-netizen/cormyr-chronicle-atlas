-- 0103 | Retratos de espiões exclusivos em TODA a campanha.
-- A reserva é global e atômica: mesmo retrato não pode ser usado por
-- agentes de Casas diferentes. Não modifica retratos existentes.
-- A galeria informa somente ocupação global; agentId permanece
-- visível apenas quando o agente pertence à Casa consultada.
BEGIN;

-- Falhar com segurança se o banco já possuir conflitos; não remover
-- nem redistribuir retratos de jogadores automaticamente.
DO $verify$
BEGIN
 IF EXISTS (
  SELECT 1 FROM public.spy_assets WHERE portrait_id IS NOT NULL
  GROUP BY portrait_id HAVING count(*) > 1
 ) THEN
  RAISE EXCEPTION 'Retratos duplicados entre Casas: concilie as atribuições antes da exclusividade global';
 END IF;
END $verify$;

-- UNIQUE sobre todos os agentes/Casas é a garantia transacional; 
-- cobre spy_create_agent, spy_assign_agent_portrait e qualquer outro
-- caminho de gravação, inclusive corridas entre sessões.
CREATE UNIQUE INDEX IF NOT EXISTS spy_agent_portrait_campaign_unique
 ON public.spy_assets(portrait_id) WHERE portrait_id IS NOT NULL;

-- Retornar occupied em todas as consultas autorizadas sem expor IDs
-- de agentes de outras Casas: assignedAgentId segue limitado à Casa.
-- spy_house_management: preserves the deployed RPC signature and business rules.
CREATE OR REPLACE FUNCTION public.spy_house_management(p_house text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_agents jsonb;v_operations jsonb;v_history jsonb;v_recruitment jsonb;v_portraits jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active() OR
  NOT (public.is_campaign_admin() OR public.in_campaign_house(p_house,false))
 THEN RAISE EXCEPTION 'Gerenciamento de agentes não autorizado para esta Casa'; END IF;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',a.id,'codename',a.codename,'status',a.status,'version',a.version,
  'currentRegion',CASE WHEN l.kind='region' THEN l.ref_id ELSE l.region_id END,
  'missionSuccesses',a.mission_successes,
  'rank',CASE least(3,a.mission_successes/3)
    WHEN 0 THEN 'Verde' WHEN 1 THEN 'Treinada'
    WHEN 2 THEN 'Veterana' ELSE 'Elite' END,
  'cunning',3+least(3,a.mission_successes/3),
  'toNextRank',CASE WHEN a.mission_successes>=9 THEN 0
    ELSE 3-a.mission_successes%3 END,
  'sourceHoldingId',a.source_holding_id,
  'portraitId',a.portrait_id,
  'forgedDocuments',EXISTS(SELECT 1 FROM public.spy_agent_upgrades u
    WHERE u.agent_id=a.id AND u.upgrade_code='forged_documents'),
  'aceInTheHole',EXISTS(SELECT 1 FROM public.spy_agent_upgrades u
    WHERE u.agent_id=a.id AND u.upgrade_code='ace_in_the_hole')
 ) ORDER BY a.created_at,a.id),'[]'::jsonb)
 INTO v_agents
 FROM public.spy_assets a LEFT JOIN public.spy_locations l ON l.id=a.current_location_id
 WHERE a.owner_house_id=p_house;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',o.id,'assetId',o.asset_id,'missionKind',o.mission_kind,
   'targetType',o.target_type,'targetId',o.target_id,'status',o.status,
   'travelDays',CASE WHEN s.total_segments>0 THEN s.travel_days ELSE NULL END,
   'arrivalKey',s.last_arrival,'createdAt',o.created_at
  ) ORDER BY o.created_at DESC,o.id),'[]'::jsonb)
 INTO v_operations
 FROM public.spy_operations o
 LEFT JOIN LATERAL(
  SELECT count(*)::int AS total_segments,
   sum(os.duration_days)::int AS travel_days,
   (SELECT s2.arrival_key FROM public.spy_operation_segments s2
    WHERE s2.operation_id=o.id AND s2.status<>'cancelled'
    ORDER BY s2.ordinal DESC LIMIT 1) AS last_arrival
  FROM public.spy_operation_segments os
  WHERE os.operation_id=o.id AND os.status<>'cancelled'
 ) s ON true
 WHERE o.owner_house_id=p_house;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',h.id,'agentId',h.agent_id,'eventType',h.event_type,
  'dateKey',h.event_date_key,'targetName',h.target_name,
  'targetRegion',h.target_region,'detail',h.detail,
  'rank',h.agent_rank,'cunning',h.cunning,
  'totalSuccesses',h.total_successes,'failureDegrees',h.failure_degrees,
  'operationId',h.operation_id
 ) ORDER BY h.created_at DESC,h.id DESC),'[]'::jsonb)
 INTO v_history
 FROM public.spy_agent_history h WHERE h.owner_house_id=p_house;

 -- Three base cells per active Spy Network holding, two per active expansion.
 SELECT coalesce(jsonb_agg(jsonb_build_object(
    'sourceHoldingId',v.id,'name',v.name,'capacity',v.capacity,
    'occupied',v.occupied,'vacancies',greatest(0,v.capacity-v.occupied)
 ) ORDER BY v.name,v.id),'[]'::jsonb) INTO v_recruitment
 FROM (
  SELECT h->>'id' AS id,h->>'name' AS name,
   CASE h->>'itemId' WHEN 'pros-spy-network' THEN 3 ELSE 2 END AS capacity,
   (SELECT count(*)::int FROM public.spy_assets a
    WHERE a.owner_house_id=p_house AND a.source_holding_id=h->>'id'
      AND a.status NOT IN('captured','dead','lost','retired')) AS occupied
  FROM public.noble_house_sheets n,
       LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(n.state->'holdings')='array'
         THEN n.state->'holdings' ELSE '[]'::jsonb END) h
  WHERE n.house_id=p_house
    AND h->>'status'='active'
    AND h->>'itemId' IN('pros-spy-network','pros-spy-network--expanded-network')
    AND (nullif(h->>'parentId','') IS NULL OR EXISTS(
     SELECT 1 FROM jsonb_array_elements(n.state->'holdings') parent
     WHERE parent->>'id'=h->>'parentId' AND parent->>'status'='active'))
 ) v;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',c.id,'label',c.label,'imageUrl',c.image_url,
  'assignedAgentId',a.id,
    'occupied',EXISTS(SELECT 1 FROM public.spy_assets claimed
      WHERE claimed.portrait_id=c.id)
 ) ORDER BY c.sort_order,c.id),'[]'::jsonb) INTO v_portraits
 FROM public.spy_portrait_catalog c
 LEFT JOIN public.spy_assets a ON a.portrait_id=c.id AND a.owner_house_id=p_house
 WHERE c.active=true;
 RETURN jsonb_build_object(
  'houseId',p_house,'agents',v_agents,'operations',v_operations,
  'history',v_history,'recruitment',v_recruitment,'portraits',v_portraits,
  'houseVersion',(SELECT n.version FROM public.noble_house_sheets n
    WHERE n.house_id=p_house));
END $function$
;

-- spy_recruitment_options: preserves the deployed RPC signature and business rules.
CREATE OR REPLACE FUNCTION public.spy_recruitment_options(p_house text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_slots jsonb;v_portraits jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
    OR NOT (public.is_campaign_admin() OR public.in_campaign_house(p_house,false))
 THEN RAISE EXCEPTION 'Consulta de vagas não autorizada'; END IF;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'sourceHoldingId',t.id,'name',t.name,
   'capacity',t.capacity,'occupied',t.occupied,
   'vacancies',greatest(0,t.capacity-t.occupied)
 ) ORDER BY t.name,t.id),'[]'::jsonb)
 INTO v_slots
 FROM (
   SELECT h->>'id' AS id,
     h->>'name' AS name,
     CASE h->>'itemId'
       WHEN 'pros-spy-network' THEN 3
       WHEN 'pros-spy-network--expanded-network' THEN 2
       ELSE 0 END AS capacity,
     (SELECT count(*)::integer FROM public.spy_assets a
        WHERE a.owner_house_id=p_house
          AND a.source_holding_id=h->>'id'
          AND a.status NOT IN('captured','dead','lost','retired')
     ) AS occupied
   FROM public.noble_house_sheets n
   CROSS JOIN LATERAL jsonb_array_elements(
     CASE WHEN jsonb_typeof(n.state->'holdings')='array'
       THEN n.state->'holdings' ELSE '[]'::jsonb END
   ) h
   WHERE n.house_id=p_house
     AND n.state->>'phase'='active'
     AND h->>'status'='active'
     AND h->>'itemId' IN('pros-spy-network',
                          'pros-spy-network--expanded-network')
     AND (
       nullif(h->>'parentId','') IS NULL
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(n.state->'holdings') parent
         WHERE parent->>'id'=h->>'parentId'
           AND parent->>'status'='active'
       )
     )
 ) t;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'label',c.label,'imageUrl',c.image_url,
    'assignedAgentId',a.id,
    'occupied',EXISTS(SELECT 1 FROM public.spy_assets claimed
      WHERE claimed.portrait_id=c.id)
 ) ORDER BY c.sort_order,c.id),'[]'::jsonb)
 INTO v_portraits
 FROM public.spy_portrait_catalog c
 LEFT JOIN public.spy_assets a
   ON a.portrait_id=c.id AND a.owner_house_id=p_house
 WHERE c.active=true;

 RETURN jsonb_build_object('houseId',p_house,
   'recruitment',v_slots,'portraits',v_portraits);
END $function$
;

COMMIT;
