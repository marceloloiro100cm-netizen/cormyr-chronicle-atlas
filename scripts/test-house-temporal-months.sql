-- Lote 9 · integracao atomica de posses, meses e prazos de construcao.
-- Executado sobre PostgreSQL efemero; nenhuma escrita em producao.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text)
RETURNS void LANGUAGE plpgsql AS $assert$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label;END IF;END $assert$;
INSERT INTO auth.users(id) VALUES
 ('30000000-0000-0000-0000-000000000491'),
 ('30000000-0000-0000-0000-000000000492');
INSERT INTO public.user_roles(user_id,role)
 VALUES('30000000-0000-0000-0000-000000000491','admin');
INSERT INTO public.campaign_houses(id,name)
 VALUES('time-house-9a','Casa A'),('time-house-9b','Casa B'),('time-house-9draft','Casa Rascunho');
INSERT INTO public.noble_house_sheets(house_id,state,version,updated_by) VALUES
 ('time-house-9a',jsonb_build_object(
 'schemaVersion',1,'houseId','time-house-9a','phase','active',
 'month',1522*12,'treasury',100,'permanent',jsonb_build_object('wealth',8),
 'fortunes','[]'::jsonb,'actions','[]'::jsonb,
 'holdings','[{"id":"parent","status":"building"},{"id":"child","parentId":"parent","status":"building"}]'::jsonb,
 'projects',jsonb_build_array(
  jsonb_build_object('id','c','holdingId','child','status','building','start',1522*12,'duration',2),
  jsonb_build_object('id','p','holdingId','parent','status','building','start',1522*12,'duration',1,'modifier',0))
 ),1,'30000000-0000-0000-0000-000000000491'),
 ('time-house-9b',jsonb_build_object(
 'schemaVersion',1,'houseId','time-house-9b','phase','active',
 'month',1521*12+11,'holdings','[]'::jsonb,'projects','[]'::jsonb,
 'fortunes','[]'::jsonb,'actions','[]'::jsonb
 ),1,'30000000-0000-0000-0000-000000000491'),
 ('time-house-9draft',jsonb_build_object(
 'schemaVersion',1,'houseId','time-house-9draft','phase','draft',
 'month',0,'holdings','[]'::jsonb,'projects','[]'::jsonb
 ),1,'30000000-0000-0000-0000-000000000491');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000491',true);
SELECT pg_temp.assert(
 (public.preview_house_time_impacts(1,'1522-04-01')->>'eligible')::int=2,
 'both active Houses advance to the same absolute month');
SELECT pg_temp.assert(
 (public.preview_house_time_impacts(1,'1522-04-01')->>'drafts')::int=1,
 'draft House is counted but not automatically processed');
SELECT pg_temp.assert(
 (public.preview_house_time_impacts(1,'1522-04-01')->>'project_candidates')::int=2,
 'both due construction projects are identified');
DO $t$ BEGIN
 BEGIN PERFORM public.preview_house_time_impacts(0,'1522-04-01');
 RAISE EXCEPTION 'stale preview accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='stale preview accepted' OR SQLERRM NOT LIKE 'Calendário alterado%' THEN RAISE; END IF; END;
END $t$;

SELECT public.publish_campaign_time_change(
 1,'30000000-0000-4000-8000-000000000493','set','1522-04-01',0,
 'Avanco mensal A e B',false);
SELECT pg_temp.assert(
 (SELECT (state->>'month')::int=1522*12+3 FROM public.noble_house_sheets WHERE house_id='time-house-9a'),
 'House A advances exactly three absolute months');
SELECT pg_temp.assert(
 (SELECT (state->>'month')::int=1522*12+3 FROM public.noble_house_sheets WHERE house_id='time-house-9b'),
 'House B was one month behind the previous global date but catches up to ABSOLUTE target');
SELECT pg_temp.assert(
 (SELECT (state->>'month')::int=0 FROM public.noble_house_sheets WHERE house_id='time-house-9draft'),
 'unapproved draft remains untouched');
SELECT pg_temp.assert(
 (SELECT state->'projects'->0->>'status'='completed' AND state->'projects'->1->>'status'='completed'
 FROM public.noble_house_sheets WHERE house_id='time-house-9a'),
 'dependent child finishes after parent in same multi-month catch-up');
SELECT pg_temp.assert(
 (SELECT state->'holdings'->0->>'status'='active' AND state->'holdings'->1->>'status'='active'
 FROM public.noble_house_sheets WHERE house_id='time-house-9a'),
 'both parent and child holdings become active');
SELECT pg_temp.assert(
 (SELECT state->>'treasury'='100' AND state->'permanent'->>'wealth'='8'
  AND state->'fortunes'='[]'::jsonb AND state->'actions'='[]'::jsonb
 FROM public.noble_house_sheets WHERE house_id='time-house-9a'),
 'monthly clock has no passive gold income, resource gain, fortune or actions');
SELECT pg_temp.assert(
 (SELECT count(*)=2 FROM public.noble_house_ledger WHERE action='calendar_advance'
 AND campaign_month=1522*12+3),
 'ledger has one audit per affected House and destination month');
SELECT pg_temp.assert(
 (SELECT version=2 FROM public.noble_house_sheets WHERE house_id='time-house-9a'),
 'House revision increments exactly once');
SELECT pg_temp.assert(
 (public.publish_campaign_time_change(1,'30000000-0000-4000-8000-000000000493',
 'set','1522-04-01',0,'Avanco mensal A e B',false)->>'duplicate')='true',
 'retry returns existing temporal operation idempotently');
SELECT pg_temp.assert(
 (SELECT count(*)=2 FROM public.noble_house_ledger WHERE action='calendar_advance'),
 'retry does not create additional House ledger entries');

-- Change month forward; no project should be restarted or double-paid.
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::int,
 '30000000-0000-4000-8000-000000000494','set','1522-05-01',0,
 'Segundo mes sem projetos extras',false);
SELECT pg_temp.assert(
 (SELECT count(*)=4 FROM public.noble_house_ledger WHERE action='calendar_advance'),
 'each forward month processes exactly one House revision');
SELECT pg_temp.assert(
 (SELECT state->'projects'->0->>'status'='completed' FROM public.noble_house_sheets
 WHERE house_id='time-house-9a'),
 'completed project remains completed');

-- A retroactive correction does not undo finished building or roll back House month.
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::int,
 '30000000-0000-4000-8000-000000000495','set','1522-03-01',0,
 'Correcao historica autorizada pela mesa',true);
SELECT pg_temp.assert(
 (SELECT (state->>'month')::int=1522*12+4 FROM public.noble_house_sheets
 WHERE house_id='time-house-9a'),
 'backdate leaves House ledger and completed works intact');
SELECT pg_temp.assert(
 (public.preview_house_time_impacts(
  (public.get_campaign_calendar()->>'version')::int,'1522-04-01')->>'ahead')::int=2,
 'advance from an older corrected year reports Houses ahead rather than undo');
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::int,
 '30000000-0000-4000-8000-000000000496','set','1522-04-01',0,
 'Voltar a mes ja processado',false);
SELECT pg_temp.assert(
 (SELECT count(*)=4 FROM public.noble_house_ledger WHERE action='calendar_advance'),
 're-forward to already processed month does not duplicate it');
SELECT pg_temp.assert(
 (public.preview_house_time_impacts(
  (public.get_campaign_calendar()->>'version')::int,'1522-06-01')->>'eligible')::int=2,
 'previously ahead Houses become eligible when the Kingdom moves beyond them');
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::int,
 '30000000-0000-4000-8000-000000000497','set','1522-06-01',0,
 'Novo mes alem do historico anterior',false);
SELECT pg_temp.assert(
 (SELECT (state->>'month')::int=1522*12+5 FROM public.noble_house_sheets
 WHERE house_id='time-house-9a'),
 'later advance resumes at the new absolute month');
SELECT pg_temp.assert(
 (SELECT count(*)=6 FROM public.noble_house_ledger WHERE action='calendar_advance'),
 'later month generates exactly one new journal row per House');

-- Permission and isolation: player cannot read the bulk House impact preview.
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000492',true);
DO $t$ BEGIN
 BEGIN PERFORM public.preview_house_time_impacts(
  (public.get_campaign_calendar()->>'version')::integer,'1522-07-01');
  RAISE EXCEPTION 'player read private House preview';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='player read private House preview'
   OR SQLERRM NOT LIKE 'Apenas o Narrador%' THEN RAISE; END IF;
 END;
END $t$;
SET LOCAL ROLE anon;
SELECT pg_temp.assert(
 NOT has_function_privilege('anon','public.preview_house_time_impacts(integer,text)','EXECUTE'),
 'anonymous users cannot access bulk noble House preview');
SELECT pg_temp.assert(
 NOT has_function_privilege('authenticated','public.apply_calendar_months(integer)','EXECUTE'),
 'players cannot invoke internal processing directly');
RESET ROLE;
ROLLBACK;
