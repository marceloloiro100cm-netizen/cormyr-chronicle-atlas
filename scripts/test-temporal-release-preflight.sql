-- Lote 11 · regressão de estações e pré-voo gerencial, somente em PostgreSQL descartável.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label;END IF;END $$;
INSERT INTO auth.users(id) VALUES
 ('30000000-0000-0000-0000-000000000b10'),
 ('30000000-0000-0000-0000-000000000b11');
INSERT INTO public.user_roles(user_id,role)
 VALUES('30000000-0000-0000-0000-000000000b10','admin');
SELECT pg_temp.assert(public.temporal_season_crossings('1522-01-01','1523-01-01')=4,
 '12 months crosses four seasons although start/end are both winter');
SELECT pg_temp.assert(public.temporal_season_crossings('1523-01-01','1522-01-01')=4,
 'backwards year also crosses four season boundaries');
SELECT pg_temp.assert(public.temporal_season_crossings('1522-12-01','1523-01-01')=0,
 'winter across year without a boundary must not notify seasons');
SELECT pg_temp.assert(public.temporal_season_crossings('1524-07-30','1524-F-shieldmeet')=0,
 'intercalary festival must not generate false season transitions');
SELECT pg_temp.assert(public.temporal_season_crossings('1522-02-30','1522-03-01')=1,
 'winter-to-spring month boundary produces one crossing');
SELECT pg_temp.assert(public.temporal_season_crossings('1522-03-01','1522-02-30')=1,
 'reverse month boundary produces one crossing');
DO $negative$
BEGIN
 BEGIN PERFORM public.temporal_season_crossings('1522-13-01','1523-01-01');
  RAISE EXCEPTION 'Invalid date accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='Invalid date accepted'
   OR SQLERRM NOT LIKE 'Data Harptos inválida%' THEN RAISE;END IF;
 END;
END $negative$;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000b10',true);
SELECT pg_temp.assert(
 (public.get_temporal_release_preflight()->>'calendar_version')::integer=1,
 'read-only preflight reads official calendar version');
SELECT pg_temp.assert(
 public.get_temporal_release_preflight()->>'requires_production_backup'='true',
 'preflight never claims production backup has already been performed');
SELECT pg_temp.assert(
 public.get_temporal_release_preflight()->>'automatic_economic_effects_enabled'='false',
 'preflight cannot advertise passive monthly earnings');

SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::int,
 '30000000-0000-4000-8000-000000000b12','set','1523-01-01',0,
 'Teste de travessia anual completa de estacoes',false);
SELECT pg_temp.assert(
 (SELECT count(*) FROM jsonb_array_elements(
  public.get_temporal_consumer_dashboard(80)->'deliveries') x(d)
  WHERE d->>'consumer_code'='seasons' AND d->>'direction'='forward')=1,
 'long year shift emits one season review even when starting and ending in winter');
SELECT pg_temp.assert(
 (public.replay_temporal_delivery((
  SELECT (d->>'id')::uuid FROM jsonb_array_elements(
   public.get_temporal_consumer_dashboard(80)->'deliveries') x(d)
  WHERE d->>'consumer_code'='seasons' LIMIT 1
 ))->'payload'->>'season_crossings')='4',
 'outbox records the exact number of crossed season boundaries');
SELECT pg_temp.assert(
 (SELECT count(*) FROM jsonb_array_elements(
  public.get_temporal_consumer_dashboard(80)->'deliveries') x(d)
  WHERE d->>'consumer_code'='noble-ages')=1,
 'year transition produces one age projection');
SELECT pg_temp.assert(
 (public.get_temporal_release_preflight()->>'manual_reviews_pending')::int>=4,
 'manual review notices created, no automatic economy changes');

-- Regressão de correção histórica não reverte decisões nem cria uma estação fictícia.
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::int,
 '30000000-0000-4000-8000-000000000b13','set','1522-12-01',0,
 'Retificacao de fim de ano explicitamente autorizada',true);
SELECT pg_temp.assert(
 (SELECT count(*) FROM jsonb_array_elements(
  public.get_temporal_consumer_dashboard(80)->'deliveries') x(d)
  WHERE d->>'consumer_code'='seasons')=1,
 'December-to-January historical correction within winter has no season event');
SELECT pg_temp.assert(
 (SELECT count(*) FROM jsonb_array_elements(
  public.get_temporal_consumer_dashboard(80)->'deliveries') x(d)
  WHERE d->>'consumer_code'='economy' AND d->>'direction'='backward')=1,
 'month correction requests review, not automatically reversed resources');

RESET ROLE;
INSERT INTO public.campaign_houses(id,name) VALUES('time-house-invalid-11','Casa Inválida 11');
INSERT INTO public.noble_house_sheets(house_id,state,version,updated_by)
 VALUES('time-house-invalid-11',
  '{"schemaVersion":1,"houseId":"time-house-invalid-11","phase":"active","month":"incorreto","holdings":[],"projects":[]}'::jsonb,
  1,'30000000-0000-0000-0000-000000000b10');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000b10',true);
SELECT pg_temp.assert(
 (public.get_temporal_release_preflight()->>'invalid_houses')::integer>=1,
 'preflight identifies malformed legacy noble house state');
SELECT pg_temp.assert(
 public.get_temporal_release_preflight()->>'month_processing_preflight_ok'='false',
 'invalid House explicitly blocks monthly readiness');

SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000b11',true);
DO $rls$
BEGIN
 BEGIN PERFORM public.get_temporal_release_preflight();
  RAISE EXCEPTION 'non-admin accessed private preflight';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='non-admin accessed private preflight'
   OR SQLERRM NOT LIKE 'Pré-voo temporal exclusivo%' THEN RAISE;END IF;
 END;
END $rls$;
ROLLBACK;
