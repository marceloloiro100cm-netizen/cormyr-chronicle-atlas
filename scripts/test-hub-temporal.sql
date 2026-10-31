-- Lote 4: transactional, idempotent and narrator-only Harptos advancement.
-- Completely rolled back; this test never changes production.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text)
 RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;

INSERT INTO auth.users(id) VALUES
 ('60000000-0000-0000-0000-000000000001'),
 ('60000000-0000-0000-0000-000000000002');
INSERT INTO public.user_roles(user_id,role)
 VALUES('60000000-0000-0000-0000-000000000001','admin');
INSERT INTO public.campaign_houses(id,name) VALUES('hub-temporal-house','Casa Teste');

SELECT pg_temp.assert(public.harptos_add_desdias('1522-03-17',1)='1522-03-27',
 'middle of desdia advances exactly 10 ordinary days');
SELECT pg_temp.assert(public.harptos_add_desdias('1522-12-21',1)='1523-01-01',
 'last desdia of Nightal crosses CV year');
SELECT pg_temp.assert(public.harptos_add_desdias('1524-07-21',1)='1524-08-01',
 'Shieldmeet year counts festivals separately');
SELECT pg_temp.assert(public.harptos_add_desdias('1522-F-midwinter',1)='1522-02-10',
 'starting on Midwinter counts 10 subsequent ordinary days');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','60000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.assert(
 public.preview_campaign_time_change(
  (public.get_campaign_calendar()->>'version')::integer,2
 )->>'to'='1522-01-21','read-only preview forecasts 21 Hammer');
SELECT pg_temp.assert((SELECT count(*)=0 FROM public.campaign_time_changes),
 'preview cannot create audit entries');
SELECT pg_temp.assert((SELECT count(*)=0 FROM public.campaign_time_outbox),
 'preview cannot create notifications');

SELECT pg_temp.assert(
 public.publish_campaign_time_change(
 '60000000-0000-0000-0000-000000000a01',
 (public.get_campaign_calendar()->>'version')::integer,2,
 'Avanço inicial de teste do Hub Temporal'
 )->>'duplicate'='false','first transaction applied');
SELECT pg_temp.assert(public.get_campaign_calendar()->>'day'='21',
 'published official date agrees with preview');

SELECT pg_temp.assert(
 public.preview_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::integer,1
 )->'crossed_festivals'->0->>'id'='midwinter',
 'Midwinter recorded while crossing to Alturiak');
SELECT pg_temp.assert(
 public.preview_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::integer,1
 )->>'to'='1522-02-01',
 'one desdia crosses month, not an extra festival desdia');

SELECT pg_temp.assert(
 public.publish_campaign_time_change(
 '60000000-0000-0000-0000-000000000a02',
 (public.get_campaign_calendar()->>'version')::integer,1,
 'Mudança de mês após a terceira désdia'
 )->'snapshot'->>'month'='1','month crossing committed');

-- Round numbers still advance for mail distribution; Harptos date must not.
SELECT public.set_letter_round(1,false);
SELECT public.set_letter_round(2,false);
SELECT pg_temp.assert(public.get_campaign_calendar()->>'day'='1' AND
 public.get_campaign_calendar()->>'month'='1',
 'opening mail rounds cannot change Harptos day or month');
SELECT pg_temp.assert(public.get_campaign_calendar()->>'last_round'='2',
 'mail round remains tracked for delivery');

-- Idempotent retries never re-run month processing or outbox events.
SELECT pg_temp.assert(
 public.publish_campaign_time_change(
 '60000000-0000-0000-0000-000000000a02',2,1,
 'Mudança de mês após a terceira désdia'
 )->>'duplicate'='true','exact retry returns existing operation');
SELECT pg_temp.assert((SELECT COUNT(*)=2 FROM public.campaign_time_changes),
 'only two time changes exist');
SELECT pg_temp.assert((SELECT COUNT(*)=2 FROM public.campaign_time_outbox
 WHERE kind='campaign.desdia.advanced'),
 'only two desdia events exist');

DO $reject$
BEGIN
 BEGIN
 PERFORM public.publish_campaign_time_change(
 '60000000-0000-0000-0000-000000000a02',2,3,
 'Mudança de mês após a terceira désdia');
 RAISE EXCEPTION 'invalid idempotency accepted';
 EXCEPTION WHEN raise_exception THEN
 IF SQLERRM='invalid idempotency accepted' THEN RAISE; END IF;
 END;
 BEGIN
 PERFORM public.publish_campaign_time_change(
 '60000000-0000-0000-0000-000000000a03',1,1,
 'Tentativa concorrente com versão antiga');
 RAISE EXCEPTION 'stale expected version accepted';
 EXCEPTION WHEN raise_exception THEN
 IF SQLERRM='stale expected version accepted' THEN RAISE; END IF;
 END;
 BEGIN
 PERFORM public.set_campaign_calendar((public.get_campaign_calendar()->>'version')::int,
 '1522-02-11',true);
 RAISE EXCEPTION 'legacy publisher bypassed central command';
 EXCEPTION WHEN raise_exception THEN
 IF SQLERRM='legacy publisher bypassed central command' THEN RAISE; END IF;
 END;
END $reject$;

SELECT pg_temp.assert(public.get_campaign_calendar()->>'day'='1',
 'failed changes leave global date intact');
SELECT pg_temp.assert(
 public.publish_campaign_time_change(
 '60000000-0000-0000-0000-000000000a04',
 (public.get_campaign_calendar()->>'version')::integer,36,
 'Avançar um ano completo no calendário de Harptos'
 )->'snapshot'->>'year'='1523','one year crossing detected');
SELECT pg_temp.assert(
 (SELECT COUNT(*)=1 FROM public.campaign_time_outbox
 WHERE operation_key='60000000-0000-0000-0000-000000000a04'
 AND kind='campaign.year.changed'),
 'year crossing has one durable event, without changing NPC ages');
SELECT pg_temp.assert(
 (SELECT COUNT(*)=3 FROM public.campaign_time_changes),
 'advance history saved exactly once per operation');
SELECT pg_temp.assert(jsonb_array_length(public.get_campaign_time_change_history(10))=3,
 'narrator can inspect historic operations');

SELECT set_config('request.jwt.claim.sub','60000000-0000-0000-0000-000000000002',true);
DO $deny$
BEGIN
 BEGIN
 PERFORM public.preview_campaign_time_change(4,1);
 RAISE EXCEPTION 'non narrator got preview';
 EXCEPTION WHEN raise_exception THEN
 IF SQLERRM='non narrator got preview' THEN RAISE; END IF;
 END;
 BEGIN
 PERFORM public.publish_campaign_time_change(
 '60000000-0000-0000-0000-000000000a05',4,1,'Acesso indevido ao relógio da campanha');
 RAISE EXCEPTION 'non narrator advanced time';
 EXCEPTION WHEN raise_exception THEN
 IF SQLERRM='non narrator advanced time' THEN RAISE; END IF;
 END;
 BEGIN
 PERFORM public.get_campaign_time_change_history(10);
 RAISE EXCEPTION 'non narrator read private audit';
 EXCEPTION WHEN raise_exception THEN
 IF SQLERRM='non narrator read private audit' THEN RAISE; END IF;
 END;
END $deny$;
ROLLBACK;
