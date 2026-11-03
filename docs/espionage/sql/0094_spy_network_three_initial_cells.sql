-- 0094 · Rede de Espiões: capacidade base conforme o livro (3 células).
-- Rede Ampliada continua oferecendo +2 células por compra.
-- Não recruta agentes automaticamente, não altera missões nem histórico.
BEGIN;
CREATE OR REPLACE FUNCTION public.spy_house_management(p_house text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $body$
DECLARE v_agents jsonb;v_operations jsonb;v_history jsonb;v_recruitment jsonb;
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
  'sourceHoldingId',a.source_holding_id
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

 -- One base cell per actual active Spy Network holding, two per actual active
 -- Expanded Network holding. This conservatively preserves the registered
 -- roster, rather than inventing the sourcebook's unspecified base count.
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

 RETURN jsonb_build_object(
  'houseId',p_house,'agents',v_agents,'operations',v_operations,
  'history',v_history,'recruitment',v_recruitment);
END $body$;

CREATE OR REPLACE FUNCTION public.spy_recruit_agent(
 p_house text,p_source_holding text,p_codename text,p_request_key uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,pg_temp AS $body$
DECLARE
 v_state jsonb;v_h jsonb;v_capacity integer;v_used integer;
 v_location uuid;v_region text;v_agent uuid;v_calendar record;v_day text;
 v_old record;v_name text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active() OR NOT
  (public.is_campaign_admin() OR public.in_campaign_house(p_house,true))
 THEN RAISE EXCEPTION 'Recrutamento não autorizado'; END IF;
 v_name:=btrim(p_codename);
 IF p_request_key IS NULL OR v_name IS NULL OR char_length(v_name)<2
  OR char_length(v_name)>80 OR v_name ~ '[[:cntrl:]]'
 THEN RAISE EXCEPTION 'Nome ou solicitação inválida'; END IF;
 SELECT n.state INTO v_state FROM public.noble_house_sheets n
  WHERE n.house_id=p_house FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ficha operacional da Casa necessária para recrutar'; END IF;

 SELECT h.agent_id,h.owner_house_id INTO v_old FROM public.spy_agent_history h
 WHERE h.request_key=p_request_key;
 IF FOUND THEN
  IF v_old.owner_house_id<>p_house THEN RAISE EXCEPTION 'Chave já utilizada por outra Casa'; END IF;
  RETURN (SELECT jsonb_build_object('id',a.id,'codename',a.codename,
     'status',a.status,'rank','Verde','cunning',3,'missionSuccesses',0)
   FROM public.spy_assets a WHERE a.id=v_old.agent_id);
 END IF;

 SELECT h INTO v_h FROM jsonb_array_elements(
  CASE WHEN jsonb_typeof(v_state->'holdings')='array' THEN v_state->'holdings'
   ELSE '[]'::jsonb END) h WHERE h->>'id'=p_source_holding
   AND h->>'status'='active'
   AND h->>'itemId' IN('pros-spy-network','pros-spy-network--expanded-network')
   AND (nullif(h->>'parentId','') IS NULL OR EXISTS(
     SELECT 1 FROM jsonb_array_elements(v_state->'holdings') parent
     WHERE parent->>'id'=h->>'parentId' AND parent->>'status'='active'))
 LIMIT 1;
 IF v_h IS NULL THEN RAISE EXCEPTION 'Fonte ativa da Rede de Espiões não encontrada'; END IF;
 v_capacity:=CASE v_h->>'itemId'
   WHEN 'pros-spy-network' THEN 3 ELSE 2 END;
 SELECT count(*)::integer INTO v_used
 FROM public.spy_assets a WHERE a.owner_house_id=p_house
   AND a.source_holding_id=p_source_holding
   AND a.status NOT IN('captured','dead','lost','retired');
 IF v_used>=v_capacity THEN RAISE EXCEPTION 'Rede sem vaga livre para recrutamento'; END IF;
 SELECT l.id INTO v_location FROM public.spy_locations l
 WHERE l.kind='domain' AND l.ref_id=v_h->>'domainId';
 IF v_location IS NULL THEN
  RAISE EXCEPTION 'Domínio de recrutamento sem localização homologada';
 END IF;

 SELECT c.year,c.month,c.day,c.festival,c.version INTO v_calendar
 FROM public.campaign_calendar c WHERE c.id=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'Hub Temporal indisponível'; END IF;
 v_day:=lpad(v_calendar.year::text,4,'0')||'-'||
  CASE WHEN v_calendar.festival IS NOT NULL
    THEN 'F-'||v_calendar.festival ELSE
    lpad((v_calendar.month+1)::text,2,'0')||'-'||lpad(v_calendar.day::text,2,'0') END;
 IF NOT public.valid_campaign_date(v_day) THEN RAISE EXCEPTION 'Data de campanha inválida'; END IF;
 SELECT l.region_id INTO v_region FROM public.spy_locations l WHERE l.id=v_location;

 INSERT INTO public.spy_assets(
  owner_house_id,kind,codename,source_holding_id,source_ref,current_location_id,
  status,rules_version,mission_successes
 ) VALUES(
  p_house,'network_cell',v_name,p_source_holding,
  'replacement:'||p_source_holding||':'||p_request_key::text,
  v_location,'available','cormyr-agent-tiers-v1',0
 ) RETURNING id INTO v_agent;

 INSERT INTO public.spy_agent_history(
  owner_house_id,agent_id,event_type,event_date_key,calendar_version,
  target_name,target_region,agent_rank,cunning,total_successes,
  detail,request_key,actor
 ) VALUES(
  p_house,v_agent,'recruited',v_day,v_calendar.version,
  v_name,v_region,'Verde',3,0,
  'Novo agente Verde recrutado em vaga livre da Rede de Espiões.',
  p_request_key,auth.uid()
 );
 RETURN jsonb_build_object('id',v_agent,'codename',v_name,
  'status','available','rank','Verde','cunning',3,'missionSuccesses',0);
END $body$;
COMMIT;
