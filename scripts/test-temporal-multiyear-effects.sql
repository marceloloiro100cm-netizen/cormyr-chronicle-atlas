-- Hub Temporal · Lote 21: 3 years, 2 active houses + draft, 2 armies,
-- multi-month building, audit, retroactive correction and no double effects.
-- ALL fixture writes roll back. Run only in disposable PostgreSQL 16 CI.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Lote21: %',label;END IF;END $$;

INSERT INTO auth.users(id) VALUES ('30000000-0000-0000-0000-000000000d01');
INSERT INTO public.user_roles(user_id,role) VALUES
 ('30000000-0000-0000-0000-000000000d01','admin');
INSERT INTO public.campaign_houses(id,name) VALUES
 ('l21-house-a','House 21 A'),('l21-house-b','House 21 B'),
 ('l21-house-draft','House 21 Draft');

INSERT INTO public.noble_house_sheets(house_id,state,version,updated_by) VALUES
 ('l21-house-a',jsonb_build_object(
  'schemaVersion',1,'houseId','l21-house-a','phase','active',
  'month',1522*12,'treasury',125,
  'permanent',jsonb_build_object('wealth',12,'power',40),
  'fortunes','[]'::jsonb,'actions','[]'::jsonb,
  'units','[{"id":"u-a1","types":["infantry"],"strength":100},{"id":"u-a2","types":["archers"],"strength":80}]'::jsonb,
  'holdings','[
    {"id":"a-old","itemId":"pros-master-of-arms","status":"active","effects":[{"kind":"fortune","amount":1}]},
    {"id":"a-parent","itemId":"tower","status":"building","effects":[]},
    {"id":"a-child","itemId":"pros-engineer","parentId":"a-parent","status":"building","effects":[]}
   ]'::jsonb,
  'projects','[
    {"id":"a-child-work","holdingId":"a-child","status":"building","start":18264,"duration":3},
    {"id":"a-parent-work","holdingId":"a-parent","status":"building","start":18264,"duration":2}
   ]'::jsonb
 ),1,'30000000-0000-0000-0000-000000000d01'),
 ('l21-house-b',jsonb_build_object(
  'schemaVersion',1,'houseId','l21-house-b','phase','active',
  'month',1521*12+11,'treasury',80,
  'permanent',jsonb_build_object('wealth',9,'power',17),
  'fortunes','[]'::jsonb,'actions','[]'::jsonb,
  'units','[{"id":"u-b1","types":["cavalry"],"strength":60}]'::jsonb,
  'holdings','[{"id":"b-old","itemId":"castle","status":"active","effects":[]}]'::jsonb,
  'projects','[]'::jsonb
 ),1,'30000000-0000-0000-0000-000000000d01'),
 ('l21-house-draft',jsonb_build_object(
  'schemaVersion',1,'houseId','l21-house-draft','phase','draft',
  'month',0,'treasury',99,'permanent',jsonb_build_object('power',77),
  'fortunes','[]'::jsonb,'actions','[]'::jsonb,
  'units','[]'::jsonb,'holdings','[]'::jsonb,'projects','[]'::jsonb
 ),1,'30000000-0000-0000-0000-000000000d01');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000d01',true);

-- First spring: dependent works finish once; House B catches up from 1521.
SELECT pg_temp.assert(
 (public.preview_house_time_impacts(1,'1522-04-01')->>'eligible')::int=2,
 'both active houses eligible; draft excluded');
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::int,
 '30000000-0000-4000-8000-000000000d11','set','1522-04-01',0,
 'Lote 21 primeiro salto mensal',false);
SELECT pg_temp.assert(
 (SELECT (state->>'month')::int=1522*12+3
 AND state->'projects'->0->>'status'='completed'
 AND state->'projects'->1->>'status'='completed'
 AND state->'holdings'->1->>'status'='active'
 AND state->'holdings'->2->>'status'='active'
 FROM public.noble_house_sheets WHERE house_id='l21-house-a'),
 'child/parent projects finish exactly once even in inverse order');
SELECT pg_temp.assert(
 (SELECT (state->>'month')::int=1522*12+3
 FROM public.noble_house_sheets WHERE house_id='l21-house-b'),
 'backlogged House B reconciles to absolute target');
SELECT pg_temp.assert(
 (SELECT count(*)=2 FROM public.noble_house_ledger WHERE action='calendar_advance'),
 'one ledger entry per active House and target month');

-- 1523 and 1524, then 1525: 12-month jumps with no automatic gains.
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::int,
 '30000000-0000-4000-8000-000000000d12','set','1523-01-01',0,
 'Lote 21 virada 1523',false);
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::int,
 '30000000-0000-4000-8000-000000000d13','set','1524-01-01',0,
 'Lote 21 salto anual 1524',false);
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::int,
 '30000000-0000-4000-8000-000000000d14','set','1525-01-01',0,
 'Lote 21 salto anual 1525',false);
SELECT pg_temp.assert(
 (public.get_campaign_calendar()->>'year')::int=1525,
 'calendar advances three years without corrupting month');
SELECT pg_temp.assert(
 (SELECT count(*)=8 FROM public.noble_house_ledger
 WHERE action='calendar_advance'),
 'four distinct target months recorded for each of two Houses');
SELECT pg_temp.assert(
 (SELECT count(*)=8 FROM public.noble_house_ledger
 WHERE action='calendar_advance' AND house_id IN ('l21-house-a','l21-house-b')),
 'no extra Houses received a monthly ledger operation');
SELECT pg_temp.assert(
 (SELECT state->>'treasury'='125'
 AND state->'permanent'->>'wealth'='12'
 AND state->'permanent'->>'power'='40'
 AND state->'fortunes'='[]'::jsonb
 AND state->'actions'='[]'::jsonb
 AND (state->>'month')::int=1525*12
 FROM public.noble_house_sheets WHERE house_id='l21-house-a'),
 'no passive treasury, Power, Fortune or action credit in three-year catch-up');
SELECT pg_temp.assert(
 (SELECT state->>'treasury'='80'
 AND state->'permanent'->>'wealth'='9'
 AND state->'permanent'->>'power'='17'
 AND state->'fortunes'='[]'::jsonb
 AND (state->>'month')::int=1525*12
 FROM public.noble_house_sheets WHERE house_id='l21-house-b'),
 'other House also has no silent economic gain');
SELECT pg_temp.assert(
 (SELECT jsonb_array_length(state->'units')=2
 AND state->'units'->0->>'id'='u-a1'
 AND state->'units'->0->>'strength'='100'
 AND state->'units'->1->>'id'='u-a2'
 AND state->'units'->1->>'strength'='80'
 AND jsonb_array_length(state->'holdings')=3
 FROM public.noble_house_sheets WHERE house_id='l21-house-a'),
 'no passive recruitment or duplicated holdings/units');
SELECT pg_temp.assert(
 (SELECT jsonb_array_length(state->'units')=1
 AND state->'units'->0->>'id'='u-b1'
 AND state->'units'->0->>'strength'='60'
 FROM public.noble_house_sheets WHERE house_id='l21-house-b'),
 'second Army unaffected across annual changes');
SELECT pg_temp.assert(
 (SELECT version=1 AND state->>'month'='0'
 AND state->>'treasury'='99'
 FROM public.noble_house_sheets WHERE house_id='l21-house-draft'),
 'draft House never auto-updated by calendar');

-- Each month change produces exactly one projection per military consumer,
-- and one manual review per economy; not automatic effect execution.
SELECT pg_temp.assert(
 (SELECT count(*)=4 FROM jsonb_array_elements(
 public.get_temporal_consumer_dashboard(100)->'deliveries') d
 WHERE d->>'consumer_code'='army-units' AND d->>'status'='informational'),
 'four genuine monthly transitions each emit one army projection');
SELECT pg_temp.assert(
 (SELECT count(*)=4 FROM jsonb_array_elements(
 public.get_temporal_consumer_dashboard(100)->'deliveries') d
 WHERE d->>'consumer_code'='economy' AND d->>'status'='pending'),
 'economy receives four pending reviews, no automatic gold');

-- Retrying with same operation must never duplicate ledger, delivery or money.
SELECT pg_temp.assert(
 public.publish_campaign_time_change(
  (public.get_campaign_calendar()->>'version')::int,
  '30000000-0000-4000-8000-000000000d14','set','1525-01-01',0,
  'Lote 21 salto anual 1525',false)->>'duplicate'='true',
 'last jump replay idempotent');
SELECT pg_temp.assert(
 (SELECT count(*)=8 FROM public.noble_house_ledger WHERE action='calendar_advance'),
 'replay has no duplicate House payments or monthly postings');
SELECT pg_temp.assert(
 (SELECT count(*)=4 FROM jsonb_array_elements(
 public.get_temporal_consumer_dashboard(100)->'deliveries') d
 WHERE d->>'consumer_code'='army-units'),
 'replay does not send duplicate army notification');

-- Rewind and catch up to an already processed month; no refunds or repeated work.
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::int,
 '30000000-0000-4000-8000-000000000d15','set','1523-04-01',0,
 'Lote 21 retrocesso autorizado',true);
SELECT pg_temp.assert(
 (SELECT count(*)=8 FROM public.noble_house_ledger WHERE action='calendar_advance'),
 'narrative correction does not refund/rewind processed House months');
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::int,
 '30000000-0000-4000-8000-000000000d16','set','1525-01-01',0,
 'Lote 21 retorno a mes ja processado',false);
SELECT pg_temp.assert(
 (SELECT count(*)=8 FROM public.noble_house_ledger WHERE action='calendar_advance'),
 'return to processed month does not duplicate House ledger');
SELECT pg_temp.assert(
 (SELECT (state->>'month')::int=1525*12
 AND state->'projects'->0->>'status'='completed'
 AND state->'projects'->1->>'status'='completed'
 AND jsonb_array_length(state->'holdings')=3
 AND jsonb_array_length(state->'units')=2
 AND state->>'treasury'='125' FROM public.noble_house_sheets WHERE house_id='l21-house-a'),
 'retroactive correction has no destructive side effects');

-- Only a NEW absolute month may create another House journal entry.
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::int,
 '30000000-0000-4000-8000-000000000d17','set','1525-02-01',0,
 'Lote 21 primeiro novo mes apos retrocesso',false);
SELECT pg_temp.assert(
 (SELECT count(*)=10 FROM public.noble_house_ledger WHERE action='calendar_advance'),
 'new destination appends one ledger per active House only');
SELECT pg_temp.assert(
 (SELECT count(*)=5 FROM jsonb_array_elements(
 public.get_temporal_consumer_dashboard(100)->'deliveries') d
 WHERE d->>'consumer_code'='army-units' AND d->>'direction'='forward'
 AND d->>'status'='informational'),
 'historical corrections do not duplicate army combat bonuses');

RESET ROLE;
SELECT pg_temp.assert(
 (SELECT count(*)=0 FROM public.campaign_temporal_effect_checkpoints),
 'outbox deliberately executes zero automated military/economic checkpoints');
SELECT pg_temp.assert(
 (SELECT count(*)=0 FROM public.noble_house_ledger
 WHERE house_id='l21-house-draft' AND action='calendar_advance'),
 'no monthly operation was performed on draft House');
SELECT pg_temp.assert(
 (SELECT count(*)=10 AND count(DISTINCT (house_id,campaign_month))=10
 FROM public.noble_house_ledger WHERE action='calendar_advance'
 AND house_id LIKE 'l21-house-%'),
 'semantic (House,month) targets remain unique under rewind and replay');
ROLLBACK;
