BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;
INSERT INTO auth.users(id) VALUES ('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002'),('10000000-0000-0000-0000-000000000003'),('10000000-0000-0000-0000-000000000004'),('10000000-0000-0000-0000-000000000005');
INSERT INTO user_roles VALUES('10000000-0000-0000-0000-000000000001','admin');
INSERT INTO campaign_houses(id,name) VALUES('mail-a','A'),('mail-b','B'),('mail-c','C');
INSERT INTO campaign_players(id,user_id,name) VALUES ('10000000-0000-0000-0000-000000000012','10000000-0000-0000-0000-000000000002','Recipient 2'),('10000000-0000-0000-0000-000000000013','10000000-0000-0000-0000-000000000003','Recipient 3'),('10000000-0000-0000-0000-000000000014','10000000-0000-0000-0000-000000000004','Recipient 4'),('10000000-0000-0000-0000-000000000015','10000000-0000-0000-0000-000000000005','Recipient 5');
INSERT INTO house_memberships(player_id,house_id,authorized_by) VALUES('10000000-0000-0000-0000-000000000012','mail-a','10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000013','mail-b','10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000014','mail-c','10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000015','mail-b','10000000-0000-0000-0000-000000000001');
INSERT INTO campaign_records(id,house_id,visibility,kind,title,content,created_by,updated_by)
VALUES('10000000-0000-0000-0000-000000000050','mail-a','house','character','Court source','Private biography','10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002');
INSERT INTO noble_house_sheets(house_id,updated_by,state) VALUES('mail-a','10000000-0000-0000-0000-000000000002','{"court":[{"id":"court-1","npcId":"10000000-0000-0000-0000-000000000050","role":"Administrador","name":""}],"units":[{"id":"unit-1","name":"Guard","destroyed":false},{"id":"unit-dead","name":"Destroyed","destroyed":true}]}');
UPDATE noble_house_sheets SET state='{"schemaVersion":1,"houseId":"mail-a","month":18264,"projects":[{"id":"p","holdingId":"h","start":18264,"duration":1,"modifier":0,"status":"building"}],"holdings":[{"id":"h","status":"building"}]}' WHERE house_id='mail-a';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.assert(valid_campaign_date('1522-02-30'),'February has 30 days');
SELECT pg_temp.assert(NOT valid_campaign_date('1522-F-shieldmeet') AND valid_campaign_date('1524-F-shieldmeet'),'leap festival');
SELECT pg_temp.assert(NOT valid_campaign_date(NULL) AND NOT valid_campaign_date('1522-13-01'),'invalid dates');
SELECT set_campaign_calendar((get_campaign_calendar()->>'version')::int,'1522-01-21',true);
SELECT set_letter_round(1,false);
SELECT pg_temp.assert((SELECT harptos_period='1522-01:désdia-3' FROM letter_rounds WHERE number=1),'round remembers Harptos period at opening');
SELECT pg_temp.assert(get_campaign_calendar()->>'day'='21','first round establishes baseline');
SELECT set_letter_round(2,false);
SELECT pg_temp.assert(get_campaign_calendar()->>'month'='1' AND get_campaign_calendar()->>'day'='1','third desdia advances month');
SELECT pg_temp.assert((SELECT state->'projects'->0->>'status'='completed' FROM noble_house_sheets WHERE house_id='mail-a'),'global month completes project');
SELECT pg_temp.assert((SELECT count(*)=1 FROM noble_house_ledger WHERE house_id='mail-a' AND action='calendar_advance'),'advance audited once');
SELECT set_letter_round(2,false);
SELECT pg_temp.assert(get_campaign_calendar()->>'day'='1','same round does not advance twice');
SELECT set_letter_round(2,true);
SELECT pg_temp.assert(get_campaign_calendar()->>'day'='1','closing does not advance');
SELECT set_campaign_calendar((get_campaign_calendar()->>'version')::int,'1522-02-01',false);
SELECT set_letter_round(3,false);
SELECT pg_temp.assert(get_campaign_calendar()->>'day'='1','automatic disabled');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
DO $$ BEGIN
 BEGIN PERFORM set_campaign_calendar(1,'1522-01-01',true); RAISE EXCEPTION 'unauthorized calendar accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='unauthorized calendar accepted' THEN RAISE; END IF; END;
 BEGIN PERFORM send_linked_mail('10000000-0000-0000-0000-000000000900','mail-a',ARRAY['p:10000000-0000-0000-0000-000000000013'],'Missing date','x'); RAISE EXCEPTION 'missing date accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='missing date accepted' THEN RAISE; END IF; END;
 BEGIN PERFORM dated_mail_action('send_linked_mail','{}','1522-01-31'); RAISE EXCEPTION 'invalid date accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='invalid date accepted' THEN RAISE; END IF; END;
END $$;
SELECT dated_mail_action('send_linked_mail','{"p_key":"10000000-0000-0000-0000-000000000901","p_origin":"mail-a","p_targets":["p:10000000-0000-0000-0000-000000000013"],"p_subject":"Private event","p_content":"x"}','1522-02-03');
SELECT pg_temp.assert(nullif(current_setting('cormyr.mail_date',true),'') IS NULL,'date context restored');
SELECT dated_mail_action('send_linked_mail','{"p_key":"10000000-0000-0000-0000-000000000901","p_origin":"mail-a","p_targets":["p:10000000-0000-0000-0000-000000000013"],"p_subject":"Private event","p_content":"x"}','1522-02-03');
SELECT pg_temp.assert(jsonb_array_length(calendar_mail_events(1522,1))=1,'retry does not duplicate events');
DO $$ BEGIN
 BEGIN PERFORM dated_mail_action('send_linked_mail','{"p_key":"10000000-0000-0000-0000-000000000901","p_origin":"mail-a","p_targets":["p:10000000-0000-0000-0000-000000000013"],"p_subject":"Private event","p_content":"x"}','1522-02-04'); RAISE EXCEPTION 'changed date retry accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='changed date retry accepted' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
SELECT pg_temp.assert(jsonb_array_length(calendar_mail_events(1522,1))=0,'unrelated player cannot discover private event');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
SELECT pg_temp.assert(jsonb_array_length(calendar_mail_events(1522,1))=1,'recipient sees delivered event');
SELECT dated_mail_action('reply_weekly_message',jsonb_build_object('p_letter',(SELECT id FROM campaign_letters WHERE batch_key='10000000-0000-0000-0000-000000000901'),'p_key','10000000-0000-0000-0000-000000000902','p_content','Reply event'),'1522-02-04');
SELECT pg_temp.assert(jsonb_array_length(calendar_mail_events(1522,1))=1,'scheduled reply not an occurred event');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
SELECT set_letter_round(4,false);
SELECT pg_temp.assert(jsonb_array_length(calendar_mail_events(1522,1))=2,'delivered reply becomes calendar event');
SELECT delete_campaign_letter((SELECT id FROM campaign_letters WHERE batch_key='10000000-0000-0000-0000-000000000901'));
SELECT pg_temp.assert(jsonb_array_length(calendar_mail_events(1522,1))=0,'deleted thread removes calendar events');
-- Lote 8: sender character labels and date reference remain separate from auth.
SELECT dated_mail_action('send_linked_mail',jsonb_build_object(
 'p_key','10000000-0000-0000-0000-000000000931',
 'p_targets',jsonb_build_array('p:10000000-0000-0000-0000-000000000013'),
 'p_subject','Edito real','p_content','Por ordem da Coroa',
 'p_week',4,'p_signed_by','Rei Musgrave Phelles'),'1522-02-04');
SELECT pg_temp.assert((SELECT sender_name='Rei Musgrave Phelles' AND sender_user_id='10000000-0000-0000-0000-000000000001'::uuid
 FROM campaign_letters WHERE batch_key='10000000-0000-0000-0000-000000000931'),
 'narrator NPC signature does not replace authenticated author');
SELECT dated_mail_action('reply_weekly_message',jsonb_build_object(
 'p_letter',(SELECT id FROM campaign_letters WHERE batch_key='10000000-0000-0000-0000-000000000931'),
 'p_key','10000000-0000-0000-0000-000000000932',
 'p_content','Complemento do Intendente','p_signed_by','Intendente Régio'),
 '1522-02-04');
SELECT pg_temp.assert((SELECT author_name='Intendente Régio'
 AND author_user_id='10000000-0000-0000-0000-000000000001'::uuid
 FROM letter_replies WHERE idempotency_key='10000000-0000-0000-0000-000000000932'),
 'narrator addendum bears supplied NPC signature');
SELECT pg_temp.assert(coalesce(current_setting('cormyr.mail_signature',true),'')='',
 'signature context restored after dated action');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
DO $spoof$ BEGIN
 BEGIN
  PERFORM dated_mail_action('send_linked_mail',jsonb_build_object(
    'p_key','10000000-0000-0000-0000-000000000933',
    'p_origin','mail-a','p_targets',jsonb_build_array('narrator'),
    'p_subject','Falso decreto','p_content','Não autorizado',
    'p_signed_by','Rei Phelles'),'1522-02-04');
  RAISE EXCEPTION 'player forged NPC signature';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='player forged NPC signature' OR SQLERRM NOT LIKE 'Somente o Narrador escolhe%' THEN RAISE; END IF;
 END;
END $spoof$;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.assert((SELECT harptos_period IS NOT NULL FROM letter_rounds WHERE number=4),
 'open round has Harptos period recorded');
ROLLBACK;
