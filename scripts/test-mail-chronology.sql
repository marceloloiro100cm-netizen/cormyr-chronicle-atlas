-- Lote 8: regressão de datas, eventos, RLS, festivais e semanas independentes.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $assert$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label;END IF;END $assert$;

INSERT INTO auth.users(id) VALUES
 ('30000000-0000-0000-0000-000000000381'),
 ('30000000-0000-0000-0000-000000000382'),
 ('30000000-0000-0000-0000-000000000383');
INSERT INTO public.user_roles(user_id,role) VALUES('30000000-0000-0000-0000-000000000381','admin');
INSERT INTO public.campaign_houses(id,name) VALUES('chron-a','Casa Chron A'),('chron-b','Casa Chron B');
INSERT INTO public.campaign_players(id,user_id,name) VALUES
 ('30000000-0000-0000-0000-000000000384','30000000-0000-0000-0000-000000000382','Pessoa da Casa A'),
 ('30000000-0000-0000-0000-000000000385','30000000-0000-0000-0000-000000000383','Pessoa da Casa B');
INSERT INTO public.house_memberships(player_id,house_id,authorized_by) VALUES
 ('30000000-0000-0000-0000-000000000384','chron-a','30000000-0000-0000-0000-000000000381'),
 ('30000000-0000-0000-0000-000000000385','chron-b','30000000-0000-0000-0000-000000000381');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000381',true);

SELECT pg_temp.assert(public.campaign_date_in_month('1522-F-midwinter',1522,0),'Midwinter belongs to Hammer');
SELECT pg_temp.assert(NOT public.campaign_date_in_month('1522-F-midwinter',1522,1),'Midwinter is NOT in Alturiak');
SELECT pg_temp.assert(public.campaign_date_in_month('1522-F-greengrass',1522,3),'Greengrass belongs to Tarsakh');
SELECT pg_temp.assert(NOT public.campaign_date_in_month('1522-F-greengrass',1522,0),'Greengrass not in Hammer');
SELECT pg_temp.assert(public.campaign_date_in_month('1524-F-shieldmeet',1524,6),'Shieldmeet in Flamerule leap year');
SELECT pg_temp.assert(NOT public.campaign_date_in_month('1522-F-shieldmeet',1522,6),'no Shieldmeet in 1522');
SELECT pg_temp.assert(public.campaign_date_in_month('1522-F-feast-moon',1522,10),'Feast of the Moon in Uktar');
SELECT pg_temp.assert(NOT public.campaign_date_in_month('1522-F-feast-moon',1522,11),'Feast of Moon not in Nightal');

-- Opening correspondence remains an administrative action that does NOT move the clock.
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::integer,
 '30000000-0000-4000-8000-000000000391','set','1522-F-midwinter',0,
 'Ancoragem inicial dos registros de missivas',false);
SELECT public.set_letter_round(1,false);
SELECT pg_temp.assert(
 (SELECT harptos_period='1522-F-midwinter' FROM public.letter_rounds WHERE number=1),
 'week one captures the exact opening festival');
SELECT pg_temp.assert(
 (public.get_campaign_calendar()->>'festival')='midwinter',
 'week opening never alters current Harptos festival');
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::integer,
 '30000000-0000-4000-8000-000000000392','set','1522-F-greengrass',0,
 'Transição temporal independente da rodada',false);
SELECT pg_temp.assert(
 (SELECT harptos_period='1522-F-midwinter' FROM public.letter_rounds WHERE number=1),
 'changing official month does not redate historical round');
SELECT public.set_letter_round(2,false);
SELECT pg_temp.assert(
 (SELECT harptos_period='1522-F-greengrass' FROM public.letter_rounds WHERE number=2),
 'second round remembers Greengrass');
SELECT pg_temp.assert(
 (public.get_campaign_calendar()->>'festival')='greengrass',
 'second round opens without automatic time advance');
SELECT public.set_letter_round(2,false);
SELECT pg_temp.assert(
 (SELECT count(*)=2 FROM public.letter_rounds WHERE harptos_period IS NOT NULL),
 'reopening same active week does not re-stamp period');

-- Schedule a confidential letter using the existing permission-checked API,
-- deliberately dated in the PAST. Current campaign time must not change.
SELECT public.dated_mail_action('send_linked_mail',
 '{"p_key":"30000000-0000-0000-0000-000000000393",
 "p_origin":"chron-a",
 "p_targets":["p:30000000-0000-0000-0000-000000000384"],
 "p_subject":"Carta confidencial de Midwinter","p_content":"Segredo apenas da Casa A"}'::jsonb,
 '1522-F-midwinter');
SELECT pg_temp.assert(
 (SELECT campaign_date='1522-F-midwinter' FROM public.campaign_letters
 WHERE batch_key='30000000-0000-0000-0000-000000000393'),
 'letter retains explicitly selected historical date');
SELECT pg_temp.assert(
 (public.get_campaign_calendar()->>'festival')='greengrass',
 'historical letter date never replaces campaign present');

SELECT public.dated_mail_action('send_linked_mail',
 '{"p_key":"30000000-0000-0000-0000-000000000394",
 "p_origin":"chron-a",
 "p_targets":["p:30000000-0000-0000-0000-000000000384"],
 "p_subject":"Carta de Greengrass","p_content":"Correspondência do mês"}'::jsonb,
 '1522-F-greengrass');
SELECT pg_temp.assert(
 jsonb_array_length(public.calendar_mail_events(1522,0))=0
 AND jsonb_array_length(public.calendar_mail_events(1522,3))=0,
 'scheduled festival missives are invisible before delivery');
SELECT public.set_letter_round(3,false);
SELECT pg_temp.assert(
 (public.get_campaign_calendar()->>'festival')='greengrass',
 'delivering next correspondence week cannot advance Harptos');
SELECT pg_temp.assert(
 jsonb_array_length(public.calendar_mail_events(1522,0))=1,
 'Midwinter letter is shown in Hammer only after delivery');
SELECT pg_temp.assert(
 jsonb_array_length(public.calendar_mail_events(1522,1))=0,
 'festival letter is not copied to all other months');
SELECT pg_temp.assert(
 jsonb_array_length(public.calendar_mail_events(1522,3))=0,
 'Midwinter letter is not placed in Greengrass month');

SELECT pg_temp.assert(
 jsonb_array_length(public.calendar_mail_events(1522,3))=1,
 'Greengrass letter belongs exclusively to Tarsakh');
SELECT pg_temp.assert(
 (public.get_campaign_chronology(1522,3)->'events'->0->>'date')='1522-F-greengrass',
 'chronology includes a delivered dated letter');
SELECT pg_temp.assert(
 (public.get_campaign_chronology(1522,3)->'rounds'->0->>'number')='2',
 'chronology identifies immutable round-opening reference');
SELECT pg_temp.assert(
 (public.get_campaign_chronology(1522,0)->'rounds'->0->>'harptos_period')='1522-F-midwinter',
 'historical round remains in its own original festival month');
SELECT pg_temp.assert(
 jsonb_array_length(public.get_campaign_chronology(1522,1)->'rounds')=0,
 'no phantom rounds in unrelated month');

-- Approved events are published with the clock transaction, not as a draft leak.
SELECT public.save_campaign_schedule_event(
 '{"date":"1522-04-17","title":"Audiência do Conselho",
 "description":"Evento oficial confirmado","deleted":false}'::jsonb);
SELECT pg_temp.assert(
 jsonb_array_length(public.get_campaign_chronology(1522,3)->'events')=1,
 'event draft is invisible to chronology');
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::integer,
 '30000000-0000-4000-8000-000000000395','publish',NULL,0,
 'Publicar agenda sem avançar o relógio',false);
SELECT pg_temp.assert(
 jsonb_array_length(public.get_campaign_chronology(1522,3)->'events')=2,
 'published official event appears alongside delivered mail');
SELECT pg_temp.assert(
 (public.get_campaign_chronology(1522,3)->'events'->0->>'date')='1522-04-17',
 'official chronology sorts by Harptos ordinal, not lexical festival key');

-- Legacy completed round without stored Harptos period must remain unassigned.
RESET ROLE;
INSERT INTO public.letter_rounds(number,status,closed) VALUES (4,'closed',true);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000381',true);
SELECT pg_temp.assert(
 (public.get_campaign_chronology(1522,3)->>'unassigned_round_count')::integer=1,
 'legacy missing reference reported without fabricated date');
SELECT pg_temp.assert(
 (SELECT harptos_period IS NULL FROM public.letter_rounds WHERE number=4),
 'legacy missing round reference stays null');

-- A later year must not rewrite dates, delivery weeks, or the original round reference.
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::integer,
 '30000000-0000-4000-8000-000000000396','set','1523-01-01',0,
 'Avançar ano independente da correspondência',false);
SELECT pg_temp.assert(
 (SELECT harptos_period='1522-F-midwinter' FROM public.letter_rounds WHERE number=1),
 'year change never overwrites original mail-week period');
SELECT pg_temp.assert(
 (SELECT campaign_date='1522-F-midwinter' FROM public.campaign_letters
 WHERE batch_key='30000000-0000-0000-0000-000000000393'),
 'year change never overwrites dated letter');

-- Security: recipient sees only their correspondences, other House sees zero.
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000382',true);
SELECT pg_temp.assert(
 jsonb_array_length(public.get_campaign_chronology(1522,0)->'events')=1,
 'recipient sees delivered Midwinter letter');
SELECT pg_temp.assert(
 jsonb_array_length(public.get_campaign_chronology(1522,3)->'events')=2,
 'recipient sees mail and officially published events');
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000383',true);
SELECT pg_temp.assert(
 jsonb_array_length(public.get_campaign_chronology(1522,0)->'events')=0,
 'unrelated player cannot discover other House correspondence');
SELECT pg_temp.assert(
 jsonb_array_length(public.get_campaign_chronology(1522,3)->'events')=1,
 'unrelated player only sees published Kingdom events');
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.assert(
 NOT has_function_privilege('anon','public.get_campaign_chronology(integer,integer)','EXECUTE'),
 'anonymous visitors cannot access private chronology');
SELECT pg_temp.assert(
 NOT has_function_privilege('anon','public.calendar_mail_events(integer,integer)','EXECUTE'),
 'anonymous visitors cannot query correspondence events');
RESET ROLE;
ROLLBACK;
