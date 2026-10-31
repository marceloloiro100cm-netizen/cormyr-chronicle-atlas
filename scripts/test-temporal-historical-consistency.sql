-- Lote 25: historical calendar correction never redates, re-delivers or leaks mail.
-- Synthetic fixture and all changes exclusively in a CI transaction ROLLBACK.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Lote25: %',label;END IF;END $$;
INSERT INTO auth.users(id) VALUES
 ('30000000-0000-0000-0000-000000000f01'),
 ('30000000-0000-0000-0000-000000000f02'),
 ('30000000-0000-0000-0000-000000000f03');
INSERT INTO public.user_roles(user_id,role)
 VALUES('30000000-0000-0000-0000-000000000f01','admin');
INSERT INTO public.campaign_houses(id,name)
 VALUES('l25-a','Casa de teste A'),('l25-b','Casa de teste B');
INSERT INTO public.campaign_players(id,user_id,name) VALUES
 ('30000000-0000-0000-0000-000000000f04',
  '30000000-0000-0000-0000-000000000f02','Correspondente A'),
 ('30000000-0000-0000-0000-000000000f05',
  '30000000-0000-0000-0000-000000000f03','Correspondente B');
INSERT INTO public.house_memberships(player_id,house_id,authorized_by) VALUES
 ('30000000-0000-0000-0000-000000000f04','l25-a','30000000-0000-0000-0000-000000000f01'),
 ('30000000-0000-0000-0000-000000000f05','l25-b','30000000-0000-0000-0000-000000000f01');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000f01',true);
SELECT public.publish_campaign_time_change(
 1,'30000000-0000-4000-8000-000000000f11',
 'set','1522-F-midwinter',0,'Lote 25: início durante festival',false);
SELECT public.set_letter_round(1,false);
SELECT pg_temp.assert(
 (SELECT harptos_period='1522-F-midwinter' FROM public.letter_rounds WHERE number=1),
 'opening a round during a festival retains exact intercalary date');

-- The letter is restricted to House A and its time is explicitly historical.
SELECT public.dated_mail_action('send_linked_mail',
 '{"p_key":"30000000-0000-0000-0000-000000000f12",
   "p_origin":"l25-a",
   "p_targets":["p:30000000-0000-0000-0000-000000000f04"],
   "p_subject":"Carta histórica restrita à Casa A",
   "p_content":"Conteúdo de ensaio com acesso restrito"}'::jsonb,
 '1522-F-midwinter');
SELECT public.set_letter_round(2,false);
SELECT public.set_letter_round(3,false);
SELECT pg_temp.assert(
 (SELECT campaign_date='1522-F-midwinter' AND publication_state='delivered'
  FROM public.campaign_letters WHERE batch_key='30000000-0000-0000-0000-000000000f12'),
 'historical festival letter delivered and date fixed');
SELECT pg_temp.assert(jsonb_array_length(public.calendar_mail_events(1522,0))=1,
 'letter visible only in its historical month after delivery');

SELECT public.save_campaign_schedule_event(
 '{"date":"1522-04-17","title":"Audiência publicada no ano 1522",
   "description":"Ensaio de evento público","deleted":false}'::jsonb);
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::int,
 '30000000-0000-4000-8000-000000000f13','publish',NULL,0,
 'Lote 25: publicação da agenda histórica',false);
SELECT pg_temp.assert(
 jsonb_array_length(public.get_campaign_chronology(1522,3)->'events')=1,
 'published event visible in historical month');

-- One more year. Neither date of the letter nor the published event moves.
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::int,
 '30000000-0000-4000-8000-000000000f14','set','1523-01-01',0,
 'Lote 25: avanço de ano para testar histórico',false);
SELECT pg_temp.assert(
 (public.get_public_campaign_time()->>'year')='1523' AND
 (SELECT campaign_date='1522-F-midwinter' FROM public.campaign_letters
 WHERE batch_key='30000000-0000-0000-0000-000000000f12'),
 'official year changes but letter historical date does not');
SELECT pg_temp.assert(
 (SELECT harptos_period='1522-F-midwinter' FROM public.letter_rounds WHERE number=1),
 'old round retains its opening date after year change');

-- Authorized historical correction: don't redact/release/deduplicate messages.
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::int,
 '30000000-0000-4000-8000-000000000f15','set','1522-F-midwinter',0,
 'Lote 25: retificação histórica expressamente autorizada',true);
SELECT pg_temp.assert(
 (public.get_public_campaign_time()->>'year')='1522' AND
 (public.get_public_campaign_time()->>'festival')='midwinter',
 'new official present is the corrected festival');
SELECT pg_temp.assert(
 (SELECT campaign_date='1522-F-midwinter' AND publication_state='delivered'
 FROM public.campaign_letters WHERE batch_key='30000000-0000-0000-0000-000000000f12'),
 'historical correction cannot alter letter date or delivery');
SELECT pg_temp.assert(
 (SELECT harptos_period='1522-F-midwinter' FROM public.letter_rounds WHERE number=1),
 'historical correction cannot rewrite round original reference');
SELECT pg_temp.assert(
 jsonb_array_length(public.calendar_mail_events(1522,0))=1 AND
 jsonb_array_length(public.calendar_mail_events(1522,1))=0,
 'retification never duplicates the letter into another month');
SELECT pg_temp.assert(
 jsonb_array_length(public.get_campaign_chronology(1522,3)->'events')=1,
 'previously published Kingdom event remains at its real historical date');

-- Re-forward to an already published year also preserves history.
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::int,
 '30000000-0000-4000-8000-000000000f16','set','1523-01-01',0,
 'Lote 25: retorno ao futuro já processado',false);
SELECT pg_temp.assert(
 (SELECT count(*)=1 FROM public.campaign_letters
 WHERE batch_key='30000000-0000-0000-0000-000000000f12'),
 'no additional copy of a past letter appears on re-forward');
SELECT pg_temp.assert(
 (public.get_campaign_chronology(1522,0)->'events'->0->>'date')='1522-F-midwinter',
 'historical chronology keeps Midwinter correctly after rewind and return');

-- Security must be tested AFTER corrections with two different player memberships.
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000f02',true);
SELECT pg_temp.assert(
 jsonb_array_length(public.get_campaign_chronology(1522,0)->'events')=1,
 'letter recipient retains access after chronology correction');
SELECT pg_temp.assert(
 jsonb_array_length(public.get_campaign_chronology(1522,3)->'events')=1,
 'recipient sees published event from the historical year');
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000f03',true);
SELECT pg_temp.assert(
 jsonb_array_length(public.calendar_mail_events(1522,0))=0,
 'other House cannot see private correspondence after correction');
SELECT pg_temp.assert(
 jsonb_array_length(public.get_campaign_chronology(1522,0)->'events')=0,
 'other House cannot discover private chronology entry');
SELECT pg_temp.assert(
 jsonb_array_length(public.get_campaign_chronology(1522,3)->'events')=1,
 'other House can still see only published Kingdom events');
RESET ROLE;
SELECT pg_temp.assert(
 (SELECT count(*)=1 FROM public.campaign_letters
 WHERE batch_key='30000000-0000-0000-0000-000000000f12'),
 'exactly one historical letter survives all calendar transitions');
SELECT pg_temp.assert(
 (SELECT count(*)=0 FROM public.campaign_temporal_effect_checkpoints),
 'no economic or military effects executed by correction');
ROLLBACK;
