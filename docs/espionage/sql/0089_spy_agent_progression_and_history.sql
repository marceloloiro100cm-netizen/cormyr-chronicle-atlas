-- CCA · Cormyr agent progression, memorial and recruitment capacities
-- Migration additive.  No historical agent is promoted, captured or killed by this script.
-- Authoritative status mutation will be performed only by guarded RPCs in 0090.
BEGIN;
ALTER TABLE public.spy_assets
 ADD COLUMN IF NOT EXISTS mission_successes integer NOT NULL DEFAULT 0;
DO $sql$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint
               WHERE conname='spy_assets_successes_nonnegative'
                 AND conrelid='public.spy_assets'::regclass) THEN
  ALTER TABLE public.spy_assets
   ADD CONSTRAINT spy_assets_successes_nonnegative CHECK (mission_successes>=0);
 END IF;
END $sql$;
ALTER TABLE public.spy_assets DROP CONSTRAINT IF EXISTS spy_assets_status_check;
ALTER TABLE public.spy_assets ADD CONSTRAINT spy_assets_status_check
 CHECK(status IN ('available','assigned','traveling','operating','returning',
   'missing','captured','retired','lost','dead','pending_review'));

CREATE TABLE IF NOT EXISTS public.spy_agent_history(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_house_id text NOT NULL REFERENCES public.campaign_houses(id),
 agent_id uuid NOT NULL REFERENCES public.spy_assets(id),
 operation_id uuid REFERENCES public.spy_operations(id),
 event_type text NOT NULL CHECK(event_type IN
  ('recruited','mission_success','mission_failure','escaped','captured','dead','promoted')),
 event_date_key text NOT NULL CHECK(public.valid_campaign_date(event_date_key)),
 calendar_version integer NOT NULL CHECK(calendar_version>0),
 target_house_id text,
 target_name text,
 target_region text,
 agent_rank text NOT NULL CHECK(agent_rank IN ('Verde','Treinada','Veterana','Elite')),
 cunning integer NOT NULL CHECK(cunning BETWEEN 3 AND 6),
 total_successes integer NOT NULL CHECK(total_successes>=0),
 roll_total integer,
 modifier integer,
 target_difficulty integer,
 failure_degrees integer,
 law_snapshot integer,
 guard_present boolean,
 prison_present boolean,
 detail text NOT NULL,
 request_key uuid NOT NULL UNIQUE,
 actor uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS spy_agent_history_house_agent_date
 ON public.spy_agent_history(owner_house_id,agent_id,created_at DESC);
CREATE INDEX IF NOT EXISTS spy_agent_history_op
 ON public.spy_agent_history(operation_id) WHERE operation_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS spy_agent_history_one_resolution_per_op
 ON public.spy_agent_history(operation_id)
 WHERE operation_id IS NOT NULL
   AND event_type IN('mission_success','mission_failure','escaped','captured','dead');

ALTER TABLE public.spy_agent_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS spy_agent_history_owner ON public.spy_agent_history;
CREATE POLICY spy_agent_history_owner ON public.spy_agent_history FOR SELECT TO authenticated
 USING(public.is_campaign_admin() OR public.in_campaign_house(owner_house_id,false));
REVOKE ALL ON public.spy_agent_history FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.spy_agent_history TO authenticated;

-- "Dead" and "escaped" are legitimate narrated outcomes; preserve old ones.
ALTER TABLE public.spy_mission_decisions
 DROP CONSTRAINT IF EXISTS spy_mission_decisions_resolution_check;
ALTER TABLE public.spy_mission_decisions
 ADD CONSTRAINT spy_mission_decisions_resolution_check
 CHECK(resolution IN('pending_narrator_review','success','partial',
  'failure','compromised','captured','escaped','dead'));

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
   CASE h->>'itemId' WHEN 'pros-spy-network' THEN 1 ELSE 2 END AS capacity,
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

REVOKE ALL ON FUNCTION public.spy_house_management(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spy_house_management(text) TO authenticated;
COMMIT;
