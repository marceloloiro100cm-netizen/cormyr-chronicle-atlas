-- Hub Temporal · Lote 20: scenario end-to-end INTEGRADO.
-- ONLY disposable PostgreSQL CI; all writes are in one ROLLBACK transaction.
-- Exercises one timeline through ages, historical letters, projects and army projections.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Lote20: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.age_at(p_id uuid,p_year integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT public.character_age_state(c,p_year)
 FROM public.campaign_characters c WHERE c.id=p_id
$$;

INSERT INTO auth.users(id) VALUES
 ('30000000-0000-0000-0000-000000000c01'),
 ('30000000-0000-0000-0000-000000000c02');
INSERT INTO public.user_roles(user_id,role)
 VALUES('30000000-0000-0000-0000-000000000c01','admin');
INSERT INTO public.campaign_houses(id,name)
 VALUES('lote20-a','Casa de Ensaio Integral');
INSERT INTO public.campaign_players(id,user_id,name)
 VALUES('30000000-0000-0000-0000-000000000c03',
 '30000000-0000-0000-0000-000000000c02','Jogador Isolado');
INSERT INTO public.house_memberships(player_id,house_id,authorized_by)
 VALUES('30000000-0000-0000-0000-000000000c03','lote20-a',
 '30000000-0000-0000-0000-000000000c01');

-- One existing army with 2 units; one completed historical holding; two
-- dependent buildings. Monthly processing MUST NOT invent new troops/bonuses.
INSERT INTO public.noble_house_sheets(house_id,state,version,updated_by)
 VALUES('lote20-a',jsonb_build_object(
  'schemaVersion',1,'houseId','lote20-a','phase','active',
  'month',1522*12,'treasury',125,'permanent',jsonb_build_object('wealth',12,'power',40),
  'fortunes','[]'::jsonb,'actions','[]'::jsonb,
  'units','[{"id":"u-archers","types":["archers"],"strength":100,"defense":5},{"id":"u-infantry","types":["infantry"],"strength":100,"defense":4}]'::jsonb,
  'holdings','[{"id":"historical","itemId":"pros-master-of-arms","status":"active","effects":[]},{"id":"parent","itemId":"tower","status":"building","effects":[]},{"id":"child","itemId":"pros-engineer","parentId":"parent","status":"building","effects":[]}]'::jsonb,
  'projects','[{"id":"child-work","holdingId":"child","status":"building","start":18264,"duration":2},{"id":"parent-work","holdingId":"parent","status":"building","start":18264,"duration":1}]'::jsonb
 ),1,'30000000-0000-0000-0000-000000000c01');

INSERT INTO public.campaign_characters(id,display_name,house_id,
 birth_year,age_policy,alive_status,confidence,review_status,visibility,is_noble,
 created_by,updated_by)
 VALUES('30000000-0000-0000-0000-000000000c04','Nobre da Casa de Ensaio',
 'lote20-a',1492,'year_turn','alive','confirmed','reviewed','house',true,
 '30000000-0000-0000-0000-000000000c01',
 '30000000-0000-0000-0000-000000000c01');
INSERT INTO public.character_source_links(
 character_id,source_kind,source_key,source_visibility,confirmed_by)
 VALUES('30000000-0000-0000-0000-000000000c04',
 'archive_history','lote20-confirmed-source','house',
 '30000000-0000-0000-0000-000000000c01');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000c01',true);

SELECT pg_temp.assert(
 (public.get_campaign_calendar()->>'year')='1522' AND
 (public.get_campaign_calendar()->>'version')='1',
 'fixture starts with canonical year 1522 and version 1');
SELECT pg_temp.assert(
 pg_temp.age_at('30000000-0000-0000-0000-000000000c04',1522)->>'age'='30',
 'noble born 1492 is thirty in 1522');

-- Mail round and dated mail: never move official time implicitly.
SELECT public.set_letter_round(1,false);
SELECT public.dated_mail_action('send_linked_mail',
 '{"p_key":"30000000-0000-0000-0000-000000000c05",
   "p_origin":"lote20-a",
   "p_targets":["p:30000000-0000-0000-0000-000000000c03"],
   "p_subject":"Carta do ensaio", "p_content":"Texto privado para teste transacional"}'::jsonb,
 '1522-01-01');
SELECT public.set_letter_round(2,false);
SELECT public.set_letter_round(3,false);
SELECT pg_temp.assert(
 (public.get_campaign_calendar()->>'version')='1'
 AND (public.get_campaign_calendar()->>'year')='1522',
 'sending/delivering mail does not mutate official clock');
SELECT pg_temp.assert(
 (SELECT campaign_date='1522-01-01' FROM public.campaign_letters
 WHERE batch_key='30000000-0000-0000-0000-000000000c05'),
 'original dated letter has fixed 1522-01-01 date');
SELECT pg_temp.assert(
 jsonb_array_length(public.calendar_mail_events(1522,0))=1,
 'historical message is visible to authorized narrator after delivery');

-- Jump three months: finish dependent construction without money/army effects.
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::integer,
 '30000000-0000-4000-8000-000000000c06',
 'set','1522-04-01',0,'Lote 20: conclusão de obras',false);
SELECT pg_temp.assert(
 (SELECT (state->>'month')::int=1522*12+3
 AND state->'projects'->0->>'status'='completed'
 AND state->'projects'->1->>'status'='completed'
 AND state->'holdings'->1->>'status'='active'
 AND state->'holdings'->2->>'status'='active'
 FROM public.noble_house_sheets WHERE house_id='lote20-a'),
 'dependent construction and absolute month processed exactly once');
SELECT pg_temp.assert(
 (SELECT state->>'treasury'='125'
 AND state->'permanent'->>'wealth'='12'
 AND state->'permanent'->>'power'='40'
 AND state->'fortunes'='[]'::jsonb AND state->'actions'='[]'::jsonb
 FROM public.noble_house_sheets WHERE house_id='lote20-a'),
 'monthly transition does not grant money, power, fortune or actions');
SELECT pg_temp.assert(
 (SELECT jsonb_array_length(state->'units')=2
 AND state->'units'->0->>'id'='u-archers'
 AND state->'units'->1->>'id'='u-infantry'
 AND jsonb_array_length(state->'holdings')=3
 FROM public.noble_house_sheets WHERE house_id='lote20-a'),
 'army units and holding records are not cloned or rewritten');
SELECT pg_temp.assert(
 (SELECT count(*)=1 FROM public.noble_house_ledger
 WHERE house_id='lote20-a' AND action='calendar_advance'),
 'one House monthly ledger entry for three-month jump');
SELECT pg_temp.assert(
 (SELECT count(*)=1 FROM jsonb_array_elements(
 public.get_temporal_consumer_dashboard(80)->'deliveries') d
 WHERE d->>'consumer_code'='army-units' AND d->>'status'='informational'),
 'army receives one informational projection notice, not a new troop');

-- Replaying same command is idempotent across all four domains.
SELECT pg_temp.assert(
 public.publish_campaign_time_change(1,
 '30000000-0000-4000-8000-000000000c06',
 'set','1522-04-01',0,'Lote 20: conclusão de obras',false)->>'duplicate'='true',
 'time publication retry must return an existing operation');
SELECT pg_temp.assert(
 (SELECT count(*)=1 FROM public.noble_house_ledger
 WHERE house_id='lote20-a' AND action='calendar_advance'),
 'idempotent retry cannot complete/bill a project twice');
SELECT pg_temp.assert(
 (SELECT count(*)=1 FROM jsonb_array_elements(
 public.get_temporal_consumer_dashboard(80)->'deliveries') d
 WHERE d->>'consumer_code'='army-units'),
 'idempotent retry cannot duplicate army integration notice');

-- Year boundary: age derives from source once; don't mutate genealogy/units/mail.
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::integer,
 '30000000-0000-4000-8000-000000000c07',
 'set','1523-01-01',0,'Lote 20: transição anual',false);
SELECT pg_temp.assert(
 pg_temp.age_at('30000000-0000-0000-0000-000000000c04',1523)->>'age'='31'
 AND (SELECT birth_year=1492 AND version=1
      FROM public.campaign_characters
      WHERE id='30000000-0000-0000-0000-000000000c04'),
 'age changes from official year without rewriting birth date/age baseline');
SELECT pg_temp.assert(
 (SELECT (state->>'month')::int=1523*12
 AND jsonb_array_length(state->'units')=2
 AND jsonb_array_length(state->'holdings')=3
 AND state->>'treasury'='125'
 FROM public.noble_house_sheets WHERE house_id='lote20-a'),
 'annual jump neither recruits troops nor duplicates holdings or treasury');
SELECT pg_temp.assert(
 (SELECT campaign_date='1522-01-01' FROM public.campaign_letters
 WHERE batch_key='30000000-0000-0000-0000-000000000c05'),
 'historical correspondence never inherits current year');
SELECT pg_temp.assert(
 (SELECT count(*)=2 FROM public.noble_house_ledger
 WHERE house_id='lote20-a' AND action='calendar_advance'),
 'two authorized target-month revisions across three-month and annual jumps');

-- Historical correction and return to previously processed month must not
-- produce irreversible refunds, duplicate old constructions or more soldiers.
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::integer,
 '30000000-0000-4000-8000-000000000c08',
 'set','1522-03-01',0,'Lote 20: retificação de narrativa',true);
SELECT pg_temp.assert(
 pg_temp.age_at('30000000-0000-0000-0000-000000000c04',1522)->>'age'='30',
 'age projection follows corrected year without mutating genealogy');
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::integer,
 '30000000-0000-4000-8000-000000000c09',
 'set','1523-01-01',0,'Lote 20: retorno ao presente processado',false);
SELECT pg_temp.assert(
 (SELECT count(*)=2 FROM public.noble_house_ledger
 WHERE house_id='lote20-a' AND action='calendar_advance'),
 'backdate and return cannot replay already processed House months');
SELECT pg_temp.assert(
 (SELECT state->>'month'=(1523*12)::text
 AND state->>'treasury'='125'
 AND state->'permanent'->>'power'='40'
 AND state->'fortunes'='[]'::jsonb
 AND jsonb_array_length(state->'units')=2
 AND jsonb_array_length(state->'holdings')=3
 AND state->'projects'->0->>'status'='completed'
 FROM public.noble_house_sheets WHERE house_id='lote20-a'),
 'House resources, army and finished projects stable through rewind/re-forward');
SELECT pg_temp.assert(
 (SELECT campaign_date='1522-01-01' FROM public.campaign_letters
 WHERE batch_key='30000000-0000-0000-0000-000000000c05'),
 'letter date survives full jump/backdate/return path');

RESET ROLE;
SELECT pg_temp.assert(
 (SELECT count(*)=0 FROM public.campaign_temporal_effect_checkpoints),
 'no automatic economic, construction or army effects were executed by outbox');
SELECT pg_temp.assert(
 (SELECT count(*)=1 FROM public.campaign_letters
 WHERE batch_key='30000000-0000-0000-0000-000000000c05'),
 'mail remains one delivered letter without duplication');

-- Other player cannot use narrator-only dashboard, publish dates or inspect army.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000c02',true);
DO $role$
DECLARE failed boolean;
BEGIN
 failed:=false;
 BEGIN PERFORM public.get_temporal_consumer_dashboard(20);
 EXCEPTION WHEN OTHERS THEN failed:=true; END;
 PERFORM pg_temp.assert(failed,'ordinary player cannot inspect private outbox dashboard');
 failed:=false;
 BEGIN PERFORM public.publish_campaign_time_change(
  1,'30000000-0000-4000-8000-000000000c10','advance',NULL,1,
  'Forbidden player publication',false);
 EXCEPTION WHEN OTHERS THEN failed:=true; END;
 PERFORM pg_temp.assert(failed,'ordinary player cannot publish official dates');
END $role$;
RESET ROLE;
ROLLBACK;
