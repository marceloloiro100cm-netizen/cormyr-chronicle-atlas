-- 0102 | Espionagem operacional: a ordem inicia imediatamente. A viagem
-- começa na data oficial do Hub Temporal, não no relógio real nem nas missivas.
-- A malha aprovada aqui reproduz as 19 fronteiras cartográficas do Narrador
-- e as 3 travessias do Dragonmere já aprovadas para o planejador.
-- Uma aresta = uma désdia. Uma investigação = uma désdia adicional.
-- Resultados continuam sendo julgados pela RPC existente do Narrador.
BEGIN;

CREATE TABLE IF NOT EXISTS public.spy_cormyr_mission_links(
 from_region text NOT NULL,
 to_region text NOT NULL,
 passage text NOT NULL CHECK(passage IN('land_neighbor','sea_passage')),
 active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(from_region,to_region,passage),
 CHECK(from_region<>to_region)
);
ALTER TABLE public.spy_cormyr_mission_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.spy_cormyr_mission_links FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.spy_cormyr_mission_links TO service_role;

INSERT INTO public.spy_cormyr_mission_links(from_region,to_region,passage)
 VALUES
 ('veilstone','ferlin','land_neighbor'),
 ('veilstone','helmlands','land_neighbor'),
 ('veilstone','stonelands','land_neighbor'),
 ('veilstone','swordmark','land_neighbor'),
 ('ferlin','swordmark','land_neighbor'),
 ('ferlin','horselands','land_neighbor'),
 ('swordmark','helmlands','land_neighbor'),
 ('swordmark','crownlands','land_neighbor'),
 ('swordmark','horselands','land_neighbor'),
 ('helmlands','stonelands','land_neighbor'),
 ('helmlands','elfhold','land_neighbor'),
 ('helmlands','crownlands','land_neighbor'),
 ('stonelands','elfhold','land_neighbor'),
 ('stonelands','volkumburgh','land_neighbor'),
 ('elfhold','volkumburgh','land_neighbor'),
 ('elfhold','shieldmark','land_neighbor'),
 ('crownlands','shieldmark','land_neighbor'),
 ('shieldmark','volkumburgh','land_neighbor'),
 ('horselands','dragoncoast','land_neighbor'),
 ('dragoncoast','crownlands','sea_passage'),
 ('dragoncoast','shieldmark','sea_passage'),
 ('crownlands','shieldmark','sea_passage')
ON CONFLICT(from_region,to_region,passage) DO NOTHING;

-- A linha do tempo é separada da operação para manter o contrato das
-- demais RPCs e preservar o histórico das missões canceladas/concluídas.
CREATE TABLE IF NOT EXISTS public.spy_mission_timeline(
 operation_id uuid PRIMARY KEY REFERENCES public.spy_operations(id),
 owner_house_id text NOT NULL REFERENCES public.campaign_houses(id),
 agent_id uuid NOT NULL REFERENCES public.spy_assets(id),
 departure_key text NOT NULL CHECK(public.valid_campaign_date(departure_key)),
 arrival_key text NOT NULL CHECK(public.valid_campaign_date(arrival_key)),
 investigation_end_key text NOT NULL CHECK(public.valid_campaign_date(investigation_end_key)),
 origin_region text NOT NULL,
 destination_region text NOT NULL,
 travel_rounds integer NOT NULL CHECK(travel_rounds BETWEEN 0 AND 25),
 travel_days integer NOT NULL CHECK(travel_days=travel_rounds*10),
 route jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(route)='array'),
 source_location_id uuid NOT NULL REFERENCES public.spy_locations(id),
 destination_location_id uuid NOT NULL REFERENCES public.spy_locations(id),
 source_calendar_version integer NOT NULL CHECK(source_calendar_version>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(operation_id,owner_house_id)
);
CREATE INDEX IF NOT EXISTS spy_mission_timeline_house_idx
 ON public.spy_mission_timeline(owner_house_id,agent_id);
ALTER TABLE public.spy_mission_timeline ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.spy_mission_timeline FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.spy_mission_timeline TO service_role;

-- Create durable region locations; these are distinct from player-house seats.
INSERT INTO public.spy_locations(kind,ref_id,region_id,name,approved,visibility,source,version)
SELECT 'region',t.slug,t.slug,t.name,true,'public','cormyr-regional-mission-v1',1
FROM (VALUES
 ('veilstone','Veilstone'),('ferlin','Ferlin'),('helmlands','Helmlands'),
 ('swordmark','Swordmarch'),('crownlands','Crownlands'),
 ('horselands','Horselands'),('dragoncoast','Dragon Coast'),
 ('shieldmark','Shieldmark'),('elfhold','Elfhold'),
 ('volkumburgh','Volkumburgh'),('stonelands','Stonelands')
) AS t(slug,name)
WHERE NOT EXISTS(SELECT 1 FROM public.spy_locations l
 WHERE l.kind='region' AND l.ref_id=t.slug);

CREATE OR REPLACE FUNCTION public.spy_cormyr_normalize_region(v text)
RETURNS text LANGUAGE sql IMMUTABLE STRICT SET search_path=public,pg_temp AS $norm$
 SELECT CASE lower(regexp_replace(v,'[[:space:]]','','g'))
  WHEN 'swordmarch' THEN 'swordmark'
  WHEN 'crownland' THEN 'crownlands'
  ELSE lower(regexp_replace(v,'[[:space:]]','','g')) END;
$norm$;

-- Single source of truth for the shortest route. No travel-round or
-- arrival-date values from the browser are accepted by the mutation RPC.
CREATE OR REPLACE FUNCTION public.spy_cormyr_mission_route(p_from text,p_to text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $route$
DECLARE
 v_start text:=public.spy_cormyr_normalize_region(p_from);
 v_end text:=public.spy_cormyr_normalize_region(p_to);
 v_queue text[];v_seen text[];v_parent jsonb:='{}'::jsonb;
 v_cursor text;v_next text;v_i integer:=1;v_path jsonb:='[]'::jsonb;
 v_steps integer:=0;v_prev text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.spy_locations
  WHERE kind='region' AND ref_id=v_start AND approved)
 OR NOT EXISTS(SELECT 1 FROM public.spy_locations
  WHERE kind='region' AND ref_id=v_end AND approved)
 THEN RAISE EXCEPTION 'Região do trajeto não cadastrada'; END IF;
 IF v_start=v_end THEN
  RETURN jsonb_build_object('rounds',0,'legs','[]'::jsonb);
 END IF;
 v_queue:=ARRAY[v_start];v_seen:=ARRAY[v_start];
 WHILE v_i<=coalesce(array_length(v_queue,1),0) LOOP
  v_cursor:=v_queue[v_i];v_i:=v_i+1;
  FOR v_next IN
   SELECT distinct q.neighbor FROM (
    SELECT CASE WHEN l.from_region=v_cursor THEN l.to_region
      ELSE l.from_region END AS neighbor
    FROM public.spy_cormyr_mission_links l
    WHERE l.active AND (l.from_region=v_cursor OR l.to_region=v_cursor)
   ) q ORDER BY q.neighbor
  LOOP
   IF NOT (v_next=ANY(v_seen)) THEN
    v_seen:=array_append(v_seen,v_next);
    v_queue:=array_append(v_queue,v_next);
    v_parent:=jsonb_set(v_parent,ARRAY[v_next],to_jsonb(v_cursor),true);
   END IF;
  END LOOP;
  EXIT WHEN v_end=ANY(v_seen);
 END LOOP;
 IF NOT (v_end=ANY(v_seen)) THEN
  RAISE EXCEPTION 'Não há uma ligação regional conhecida para a missão'; END IF;
 v_cursor:=v_end;
 WHILE v_cursor<>v_start LOOP
  v_prev:=v_parent->>v_cursor;
  IF v_prev IS NULL THEN RAISE EXCEPTION 'Trajeto regional incompleto'; END IF;
  v_path:=jsonb_build_array(jsonb_build_object(
   'fromRegion',v_prev,'toRegion',v_cursor,
   'passage',(SELECT l.passage FROM public.spy_cormyr_mission_links l
    WHERE l.active AND ((l.from_region=v_prev AND l.to_region=v_cursor)
      OR (l.to_region=v_prev AND l.from_region=v_cursor))
    ORDER BY CASE WHEN l.passage='sea_passage' THEN 0 ELSE 1 END LIMIT 1)
  ))||v_path;
  v_steps:=v_steps+1;
  IF v_steps>25 THEN RAISE EXCEPTION 'Trajeto regional excede 25 etapas'; END IF;
  v_cursor:=v_prev;
 END LOOP;
 RETURN jsonb_build_object('rounds',v_steps,'legs',v_path);
END $route$;

-- Shared ordinal for comparing calendar dates; intercalary festivals do not
-- count as ordinary days and map to the preceding 30th day.
CREATE OR REPLACE FUNCTION public.spy_campaign_ordinal(p_key text)
RETURNS bigint LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=public,pg_temp AS $ord$
DECLARE y int;m int;d int;festival text;
BEGIN
 IF NOT public.valid_campaign_date(p_key)
 THEN RAISE EXCEPTION 'Data de campanha inválida'; END IF;
 y:=left(p_key,4)::int;
 IF p_key ~ '^[0-9]{4}-F-' THEN
  festival:=substring(p_key,8);
  m:=CASE festival WHEN 'midwinter' THEN 1 WHEN 'greengrass' THEN 4
   WHEN 'midsummer' THEN 7 WHEN 'shieldmeet' THEN 7
   WHEN 'highharvestide' THEN 9 WHEN 'feast-moon' THEN 11 END;
  d:=30;
 ELSE
  m:=substring(p_key,6,2)::int;d:=right(p_key,2)::int;
 END IF;
 RETURN (y::bigint-1)*360+(m-1)*30+d-1;
END $ord$;

CREATE OR REPLACE FUNCTION public.spy_official_date_key()
RETURNS text LANGUAGE sql STABLE SET search_path=public,pg_temp AS $clock$
 SELECT lpad(c.year::text,4,'0')||'-'||
 CASE WHEN c.festival IS NOT NULL THEN 'F-'||c.festival
 ELSE lpad((c.month+1)::text,2,'0')||'-'||lpad(c.day::text,2,'0')
 END FROM public.campaign_calendar c WHERE c.id=true;
$clock$;

-- Trigger called only when the Hub really changes the official calendar;
-- no time passes simply by waiting in real life or opening a page.
CREATE OR REPLACE FUNCTION public.spy_advance_active_missions()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $clocktrigger$
DECLARE v_now text;v_old text;v_item record;v_stage text;v_agent_stage text;
BEGIN
 v_now:=public.spy_official_date_key();
 v_old:=lpad(OLD.year::text,4,'0')||'-'||
  CASE WHEN OLD.festival IS NOT NULL THEN 'F-'||OLD.festival
  ELSE lpad((OLD.month+1)::text,2,'0')||'-'||lpad(OLD.day::text,2,'0') END;
 -- Retrocessos não desfazem missões concluídas, nem teletransportam espiões.
 IF public.spy_campaign_ordinal(v_now)<=public.spy_campaign_ordinal(v_old)
 THEN RETURN NEW; END IF;

 FOR v_item IN
  SELECT t.*,o.status,o.asset_id
  FROM public.spy_mission_timeline t
  JOIN public.spy_operations o ON o.id=t.operation_id
  WHERE o.status IN('traveling','operating')
  ORDER BY t.created_at,t.operation_id
 LOOP
  IF public.spy_campaign_ordinal(v_now)>=
     public.spy_campaign_ordinal(v_item.investigation_end_key) THEN
   v_stage:='pending_narrator_review';v_agent_stage:='pending_review';
  ELSIF public.spy_campaign_ordinal(v_now)>=
     public.spy_campaign_ordinal(v_item.arrival_key) THEN
   v_stage:='operating';v_agent_stage:='operating';
  ELSE
   CONTINUE;
  END IF;
  IF v_stage<>v_item.status THEN
   UPDATE public.spy_operations SET status=v_stage,version=version+1
    WHERE id=v_item.operation_id AND status IN('traveling','operating');
   UPDATE public.spy_assets SET status=v_agent_stage,version=version+1,
    current_location_id=v_item.destination_location_id
    WHERE id=v_item.agent_id AND owner_house_id=v_item.owner_house_id
      AND status IN('traveling','operating');
   INSERT INTO public.spy_operation_events(
    operation_id,request_key,actor,event_type,old_state,new_state,
    reason,calendar_version
   ) VALUES(v_item.operation_id,gen_random_uuid(),NEW.updated_by,
    'mission_clock_progressed',v_item.status,v_stage,
    'Missão avançada automaticamente pelo Hub Temporal em '||v_now,
    NEW.version);
  END IF;
 END LOOP;
 RETURN NEW;
END $clocktrigger$;
DROP TRIGGER IF EXISTS spy_mission_hub_advance ON public.campaign_calendar;
CREATE TRIGGER spy_mission_hub_advance
 AFTER UPDATE OF year,month,day,festival ON public.campaign_calendar
 FOR EACH ROW WHEN (
  OLD.year IS DISTINCT FROM NEW.year OR OLD.month IS DISTINCT FROM NEW.month
  OR OLD.day IS DISTINCT FROM NEW.day
  OR OLD.festival IS DISTINCT FROM NEW.festival
 ) EXECUTE FUNCTION public.spy_advance_active_missions();

-- Replaces the original 0101 function, keeping its signature and protections.
CREATE OR REPLACE FUNCTION public.spy_submit_house_mission(
 p_house text,p_agent uuid,p_target text,p_destination text,
 p_expected_agent_version integer,p_expected_calendar_version integer,
 p_request_key uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,pg_temp AS $start$
DECLARE
 v_agent record;v_target record;v_old record;v_calendar record;
 v_origin text;v_destination text;v_operation uuid;v_path jsonb;
 v_rounds integer;v_depart text;v_arrive text;v_end text;
 v_destination_location uuid;v_start_status text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
  OR NOT (public.is_campaign_admin() OR public.in_campaign_house(p_house,true))
 THEN RAISE EXCEPTION 'Início de missão não autorizado para esta Casa'; END IF;
 IF nullif(btrim(coalesce(p_house,'')),'') IS NULL OR p_agent IS NULL OR
  nullif(btrim(coalesce(p_target,'')),'') IS NULL OR
  nullif(btrim(coalesce(p_destination,'')),'') IS NULL OR
  p_expected_agent_version IS NULL OR p_expected_agent_version<1 OR
  p_expected_calendar_version IS NULL OR p_expected_calendar_version<1 OR
  p_request_key IS NULL THEN RAISE EXCEPTION 'Dados da missão incompletos'; END IF;

 PERFORM pg_advisory_xact_lock(hashtextextended('spy-agent:'||p_agent::text,0));
 SELECT a.id,a.owner_house_id,a.status,a.version,a.current_location_id,
  l.region_id,l.approved AS location_approved
 INTO v_agent FROM public.spy_assets a
 LEFT JOIN public.spy_locations l ON l.id=a.current_location_id
 WHERE a.id=p_agent AND a.owner_house_id=p_house FOR UPDATE OF a;
 IF NOT FOUND THEN RAISE EXCEPTION 'Espião não pertence à Casa'; END IF;
 SELECT o.id,o.asset_id,o.target_id,o.target_type,o.status,
  o.source_calendar_version INTO v_old
 FROM public.spy_operations o
 WHERE o.owner_house_id=p_house AND o.operation_key=p_request_key;
 IF FOUND THEN
  IF v_old.asset_id<>p_agent OR v_old.target_id<>p_target
   OR v_old.target_type<>'house'
  THEN RAISE EXCEPTION 'Chave da missão já utilizada'; END IF;
  RETURN jsonb_build_object('operationId',v_old.id,'agentId',p_agent,
   'targetHouseId',p_target,'status',v_old.status,'alreadyApplied',true,
   'calendarVersion',v_old.source_calendar_version);
 END IF;
 IF EXISTS(SELECT 1 FROM public.spy_operation_events
  WHERE request_key=p_request_key)
 THEN RAISE EXCEPTION 'Chave de operação já utilizada'; END IF;
 IF v_agent.status<>'available' OR v_agent.version<>p_expected_agent_version
 THEN RAISE EXCEPTION 'Espião indisponível ou desatualizado'; END IF;
 IF v_agent.region_id IS NULL OR v_agent.location_approved IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Localização real do espião não homologada'; END IF;
 IF EXISTS(SELECT 1 FROM public.spy_operations o
  WHERE o.asset_id=p_agent AND o.owner_house_id=p_house
   AND o.status NOT IN('completed','cancelled'))
 THEN RAISE EXCEPTION 'Espião já está executando uma missão'; END IF;

 SELECT c.id,c.name,c.region INTO v_target FROM public.house_catalog c
 WHERE c.id=p_target AND c.public_reviewed=true
  AND c.classification IN('noble','major','royal');
 IF NOT FOUND OR v_target.id=p_house
 THEN RAISE EXCEPTION 'Casa-alvo inválida'; END IF;
 v_origin:=public.spy_cormyr_normalize_region(v_agent.region_id);
 v_destination:=public.spy_cormyr_normalize_region(v_target.region);
 IF v_destination<>public.spy_cormyr_normalize_region(p_destination)
 THEN RAISE EXCEPTION 'A Casa não pertence à região indicada'; END IF;
 v_path:=public.spy_cormyr_mission_route(v_origin,v_destination);
 v_rounds:=(v_path->>'rounds')::integer;

 SELECT c.year,c.month,c.day,c.festival,c.version INTO v_calendar
 FROM public.campaign_calendar c WHERE c.id=true FOR SHARE;
 IF NOT FOUND OR v_calendar.version<>p_expected_calendar_version
 THEN RAISE EXCEPTION 'O Hub Temporal mudou. Atualize a previsão'; END IF;
 v_depart:=public.spy_official_date_key();
 v_arrive:=public.spy_add_desdias(v_depart,v_rounds);
 v_end:=public.spy_add_desdias(v_arrive,1);
 SELECT id INTO v_destination_location FROM public.spy_locations
  WHERE kind='region' AND ref_id=v_destination AND approved=true LIMIT 1;
 IF v_destination_location IS NULL THEN
  RAISE EXCEPTION 'Região de destino sem localização válida'; END IF;
 v_start_status:=CASE WHEN v_rounds=0 THEN 'operating' ELSE 'traveling' END;

 INSERT INTO public.spy_operations(
  owner_house_id,asset_id,operation_key,target_type,target_id,
  mission_kind,requested_fields,status,source_calendar_version,
  rules_version,created_by
 ) VALUES(p_house,p_agent,p_request_key,'house',p_target,'house_recon',
  ARRAY['house_overview']::text[],v_start_status,
  v_calendar.version,'cormyr-agent-tiers-v1',auth.uid())
 RETURNING id INTO v_operation;

 INSERT INTO public.spy_mission_timeline(
  operation_id,owner_house_id,agent_id,departure_key,arrival_key,
  investigation_end_key,origin_region,destination_region,travel_rounds,
  travel_days,route,source_location_id,destination_location_id,source_calendar_version
 ) VALUES(v_operation,p_house,p_agent,v_depart,v_arrive,v_end,
  v_origin,v_destination,v_rounds,v_rounds*10,v_path->'legs',
  v_agent.current_location_id,v_destination_location,v_calendar.version);

 UPDATE public.spy_assets SET status=v_start_status,version=version+1,
  current_location_id=CASE WHEN v_rounds=0
   THEN v_destination_location ELSE current_location_id END
 WHERE id=p_agent AND owner_house_id=p_house;
 INSERT INTO public.spy_operation_events(
  operation_id,request_key,actor,event_type,old_state,new_state,
  reason,calendar_version
 ) VALUES(v_operation,p_request_key,auth.uid(),'mission_started',
  'available',v_start_status,
  'Missão de espionagem iniciada imediatamente contra '||v_target.name||
  '; origem '||v_origin||'; destino '||v_destination||
  '; viagem '||v_rounds||' désdias; chegada '||v_arrive||
  '; fim previsto da investigação '||v_end,
  v_calendar.version);
 RETURN jsonb_build_object('operationId',v_operation,'agentId',p_agent,
  'targetHouseId',p_target,'status',v_start_status,'alreadyApplied',false,
  'calendarVersion',v_calendar.version,'departureKey',v_depart,
  'arrivalKey',v_arrive,'investigationEndsKey',v_end,
  'travelDays',v_rounds*10);
END $start$;

CREATE OR REPLACE FUNCTION public.spy_house_mission_timeline(p_house text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $timeline$
DECLARE v_rows jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
  OR NOT (public.is_campaign_admin() OR public.in_campaign_house(p_house,false))
 THEN RAISE EXCEPTION 'Consulta de viagens não autorizada'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'operationId',t.operation_id,'agentId',t.agent_id,
  'departureKey',t.departure_key,'arrivalKey',t.arrival_key,
  'investigationEndKey',t.investigation_end_key,
  'originRegion',t.origin_region,'destinationRegion',t.destination_region,
  'travelDays',t.travel_days,
  'targetHouseName',c.name
 ) ORDER BY t.created_at DESC),'[]'::jsonb)
 INTO v_rows
 FROM public.spy_mission_timeline t
 JOIN public.spy_operations o ON o.id=t.operation_id
 LEFT JOIN public.house_catalog c ON c.id=o.target_id
 WHERE t.owner_house_id=p_house;
 RETURN v_rows;
END $timeline$;

CREATE OR REPLACE FUNCTION public.spy_cancel_house_mission(
 p_house text,p_operation uuid,p_expected_version integer,p_request_key uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,pg_temp AS $cancel$
DECLARE v_op record;v_agent record;v_event record;v_calendar integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
  OR NOT (public.is_campaign_admin() OR public.in_campaign_house(p_house,true))
 THEN RAISE EXCEPTION 'Cancelamento não autorizado'; END IF;
 IF p_operation IS NULL OR p_request_key IS NULL OR
  p_expected_version IS NULL OR p_expected_version<1
 THEN RAISE EXCEPTION 'Dados inválidos para cancelar missão'; END IF;

 -- Locks in same order as starting a mission: advisory(agent), asset, operation.
 SELECT asset_id INTO v_op FROM public.spy_operations
  WHERE id=p_operation AND owner_house_id=p_house;
 IF NOT FOUND THEN RAISE EXCEPTION 'Missão não pertence à Casa'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('spy-agent:'||v_op.asset_id::text,0));
 SELECT * INTO v_agent FROM public.spy_assets
  WHERE id=v_op.asset_id AND owner_house_id=p_house FOR UPDATE;
 SELECT * INTO v_op FROM public.spy_operations
  WHERE id=p_operation AND owner_house_id=p_house FOR UPDATE;
 SELECT operation_id,event_type INTO v_event FROM public.spy_operation_events
  WHERE request_key=p_request_key;
 IF FOUND THEN
  IF v_event.operation_id<>p_operation OR v_event.event_type<>'mission_cancelled'
  THEN RAISE EXCEPTION 'Chave de operação já usada em outra ação'; END IF;
  RETURN jsonb_build_object('operationId',p_operation,'agentId',v_op.asset_id,
   'status','cancelled','alreadyApplied',true);
 END IF;
 IF v_op.status='cancelled'
 THEN RAISE EXCEPTION 'Missão já cancelada'; END IF;
 IF v_op.status NOT IN('planned','traveling','operating','pending_narrator_review')
 THEN RAISE EXCEPTION 'Esta missão não pode ser cancelada'; END IF;
 IF v_op.version<>p_expected_version
 THEN RAISE EXCEPTION 'Missão atualizada. Recarregue antes de cancelar'; END IF;
 SELECT version INTO v_calendar FROM public.campaign_calendar WHERE id=true;
 UPDATE public.spy_operations SET status='cancelled',version=version+1
  WHERE id=p_operation;
 UPDATE public.spy_assets SET status='available',version=version+1
  WHERE id=v_op.asset_id AND owner_house_id=p_house
   AND status IN('assigned','traveling','operating','pending_review');
 INSERT INTO public.spy_operation_events(operation_id,request_key,actor,
  event_type,old_state,new_state,reason,calendar_version)
 VALUES(p_operation,p_request_key,auth.uid(),'mission_cancelled',
  v_op.status,'cancelled',
  'Missão cancelada pela Casa. Agente liberado na localização registrada.',
  v_calendar);
 RETURN jsonb_build_object('operationId',p_operation,
  'agentId',v_op.asset_id,'status','cancelled','alreadyApplied',false);
END $cancel$;

-- Backfill the single already-submitted order ONLY when it was started
-- in the currently published calendar version. Do not invent a historical
-- departure on older calendars or change missions whose time has advanced.
DO $backfill$
DECLARE v_item record;v_cal record;v_origin text;v_dest text;v_path jsonb;
 v_rounds integer;v_depart text;v_arrive text;v_end text;v_dest_location uuid;
 v_start_status text;
BEGIN
 SELECT version INTO v_cal FROM public.campaign_calendar WHERE id=true;
 v_depart:=public.spy_official_date_key();
 FOR v_item IN
  SELECT o.id,o.owner_house_id,o.asset_id,o.source_calendar_version,
   o.status AS operation_status,a.status AS agent_status,a.current_location_id,
   l.region_id AS origin_region,c.region AS destination_region
  FROM public.spy_operations o
  JOIN public.spy_assets a ON a.id=o.asset_id
  JOIN public.spy_locations l ON l.id=a.current_location_id
  JOIN public.house_catalog c ON c.id=o.target_id
  WHERE o.status='planned' AND a.status='assigned'
   AND o.mission_kind='house_recon' AND o.source_calendar_version=v_cal.version
   AND NOT EXISTS(SELECT 1 FROM public.spy_mission_timeline t
    WHERE t.operation_id=o.id)
  FOR UPDATE OF o,a
 LOOP
  v_origin:=public.spy_cormyr_normalize_region(v_item.origin_region);
  v_dest:=public.spy_cormyr_normalize_region(v_item.destination_region);
  v_path:=public.spy_cormyr_mission_route(v_origin,v_dest);
  v_rounds:=(v_path->>'rounds')::int;
  v_arrive:=public.spy_add_desdias(v_depart,v_rounds);
  v_end:=public.spy_add_desdias(v_arrive,1);
  SELECT id INTO v_dest_location FROM public.spy_locations
   WHERE kind='region' AND ref_id=v_dest AND approved LIMIT 1;
  v_start_status:=CASE WHEN v_rounds=0 THEN 'operating' ELSE 'traveling' END;
  INSERT INTO public.spy_mission_timeline(
   operation_id,owner_house_id,agent_id,departure_key,arrival_key,
   investigation_end_key,origin_region,destination_region,travel_rounds,
   travel_days,route,source_location_id,destination_location_id,
   source_calendar_version
  ) VALUES(v_item.id,v_item.owner_house_id,v_item.asset_id,
   v_depart,v_arrive,v_end,v_origin,v_dest,v_rounds,v_rounds*10,
   v_path->'legs',v_item.current_location_id,v_dest_location,v_cal.version);
  UPDATE public.spy_operations SET status=v_start_status,version=version+1
   WHERE id=v_item.id;
  UPDATE public.spy_assets SET status=v_start_status,version=version+1,
   current_location_id=CASE WHEN v_rounds=0 THEN v_dest_location
    ELSE current_location_id END
   WHERE id=v_item.asset_id;
  INSERT INTO public.spy_operation_events(operation_id,request_key,actor,
   event_type,old_state,new_state,reason,calendar_version)
  VALUES(v_item.id,gen_random_uuid(),NULL,'mission_activated_from_legacy',
   'planned',v_start_status,
   'Ordem anterior ativada no mesmo período do Hub Temporal; partida '||
   v_depart||', chegada '||v_arrive||', término previsto '||v_end,
   v_cal.version);
 END LOOP;
END $backfill$;

REVOKE ALL ON FUNCTION public.spy_submit_house_mission(
 text,uuid,text,text,integer,integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.spy_submit_house_mission(
 text,uuid,text,text,integer,integer,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.spy_cancel_house_mission(
 text,uuid,integer,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.spy_cancel_house_mission(
 text,uuid,integer,uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.spy_house_mission_timeline(text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.spy_house_mission_timeline(text)
 TO authenticated;
REVOKE ALL ON FUNCTION public.spy_cormyr_mission_route(text,text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.spy_cormyr_normalize_region(text)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.spy_campaign_ordinal(text)
 FROM PUBLIC,anon,authenticated;
COMMIT;
