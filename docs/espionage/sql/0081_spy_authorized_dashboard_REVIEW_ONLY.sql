-- CCA-ESP-MVP-001: RLS-invoker dashboard, REVIEW ONLY.
-- No target-sheet reads, no sealed reports, no Law/difficulty/decision metadata.
BEGIN;
CREATE OR REPLACE FUNCTION public.spy_read_house_dashboard(p_house text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY INVOKER SET search_path=public,pg_temp AS $spy$
DECLARE agents jsonb; missions jsonb; letters jsonb; dossiers jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active() OR
  NOT (public.is_campaign_admin() OR public.in_campaign_house(p_house,false))
 THEN RAISE EXCEPTION 'Espionagem indisponível para esta Casa'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',a.id,'codename',a.codename,'kind',a.kind,'status',a.status,
   'currentLocationId',a.current_location_id,'version',a.version)
   ORDER BY a.created_at,a.id),'[]'::jsonb) INTO agents
  FROM public.spy_assets a WHERE a.owner_house_id=p_house;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',op.id,'assetId',op.asset_id,'missionKind',op.mission_kind,
   'targetType',op.target_type,'targetId',op.target_id,'requestedFields',
   op.requested_fields,'status',op.status,'version',op.version)
   ORDER BY op.created_at,op.id),'[]'::jsonb) INTO missions
  FROM public.spy_operations op WHERE op.owner_house_id=p_house;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',rep.id,'code',rep.code,'operationId',rep.operation_id,
   'state',rep.status,'observedDateKey',rep.observed_date_key,
   'releaseDateKey',rep.release_date_key,'assetCodename',rep.asset_codename,
   'locationLabel',rep.location_label,'requestedFields',rep.requested_fields,
   'facts',coalesce((
    SELECT jsonb_agg(jsonb_build_object(
      'id',f->>'id','fieldCode',f->>'fieldCode',
      'disclosedValue',f->'disclosedValue','confidence',f->>'confidence',
      'observedDateKey',f->>'observedDateKey')
      ORDER BY f->>'observedDateKey',f->>'id')
    FROM jsonb_array_elements(rep.facts) f
    WHERE f->>'approvedByNarrator'='true' AND
      f->>'fieldCode'=ANY(rep.requested_fields)
   ),'[]'::jsonb))
   ORDER BY rep.created_at,rep.id),'[]'::jsonb) INTO letters
  FROM public.spy_intel_reports rep WHERE rep.owner_house_id=p_house
   AND rep.status IN ('released','archived');
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',d.id,'targetType',d.target_type,'targetId',d.target_id,
  'version',d.version,'facts',coalesce((
   SELECT jsonb_agg(jsonb_build_object(
     'fieldCode',df.field_code,'disclosedValue',df.disclosed_value,
     'confidence',df.confidence,'observedDateKey',df.observed_date_key,
     'staleAtDateKey',df.stale_at_key) ORDER BY df.observed_date_key,df.id)
    FROM public.spy_dossier_facts df
    JOIN public.spy_intel_reports rep ON rep.id=df.report_id
    WHERE df.dossier_id=d.id AND df.owner_house_id=p_house AND df.approved
      AND rep.owner_house_id=p_house AND rep.status IN ('released','archived')
   ),'[]'::jsonb))
   ORDER BY d.target_type,d.target_id),'[]'::jsonb) INTO dossiers
  FROM public.spy_dossiers d WHERE d.owner_house_id=p_house;
 RETURN jsonb_build_object('houseId',p_house,'agents',agents,'missions',missions,
  'reports',letters,'dossiers',dossiers);
END $spy$;
REVOKE ALL ON FUNCTION public.spy_read_house_dashboard(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.spy_read_house_dashboard(text) TO authenticated;
COMMIT;
