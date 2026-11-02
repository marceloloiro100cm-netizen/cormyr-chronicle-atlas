-- CCA-ESP-MVP-001 · Lote 11 extension · REVIEW ONLY.
-- Accepts client-proposed dates ONLY after comparing each to registered edge baseDays,
-- approved direction, edge version and official published Harptos date.
-- Never invents durations or advances the global clock.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE OR REPLACE FUNCTION public.spy_plan_operation_route(
 p_operation uuid,p_expected_operation_version integer,p_expected_calendar_version integer,
 p_request_key uuid,p_legs jsonb,p_reason text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
 SET search_path=public,pg_temp AS $spy$
DECLARE op public.spy_operations; asset public.spy_assets;
 cal public.campaign_calendar; edge public.spy_travel_edges; leg jsonb;
 from_id uuid;to_id uuid;edge_id uuid;duration integer;edge_version integer;
 depart text;arrive text;previous_location uuid;previous_date text;
 actual_date text;idx integer:=0;travel_days integer:=0;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active() OR NOT public.is_campaign_admin()
  THEN RAISE EXCEPTION 'Somente Narrador pode homologar itinerário'; END IF;
 IF p_operation IS NULL OR p_request_key IS NULL OR p_expected_operation_version<1 OR
  p_expected_calendar_version<1 OR length(trim(coalesce(p_reason,'')))<10 OR
  jsonb_typeof(p_legs) IS DISTINCT FROM 'array' OR
  jsonb_array_length(p_legs) NOT BETWEEN 1 AND 30 THEN
  RAISE EXCEPTION 'Itinerário inválido ou justificativa ausente'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('spy:route:'||p_operation::text,0));
 IF EXISTS(SELECT 1 FROM public.spy_operation_events
   WHERE request_key=p_request_key AND event_type='route_planned'
    AND operation_id=p_operation) THEN
  RETURN jsonb_build_object('operation_id',p_operation,'duplicate',true);
 END IF;
 IF EXISTS(SELECT 1 FROM public.spy_operation_events WHERE request_key=p_request_key)
  THEN RAISE EXCEPTION 'Chave de itinerário reutilizada'; END IF;
 SELECT * INTO cal FROM public.campaign_calendar WHERE id=true FOR SHARE;
 IF NOT FOUND OR cal.version<>p_expected_calendar_version THEN
  RAISE EXCEPTION 'Calendário oficial mudou'; END IF;
 actual_date:=public.harptos_time_key(cal.year,cal.month,cal.day,cal.festival);
 SELECT * INTO op FROM public.spy_operations WHERE id=p_operation FOR UPDATE;
 IF NOT FOUND OR op.version<>p_expected_operation_version OR op.status<>'planned'
  THEN RAISE EXCEPTION 'Missão inexistente, alterada ou sem planejamento'; END IF;
 IF EXISTS(SELECT 1 FROM public.spy_operation_segments s WHERE s.operation_id=p_operation)
  THEN RAISE EXCEPTION 'Itinerário já registrado; replanejamento exige revisão específica'; END IF;
 SELECT * INTO asset FROM public.spy_assets WHERE id=op.asset_id
  AND owner_house_id=op.owner_house_id FOR UPDATE;
 IF NOT FOUND OR asset.status<>'assigned' OR asset.current_location_id IS NULL
  THEN RAISE EXCEPTION 'Agente não está designado e localizado'; END IF;
 previous_location:=asset.current_location_id; previous_date:=actual_date;
 FOR leg IN SELECT value FROM jsonb_array_elements(p_legs) LOOP
  IF jsonb_typeof(leg)<>'object' OR NOT (leg ?& ARRAY[
   'edgeId','edgeVersion','fromLocationId','toLocationId','durationDays',
   'departureDateKey','arrivalDateKey']) THEN RAISE EXCEPTION 'Trecho incompleto'; END IF;
  edge_id:=(leg->>'edgeId')::uuid;edge_version:=(leg->>'edgeVersion')::integer;
  from_id:=(leg->>'fromLocationId')::uuid;to_id:=(leg->>'toLocationId')::uuid;
  duration:=(leg->>'durationDays')::integer;
  depart:=leg->>'departureDateKey';arrive:=leg->>'arrivalDateKey';
  IF duration NOT BETWEEN 1 AND 3650 OR
   NOT public.valid_campaign_date(depart) OR NOT public.valid_campaign_date(arrive) OR
   from_id IS DISTINCT FROM previous_location OR depart IS DISTINCT FROM previous_date
   THEN RAISE EXCEPTION 'Trecho descontínuo ou data inválida'; END IF;
  SELECT * INTO edge FROM public.spy_travel_edges WHERE id=edge_id FOR SHARE;
  IF NOT FOUND OR NOT edge.approved OR edge.blocked OR edge.version<>edge_version
   OR duration<>edge.base_days OR NOT (
    (edge.from_location_id=from_id AND edge.to_location_id=to_id) OR
    (edge.bidirectional AND edge.from_location_id=to_id AND edge.to_location_id=from_id))
   THEN RAISE EXCEPTION 'Rota não homologada ou duração incompatível'; END IF;
  IF (SELECT count(*) FROM public.spy_locations
   WHERE id IN(from_id,to_id) AND approved)<>2
   THEN RAISE EXCEPTION 'Localidade não homologada'; END IF;
  IF public.harptos_calendar_ordinal(arrive)-public.harptos_calendar_ordinal(depart)<>duration
   THEN RAISE EXCEPTION 'Duração não corresponde ao calendário de Harptos'; END IF;
  INSERT INTO public.spy_operation_segments(operation_id,edge_id,ordinal,from_location_id,
   to_location_id,departure_key,arrival_key,duration_days,edge_version,status)
  VALUES(op.id,edge.id,idx,from_id,to_id,depart,arrive,duration,edge.version,'traveling');
  idx:=idx+1;travel_days:=travel_days+duration;
  previous_location:=to_id;previous_date:=arrive;
 END LOOP;
 UPDATE public.spy_operations SET status='traveling',version=version+1 WHERE id=op.id;
 UPDATE public.spy_assets SET status='traveling',version=version+1 WHERE id=asset.id;
 INSERT INTO public.spy_operation_events(operation_id,request_key,actor,event_type,
  old_state,new_state,reason,calendar_version)
 VALUES(op.id,p_request_key,auth.uid(),'route_planned','planned','traveling',p_reason,cal.version);
 RETURN jsonb_build_object('operation_id',op.id,'duplicate',false,
  'segments',idx,'total_days',travel_days,'arrival_date_key',previous_date,
  'calendar_version',cal.version);
END $spy$;
REVOKE ALL ON FUNCTION public.spy_plan_operation_route(uuid,integer,integer,uuid,jsonb,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.spy_plan_operation_route(uuid,integer,integer,uuid,jsonb,text)
 TO authenticated;
COMMIT;
