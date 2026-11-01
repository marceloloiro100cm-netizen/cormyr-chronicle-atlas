-- Hub Temporal · Lote 24: Narrador/player authorization after a calendar update.
-- Disposable CI PostgreSQL only. Creates synthetic identities; ROLLBACK always.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Lote24: %',label;END IF;END $$;
CREATE FUNCTION pg_temp.must_deny(statement text,label text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE denied boolean:=false;
BEGIN
 BEGIN EXECUTE statement;
 EXCEPTION WHEN OTHERS THEN denied:=true; END;
 PERFORM pg_temp.assert(denied,label);
END $$;

INSERT INTO auth.users(id) VALUES
 ('30000000-0000-0000-0000-000000000e01'),
 ('30000000-0000-0000-0000-000000000e02');
INSERT INTO public.user_roles(user_id,role) VALUES
 ('30000000-0000-0000-0000-000000000e01','admin');
INSERT INTO public.campaign_houses(id,name)
 VALUES('l24-authority-house','Casa do teste de permissões');
INSERT INTO public.campaign_players(id,user_id,name)
 VALUES('30000000-0000-0000-0000-000000000e03',
  '30000000-0000-0000-0000-000000000e02','Jogador do teste');
INSERT INTO public.house_memberships(player_id,house_id,authorized_by)
 VALUES('30000000-0000-0000-0000-000000000e03',
 'l24-authority-house','30000000-0000-0000-0000-000000000e01');
INSERT INTO public.noble_house_sheets(house_id,state,version,updated_by)
 VALUES('l24-authority-house',jsonb_build_object(
  'schemaVersion',1,'houseId','l24-authority-house','phase','active',
  'month',1522*12,'treasury',125,
  'permanent',jsonb_build_object('power',40,'wealth',12),
  'fortunes','[]'::jsonb,'actions','[]'::jsonb,
  'units','[{"id":"u-l24","types":["infantry"],"strength":100}]'::jsonb,
  'holdings','[{"id":"h-l24","itemId":"tower","status":"active","effects":[]}]'::jsonb,
  'projects','[]'::jsonb),
  1,'30000000-0000-0000-0000-000000000e01');

-- Non-admin is a valid House member, not an anonymous outsider:
-- membership can view its data but NEVER move the global clock or review events.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub',
 '30000000-0000-0000-0000-000000000e02',true);
SELECT pg_temp.assert(public.get_public_campaign_time()->>'year'='1522',
 'authorized player can read public clock');
SELECT pg_temp.must_deny('SELECT public.get_temporal_release_preflight()',
 'house member cannot open administrative preflight');
SELECT pg_temp.must_deny('SELECT public.get_temporal_consumer_dashboard(50)',
 'house member cannot inspect private outbox');
SELECT pg_temp.must_deny('SELECT public.preview_house_time_impacts(1,''1522-02-01'')',
 'house member cannot inspect other Houses via monthly preview');
SELECT pg_temp.must_deny('SELECT public.preview_campaign_time_change(1,''set'',''1522-02-01'',0,false)',
 'house member cannot preview narrator-only publication');
SELECT pg_temp.must_deny('SELECT public.get_campaign_schedule_drafts()',
 'house member cannot inspect unpublished event drafts');
SELECT pg_temp.must_deny('SELECT public.get_campaign_time_history(10)',
 'house member cannot read administrator time operation history');
SELECT pg_temp.must_deny('SELECT public.apply_calendar_months(1)',
 'house member cannot directly invoke transaction-only monthly processor');
SELECT pg_temp.must_deny('SELECT count(*) FROM public.campaign_temporal_deliveries',
 'member cannot select internal delivery rows');
SELECT pg_temp.must_deny('SELECT public.publish_campaign_time_change(1,''30000000-0000-4000-8000-000000000e20'',''set'',''1522-02-01'',0,''Unauthorized player publish'',false)',
 'house member cannot publish official month even with current version');
SELECT pg_temp.must_deny('SELECT public.resolve_temporal_delivery(''30000000-0000-4000-8000-000000000e40'',''30000000-0000-4000-8000-000000000e41'',''reviewed'',''Player tried to approve a review'')',
 'player cannot resolve manual outbox items');
SELECT pg_temp.must_deny('SELECT public.replay_temporal_delivery(''30000000-0000-4000-8000-000000000e40'')',
 'player cannot replay private outbox payloads');

-- The authorized Narrator publishes a month and reviews a real delivery.
SELECT set_config('request.jwt.claim.sub',
 '30000000-0000-0000-0000-000000000e01',true);
SELECT pg_temp.assert(
 (public.preview_house_time_impacts(1,'1522-02-01')->>'eligible')::int=1,
 'Narrator may preview one active House before advancing');
SELECT pg_temp.assert(
 public.get_temporal_release_preflight()->>'month_processing_preflight_ok'='true',
 'preflight confirms a valid synthetic House');
SELECT public.publish_campaign_time_change(
 1,'30000000-0000-4000-8000-000000000e21',
 'set','1522-02-01',0,'Lote 24: publicação autorizada',false);
SELECT pg_temp.assert(
 (public.get_campaign_calendar()->>'version')::int=2 AND
 (public.get_campaign_calendar()->>'month')::int=1,
 'narrator published official next month with optimistic version');
SELECT pg_temp.assert(
 (SELECT (state->>'month')::int=1522*12+1 AND
  state->>'treasury'='125' AND
  state->'permanent'->>'power'='40' AND
  jsonb_array_length(state->'units')=1
 FROM public.noble_house_sheets WHERE house_id='l24-authority-house'),
 'month advances House without crediting wealth, power or troops');
SELECT pg_temp.assert(
 (SELECT count(*)=1 FROM public.noble_house_ledger
 WHERE house_id='l24-authority-house' AND action='calendar_advance'),
 'one authorized House monthly ledger operation');

-- Old version and unauthorized historical correction are rejected for Narrator.
SELECT pg_temp.must_deny(
 'SELECT public.preview_campaign_time_change(1,''set'',''1522-03-01'',0,false)',
 'stale narrator preview cannot use version 1');
SELECT pg_temp.must_deny(
 'SELECT public.publish_campaign_time_change(1,''30000000-0000-4000-8000-000000000e22'',''set'',''1522-03-01'',0,''Stale Narrator command'',false)',
 'stale narrator publication cannot advance the official clock');
SELECT pg_temp.must_deny(
 'SELECT public.publish_campaign_time_change(2,''30000000-0000-4000-8000-000000000e23'',''set'',''1522-01-01'',0,''Attempted backdate without permission'',false)',
 'Narrator historical correction requires an explicit backdate flag');
SELECT pg_temp.assert(
 (public.get_campaign_calendar()->>'version')::int=2,
 'rejected narrator commands do not change calendar version');

-- Review acknowledges a decision without changing treasury or units.
DO $review$
DECLARE delivery uuid;result jsonb;
BEGIN
 SELECT (d->>'id')::uuid INTO delivery FROM jsonb_array_elements(
  public.get_temporal_consumer_dashboard(100)->'deliveries') d
 WHERE d->>'consumer_code'='economy' AND d->>'status'='pending' LIMIT 1;
 PERFORM pg_temp.assert(delivery IS NOT NULL,'economy manual review exists');
 result:=public.resolve_temporal_delivery(delivery,
  '30000000-0000-4000-8000-000000000e30',
  'reviewed','Revisado pelo Narrador sem pagamento ou crédito');
 PERFORM pg_temp.assert(result->>'duplicate'='false','Narrator confirms first review');
 result:=public.resolve_temporal_delivery(delivery,
  '30000000-0000-4000-8000-000000000e30',
  'reviewed','Revisado pelo Narrador sem pagamento ou crédito');
 PERFORM pg_temp.assert(result->>'duplicate'='true','exact duplicate review acknowledged');
 PERFORM pg_temp.must_deny(format(
  'SELECT public.resolve_temporal_delivery(%L,%L,%L,%L)',
  delivery,'30000000-0000-4000-8000-000000000e30',
  'skipped','Attempt to replace old decision'),
  'reused idempotency key cannot change review decision');
 PERFORM pg_temp.assert(
  public.replay_temporal_delivery(delivery)->>'replay_read_only'='true',
  'replay remains read only even after manual review');
END $review$;

-- Player must remain unauthorized AFTER the Narrator changes the calendar.
SELECT set_config('request.jwt.claim.sub',
 '30000000-0000-0000-0000-000000000e02',true);
SELECT pg_temp.assert(
 public.get_public_campaign_time()->>'year'='1522' AND
 (public.get_public_campaign_time()->>'month')::int=1,
 'player sees newly published public clock');
SELECT pg_temp.must_deny('SELECT public.get_temporal_consumer_dashboard(100)',
 'player does not gain outbox read access after publication');
SELECT pg_temp.must_deny('SELECT public.get_temporal_release_preflight()',
 'player does not gain preflight privileges after publication');
SELECT pg_temp.must_deny('SELECT public.preview_house_time_impacts(2,''1522-03-01'')',
 'player cannot preview monthly assets at new version');
SELECT pg_temp.must_deny(
 'SELECT public.publish_campaign_time_change(2,''30000000-0000-4000-8000-000000000e24'',''set'',''1522-03-01'',0,''Unauthorized after update'',false)',
 'player cannot reuse Narrator new version to advance time');
SELECT pg_temp.must_deny('SELECT public.resolve_temporal_delivery(''30000000-0000-4000-8000-000000000e40'',''30000000-0000-4000-8000-000000000e42'',''reviewed'',''Player not allowed to approve'')',
 'player cannot approve any consumer resolution after month changes');
SELECT pg_temp.assert(
 public.get_public_campaign_time()->>'version'='2',
 'player attacks leave public calendar at Narrator version 2');

RESET ROLE;
SELECT pg_temp.assert(
 (SELECT count(*)=1 FROM public.campaign_temporal_delivery_resolutions
 WHERE request_key='30000000-0000-4000-8000-000000000e30'),
 'one durable resolution per idempotency key');
SELECT pg_temp.assert(
 (SELECT count(*)=0 FROM public.campaign_temporal_effect_checkpoints),
 'manual review and player attacks never run automatic effects');
SELECT pg_temp.assert(
 (SELECT state->>'treasury'='125' AND jsonb_array_length(state->'units')=1
 FROM public.noble_house_sheets WHERE house_id='l24-authority-house'),
 'no hidden treasury or military mutation after permission attacks');
ROLLBACK;
