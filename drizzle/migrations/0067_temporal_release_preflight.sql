-- Hub Temporal · Lote 11: corrige saltos sazonais longos e oferece
-- diagnóstico administrativo SOMENTE LEITURA para plano de implantação.
BEGIN;
SET LOCAL lock_timeout='5s';

-- Conta fronteiras de estação efetivamente cruzadas. Comparar apenas a
-- estação inicial/final é incorreto num salto >= 1 ano com mesmo inverno.
CREATE OR REPLACE FUNCTION public.temporal_season_crossings(
 p_from text,p_to text
) RETURNS integer LANGUAGE plpgsql IMMUTABLE SET search_path=public AS $season$
DECLARE a integer;b integer;crossings integer;
BEGIN
 IF NOT public.valid_campaign_date(p_from) OR NOT public.valid_campaign_date(p_to) THEN
  RAISE EXCEPTION 'Data Harptos inválida no intervalo sazonal'; END IF;
 a:=left(p_from,4)::integer*12+
 CASE WHEN substring(p_from,6,2)='F-' THEN
  CASE substring(p_from,8)
   WHEN 'midwinter' THEN 0 WHEN 'greengrass' THEN 3 WHEN 'midsummer' THEN 6
   WHEN 'shieldmeet' THEN 6 WHEN 'highharvestide' THEN 8 ELSE 10 END
 ELSE substring(p_from,6,2)::integer-1 END;
 b:=left(p_to,4)::integer*12+
 CASE WHEN substring(p_to,6,2)='F-' THEN
  CASE substring(p_to,8)
   WHEN 'midwinter' THEN 0 WHEN 'greengrass' THEN 3 WHEN 'midsummer' THEN 6
   WHEN 'shieldmeet' THEN 6 WHEN 'highharvestide' THEN 8 ELSE 10 END
 ELSE substring(p_to,6,2)::integer-1 END;
 SELECT count(*)::integer INTO crossings FROM generate_series(
  least(a,b)+1,greatest(a,b)
 ) s(month_index)
 WHERE month_index%12 IN (2,5,8,11);
 RETURN coalesce(crossings,0);
END $season$;
REVOKE ALL ON FUNCTION public.temporal_season_crossings(text,text)
 FROM PUBLIC,anon,authenticated;

-- O processamento mensal/etário ocorre antes do INSERT da operação.
-- A outbox do Lote 10 é executada somente após publicação confirmada.
CREATE OR REPLACE FUNCTION public.enqueue_campaign_temporal_consumers()
RETURNS trigger LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $enqueue$
DECLARE
 from_month integer;to_month integer;from_year integer;to_year integer;
 from_season text;to_season text;ord_from integer;ord_to integer;
 dir text;season_crossings integer;entry public.campaign_temporal_consumers;
 matches_boundary boolean;summary jsonb;
BEGIN
 from_year:=(NEW.before_state->>'year')::integer;
 to_year:=(NEW.after_state->>'year')::integer;
 from_month:=(NEW.before_state->>'month')::integer;
 to_month:=(NEW.after_state->>'month')::integer;
 from_season:=CASE from_month
  WHEN 0 THEN 'winter' WHEN 1 THEN 'winter'
  WHEN 2 THEN 'spring' WHEN 3 THEN 'spring' WHEN 4 THEN 'spring'
  WHEN 5 THEN 'summer' WHEN 6 THEN 'summer' WHEN 7 THEN 'summer'
  WHEN 8 THEN 'autumn' WHEN 9 THEN 'autumn' WHEN 10 THEN 'autumn'
  ELSE 'winter' END;
 to_season:=CASE to_month
  WHEN 0 THEN 'winter' WHEN 1 THEN 'winter'
  WHEN 2 THEN 'spring' WHEN 3 THEN 'spring' WHEN 4 THEN 'spring'
  WHEN 5 THEN 'summer' WHEN 6 THEN 'summer' WHEN 7 THEN 'summer'
  WHEN 8 THEN 'autumn' WHEN 9 THEN 'autumn' WHEN 10 THEN 'autumn'
  ELSE 'winter' END;
 ord_from:=public.harptos_calendar_ordinal(NEW.from_date);
 ord_to:=public.harptos_calendar_ordinal(NEW.to_date);
 season_crossings:=public.temporal_season_crossings(NEW.from_date,NEW.to_date);
 dir:=CASE WHEN ord_to>ord_from THEN 'forward'
  WHEN ord_to<ord_from THEN 'backward' ELSE 'same' END;
 summary:=jsonb_build_object(
  'operation_id',NEW.id,'calendar_version',NEW.after_state->'version',
  'from',NEW.from_date,'to',NEW.to_date,'direction',dir,'published_mode',NEW.mode,
  'month_delta',(to_year*12+to_month)-(from_year*12+from_month),
  'year_delta',to_year-from_year,'season_from',from_season,'season_to',to_season,'season_crossings',season_crossings,
  'rule_effects_applied',false);
 FOR entry IN SELECT * FROM public.campaign_temporal_consumers WHERE enabled ORDER BY code LOOP
  matches_boundary:=CASE entry.boundary
   WHEN 'always' THEN true
   WHEN 'date' THEN ord_from<>ord_to
   WHEN 'month' THEN from_year*12+from_month<>to_year*12+to_month
   WHEN 'year' THEN from_year<>to_year
   WHEN 'season' THEN season_crossings>0
   ELSE false END;
  IF matches_boundary THEN
   INSERT INTO public.campaign_temporal_deliveries(
    operation_id,consumer_code,calendar_version,from_date,to_date,
    direction,boundary,mode,status,payload)
   VALUES(NEW.id,entry.code,(NEW.after_state->>'version')::integer,
    NEW.from_date,NEW.to_date,dir,entry.boundary,entry.mode,
    CASE WHEN entry.mode='projection' THEN 'informational' ELSE 'pending' END,
    summary||jsonb_build_object('consumer',entry.code,'boundary',entry.boundary))
   ON CONFLICT(operation_id,consumer_code) DO NOTHING;
  END IF;
 END LOOP;
 RETURN NEW;
END $enqueue$;

REVOKE ALL ON FUNCTION public.enqueue_campaign_temporal_consumers()
 FROM PUBLIC,anon,authenticated;

-- Pré-voo gerencial read-only. NÃO representa aprovação de deploy e nunca
-- consulta segredos de Casas ou altera dados.
CREATE OR REPLACE FUNCTION public.get_temporal_release_preflight()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $preflight$
DECLARE c public.campaign_calendar;
 count_total integer;count_invalid integer;count_active integer;
 count_draft integer;count_lag integer;count_ahead integer;count_pending integer;
 count_history integer;count_deliveries integer;
 month_target integer;
BEGIN
 IF NOT public.is_campaign_admin() OR auth.uid() IS NULL THEN
  RAISE EXCEPTION 'Pré-voo temporal exclusivo do Narrador'; END IF;
 SELECT * INTO c FROM public.campaign_calendar WHERE id=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'Calendário oficial indisponível'; END IF;
 month_target:=c.year*12+c.month;
 WITH classified AS (
  SELECT state,house_id,
   CASE WHEN jsonb_typeof(state) IS DISTINCT FROM 'object'
     OR state->>'schemaVersion' IS DISTINCT FROM '1'
     OR state->>'houseId' IS DISTINCT FROM house_id
     OR coalesce(state->>'month','') !~ '^[0-9]{1,6}$'
     OR jsonb_typeof(state->'holdings') IS DISTINCT FROM 'array'
     OR jsonb_typeof(state->'projects') IS DISTINCT FROM 'array'
     OR (state->>'phase'='active' AND EXISTS(
       SELECT 1 FROM jsonb_array_elements(
        CASE WHEN jsonb_typeof(state->'projects')='array'
          THEN state->'projects' ELSE '[]'::jsonb END
       ) p(project)
       WHERE p.project->>'status'='building'
       AND (coalesce(p.project->>'start','') !~ '^[0-9]{1,6}$'
         OR coalesce(p.project->>'duration','') !~ '^[0-9]{1,6}$'
         OR coalesce(p.project->>'modifier','0') !~ '^-?[0-9]{1,6}$'
         OR p.project->>'holdingId' IS NULL)
     )) THEN true ELSE false END AS invalid
  FROM public.noble_house_sheets
 ), valid_rows AS (
  SELECT state,invalid,NOT invalid AND state->>'phase'='active' AS active,
  CASE WHEN NOT invalid AND coalesce(state->>'month','') ~ '^[0-9]{1,6}$'
   THEN (state->>'month')::integer ELSE NULL END AS month_value
  FROM classified
 )
 SELECT count(*)::integer,
  count(*) FILTER(WHERE invalid)::integer,
  count(*) FILTER(WHERE active)::integer,
  count(*) FILTER(WHERE NOT invalid AND NOT active)::integer,
  count(*) FILTER(WHERE active AND month_value<month_target)::integer,
  count(*) FILTER(WHERE active AND month_value>month_target)::integer
 INTO count_total,count_invalid,count_active,count_draft,count_lag,count_ahead
 FROM valid_rows;
 SELECT count(*)::integer INTO count_pending
 FROM public.campaign_temporal_deliveries WHERE status='pending';
 SELECT count(*)::integer INTO count_history FROM public.campaign_time_operations;
 SELECT count(*)::integer INTO count_deliveries FROM public.campaign_temporal_deliveries;
 RETURN jsonb_build_object(
  'calendar_version',c.version,
  'official_date',public.harptos_time_key(c.year,c.month,c.day,c.festival),
  'official_month',month_target,
  'house_sheets',count_total,'active_houses',count_active,
  'draft_houses',count_draft,'invalid_houses',count_invalid,
  'lagging_houses',count_lag,'ahead_houses',count_ahead,
  'operations',count_history,'deliveries',count_deliveries,
  'manual_reviews_pending',count_pending,
  'month_processing_preflight_ok',count_invalid=0,
  'requires_production_backup',true,
  'requires_homologation',true,
  'automatic_economic_effects_enabled',false);
END $preflight$;
REVOKE ALL ON FUNCTION public.get_temporal_release_preflight() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_temporal_release_preflight() TO authenticated;
COMMIT;
