-- Lote 4: DB integration tests. Completely rolled back in disposable PostgreSQL.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;
INSERT INTO auth.users(id) VALUES
 ('30000000-0000-0000-0000-000000000071'),
 ('30000000-0000-0000-0000-000000000072');
INSERT INTO public.user_roles(user_id,role) VALUES
 ('30000000-0000-0000-0000-000000000071','admin');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000071',true);

SELECT pg_temp.assert(public.harptos_ordinary_index('1522-03-17')+10=
 public.harptos_ordinary_index('1522-03-27'),'exactly ten ordinary days');
SELECT pg_temp.assert(public.harptos_advance_desdia('1522-03-17',1)='1522-03-27',
 'intermediate date advances by ten days');
SELECT pg_temp.assert(public.harptos_advance_desdia('1522-01-21',1)='1522-02-01',
 'Midwinter is not an ordinary day');
SELECT pg_temp.assert(public.harptos_advance_desdia('1522-F-midwinter',1)='1522-02-10',
 'starting on festival uses prior ordinary day');
SELECT pg_temp.assert(public.harptos_advance_desdia('1524-07-21',1)='1524-08-01',
 'Midsummer and Shieldmeet do not consume ordinary days');
SELECT pg_temp.assert(public.harptos_calendar_ordinal('1524-08-01')-
 public.harptos_calendar_ordinal('1524-07-30')=3,
 'leap year contains two distinct festivals');
SELECT pg_temp.assert(public.harptos_calendar_ordinal('1522-02-01')-
 public.harptos_calendar_ordinal('1522-01-21')=11,
 'intercalary days are counted chronologically');
DO $test$ BEGIN
 BEGIN PERFORM public.harptos_advance_desdia('9999-12-21',1);
  RAISE EXCEPTION 'out-of-range date accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='out-of-range date accepted' THEN RAISE; END IF;
 END;
END $test$;

-- First establish an arbitrary official baseline without changing week metadata.
SELECT pg_temp.assert(public.publish_campaign_time_change(
  (public.get_campaign_calendar()->>'version')::int,
  '30000000-0000-4000-8000-000000000171','set','1522-01-21',0,'Baseline autorizado',false
 )->>'day'='21','set succeeds');
SELECT pg_temp.assert((SELECT count(*)=1 FROM public.campaign_time_operations),
 'baseline has one operation');

SELECT pg_temp.assert(
 public.preview_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::int,'advance',NULL,1,false
 )->>'to'='1522-02-01','server preview computes next date');
SELECT pg_temp.assert(
 public.preview_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::int,'advance',NULL,1,false
 )->'crossed_festivals' @> '["1522-F-midwinter"]'::jsonb,
 'server preview includes intercalary festival');
SELECT pg_temp.assert(
 (public.preview_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::int,'advance',NULL,1,false
 )->>'calendar_days')::int=11,'preview includes all calendar days');

SELECT pg_temp.assert(public.publish_campaign_time_change(
  (public.get_campaign_calendar()->>'version')::int,
  '30000000-0000-4000-8000-000000000172','advance',NULL,1,'Avanço de teste',false
 )->>'month'='1','advance reaches Alturiak');
SELECT pg_temp.assert(public.get_campaign_calendar()->>'day'='1','day is the first of Alturiak');
SELECT pg_temp.assert(public.get_campaign_calendar()->>'auto_advance'='false',
 'legacy mail-trigger toggle disabled by time command');
SELECT pg_temp.assert(public.get_campaign_calendar()->>'published_week'='1',
 'mail week metadata stays unchanged');

-- A retry with an outdated version and the same UUID MUST be idempotent.
SELECT pg_temp.assert(
 public.publish_campaign_time_change(2,'30000000-0000-4000-8000-000000000172',
   'advance',NULL,1,'Avanço de teste',false)->>'duplicate'='true',
 'replayed operation is returned instead of executed again');
SELECT pg_temp.assert((SELECT count(*)=2 FROM public.campaign_time_operations),
 'replay does not create another operation');
SELECT pg_temp.assert((SELECT count(*)=2 FROM public.campaign_calendar_audit),
 'replay does not create another calendar audit');
DO $test$ BEGIN
 BEGIN
  PERFORM public.publish_campaign_time_change(2,
   '30000000-0000-4000-8000-000000000172','advance',NULL,2,'Avanço de teste',false);
  RAISE EXCEPTION 'idempotency key collision accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='idempotency key collision accepted' OR SQLERRM NOT LIKE 'Chave temporal já utilizada%' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.publish_campaign_time_change(2,
   '30000000-0000-4000-8000-000000000173','advance',NULL,1,'Avanço de teste',false);
  RAISE EXCEPTION 'stale version accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='stale version accepted' OR SQLERRM NOT LIKE 'Calendário alterado%' THEN RAISE; END IF;
 END;
END $test$;
SELECT pg_temp.assert((SELECT count(*)=2 FROM public.campaign_time_operations),
 'rejected operations leave no trace');

-- Mail round opening must not update day/month/year/version or published week.
SELECT public.set_letter_round(1,false);
SELECT pg_temp.assert((SELECT harptos_period='1522-02:désdia-1'
 FROM public.letter_rounds WHERE number=1),'mail round snapshots current désdia');
SELECT pg_temp.assert(public.get_campaign_calendar()->>'day'='1' AND
 public.get_campaign_calendar()->>'version'='3','new mail round does not move time');

-- Leap festival and year boundary, each independently previewed and published.
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::int,
 '30000000-0000-4000-8000-000000000174','set','1524-07-21',0,'Teste bissexto',false);
SELECT pg_temp.assert(
 public.preview_campaign_time_change((public.get_campaign_calendar()->>'version')::int,
 'advance',NULL,1,false)->'crossed_festivals'=
 '["1524-F-midsummer","1524-F-shieldmeet"]'::jsonb,
 'leap year preview contains both festivals');
SELECT pg_temp.assert(
 (public.preview_campaign_time_change((public.get_campaign_calendar()->>'version')::int,
 'advance',NULL,1,false)->>'calendar_days')::int=12,
 'leap advance crosses twelve calendar dates');
SELECT public.publish_campaign_time_change((public.get_campaign_calendar()->>'version')::int,
 '30000000-0000-4000-8000-000000000175','advance',NULL,1,'Avanço bissexto',false);
SELECT pg_temp.assert(public.get_campaign_calendar()->>'month'='7',
 'leap advance moves to Eleasis');

SELECT public.publish_campaign_time_change((public.get_campaign_calendar()->>'version')::int,
 '30000000-0000-4000-8000-000000000176','set','1524-12-21',0,'Virada de ano',false);
SELECT pg_temp.assert(public.preview_campaign_time_change((public.get_campaign_calendar()->>'version')::int,
 'advance',NULL,1,false)->'crossed_years'='[1525]'::jsonb,
 'preview records upcoming year');
SELECT public.publish_campaign_time_change((public.get_campaign_calendar()->>'version')::int,
 '30000000-0000-4000-8000-000000000177','advance',NULL,1,'Avanço anual',false);
SELECT pg_temp.assert(public.get_campaign_calendar()->>'year'='1525' AND
 public.get_campaign_calendar()->>'month'='0' AND public.get_campaign_calendar()->>'day'='1',
 'Nightal to Hammer year rollover');

-- Past dates require explicit Narrator approval and a real reason; no rollback.
DO $test$ BEGIN
 BEGIN
  PERFORM public.publish_campaign_time_change(
   (public.get_campaign_calendar()->>'version')::int,
   '30000000-0000-4000-8000-000000000178','set','1524-12-21',0,'Sem autorização',false);
  RAISE EXCEPTION 'backdate accepted without authorization';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='backdate accepted without authorization' OR SQLERRM NOT LIKE 'Retrocesso exige%' THEN RAISE; END IF;
 END;
END $test$;
SELECT pg_temp.assert((SELECT count(*)=6 FROM public.campaign_time_operations),
 'unauthorized backdate did not mutate history');
SELECT public.publish_campaign_time_change((public.get_campaign_calendar()->>'version')::int,
 '30000000-0000-4000-8000-000000000179','set','1524-12-21',0,
 'Retificação histórica explícita do Narrador',true);
SELECT pg_temp.assert(public.get_campaign_calendar()->>'year'='1524',
 'authorized narrator can correct historical date');
SELECT pg_temp.assert(
 public.preview_campaign_time_change((public.get_campaign_calendar()->>'version')::int,
 'set','1523-12-21',0,true)->'crossed_years'='[1523]'::jsonb,
 'backward preview lists the destination year');
SELECT pg_temp.assert(jsonb_array_length(public.get_campaign_time_history(20))=7,
 'history is limited and includes all authorized operations');

-- No cross-user reading of command history and no legacy writer bypass.
SELECT pg_temp.assert(NOT has_function_privilege('authenticated',
 'public.publish_campaign_schedule_confirmed(integer,text,boolean,integer)','EXECUTE'),
 'obsolete calendar writer is revoked');
SELECT pg_temp.assert((SELECT count(*)=0 FROM pg_trigger
 WHERE tgrelid='public.letter_rounds'::regclass AND tgname='calendar_round' AND NOT tgisinternal),
 'legacy round advancement trigger removed');
SELECT pg_temp.assert(NOT has_table_privilege('authenticated','public.campaign_time_operations','SELECT'),
 'new operation audit table is not directly readable');
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000072',true);
DO $test$ BEGIN
 BEGIN PERFORM public.preview_campaign_time_change(8,'advance',NULL,1,false);
  RAISE EXCEPTION 'unauthorized preview';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='unauthorized preview' OR SQLERRM NOT LIKE 'Somente o Narrador%' THEN RAISE; END IF;
 END;
 BEGIN PERFORM public.get_campaign_time_history(20);
  RAISE EXCEPTION 'unauthorized history';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='unauthorized history' OR SQLERRM NOT LIKE 'Histórico temporal exclusivo%' THEN RAISE; END IF;
 END;
 BEGIN PERFORM public.publish_campaign_time_change(8,'30000000-0000-4000-8000-000000000180',
  'advance',NULL,1,'Tentativa sem acesso',false);
  RAISE EXCEPTION 'unauthorized publication';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='unauthorized publication' OR SQLERRM NOT LIKE 'Somente o Narrador%' THEN RAISE; END IF;
 END;
END $test$;
RESET ROLE;
ROLLBACK;
