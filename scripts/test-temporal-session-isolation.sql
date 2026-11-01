-- Hub Temporal · Lote 26. Same database connection, different JWT subjects:
-- no old House correspondence, GM dashboard or historical date may leak.
-- Disposable PostgreSQL 16 CI only; ALL data is reverted by ROLLBACK.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Lote26: %',label;END IF;END $$;
CREATE FUNCTION pg_temp.deny(statement text,label text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE refused boolean:=false;
BEGIN
 BEGIN EXECUTE statement;
 EXCEPTION WHEN OTHERS THEN refused:=true; END;
 PERFORM pg_temp.assert(refused,label);
END $$;

INSERT INTO auth.users(id) VALUES
 ('30000000-0000-0000-0000-000000002601'),
 ('30000000-0000-0000-0000-000000002602'),
 ('30000000-0000-0000-0000-000000002603');
INSERT INTO public.user_roles(user_id,role)
 VALUES('30000000-0000-0000-0000-000000002601','admin');
INSERT INTO public.campaign_houses(id,name) VALUES
 ('l26-a','Lote 26 Casa A'),('l26-b','Lote 26 Casa B');
INSERT INTO public.campaign_players(id,user_id,name) VALUES
 ('30000000-0000-0000-0000-000000002611',
  '30000000-0000-0000-0000-000000002602','Jogador A do ensaio'),
 ('30000000-0000-0000-0000-000000002612',
  '30000000-0000-0000-0000-000000002603','Jogador B do ensaio');
INSERT INTO public.house_memberships(player_id,house_id,authorized_by) VALUES
 ('30000000-0000-0000-0000-000000002611','l26-a',
  '30000000-0000-0000-0000-000000002601'),
 ('30000000-0000-0000-0000-000000002612','l26-b',
  '30000000-0000-0000-0000-000000002601');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000002601',true);
SELECT public.set_letter_round(1,false);
SELECT public.dated_mail_action('send_linked_mail',
 '{"p_key":"30000000-0000-0000-0000-000000002621",
  "p_origin":"l26-a",
  "p_targets":["p:30000000-0000-0000-0000-000000002611"],
  "p_subject":"Somente Casa A",
  "p_content":"Conteúdo confidencial do ensaio A"}'::jsonb,'1522-01-06');
SELECT public.dated_mail_action('send_linked_mail',
 '{"p_key":"30000000-0000-0000-0000-000000002622",
  "p_origin":"l26-b",
  "p_targets":["p:30000000-0000-0000-0000-000000002612"],
  "p_subject":"Somente Casa B",
  "p_content":"Conteúdo confidencial do ensaio B"}'::jsonb,'1522-01-08');
SELECT public.set_letter_round(2,false);
SELECT public.set_letter_round(3,false);

SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000002602',true);
SELECT pg_temp.assert(
 jsonb_array_length(public.calendar_mail_events(1522,0))=1 AND
 (public.calendar_mail_events(1522,0)->0->>'title')='Somente Casa A',
 'A sees only its own historical letter');
SELECT pg_temp.deny('SELECT public.get_temporal_consumer_dashboard(10)',
 'A cannot inspect GM-only temporal consumer cache');

-- Switch JWT claim on the SAME PostgreSQL connection: every fresh RPC must
-- return B's records instead of A's cached/previous results.
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000002603',true);
SELECT pg_temp.assert(
 jsonb_array_length(public.calendar_mail_events(1522,0))=1 AND
 (public.calendar_mail_events(1522,0)->0->>'title')='Somente Casa B',
 'after switching A to B in same session, private chronology belongs to B');
SELECT pg_temp.assert(
 (public.get_campaign_chronology(1522,0)->'events'->0->>'title')='Somente Casa B',
 'private history does not bleed from prior user');
SELECT pg_temp.deny('SELECT public.get_temporal_consumer_dashboard(10)',
 'B cannot inherit narrator private outbox permissions');

-- A second switch must not retain data from B.
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000002602',true);
SELECT pg_temp.assert(
 (public.calendar_mail_events(1522,0)->0->>'title')='Somente Casa A',
 'switching B back to A returns A only');

-- Missing JWT after logout: private RPCs must fail, not return last user's data.
SELECT set_config('request.jwt.claim.sub','',true);
SELECT pg_temp.deny('SELECT public.calendar_mail_events(1522,0)',
 'signed-out session cannot access old mail events');
SELECT pg_temp.deny('SELECT public.get_campaign_chronology(1522,0)',
 'signed-out session cannot read old chronology');
SELECT pg_temp.deny('SELECT public.get_temporal_consumer_dashboard(10)',
 'signed-out session cannot read narrator dashboard');
RESET ROLE;
SELECT pg_temp.assert(
 (SELECT count(*)=2 FROM public.campaign_letters
  WHERE batch_key IN ('30000000-0000-0000-0000-000000002621',
                      '30000000-0000-0000-0000-000000002622')),
 'synthetic mail remains exactly two rows without cross-account duplication');
ROLLBACK;
