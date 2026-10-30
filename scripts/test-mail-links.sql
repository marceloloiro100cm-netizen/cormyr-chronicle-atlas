BEGIN;
-- Explicit date for pre-calendar lifecycle fixtures. Date enforcement is tested separately.
SELECT set_config('cormyr.mail_date','1522-01-01',true);
CREATE FUNCTION pg_temp.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$ BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;
INSERT INTO auth.users(id) VALUES ('10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000002'),('10000000-0000-0000-0000-000000000003'),('10000000-0000-0000-0000-000000000004'),('10000000-0000-0000-0000-000000000005');
INSERT INTO user_roles VALUES('10000000-0000-0000-0000-000000000001','admin');
INSERT INTO campaign_houses(id,name) VALUES('mail-a','A'),('mail-b','B'),('mail-c','C');
INSERT INTO campaign_players(id,user_id,name) VALUES ('10000000-0000-0000-0000-000000000012','10000000-0000-0000-0000-000000000002','Recipient 2'),('10000000-0000-0000-0000-000000000013','10000000-0000-0000-0000-000000000003','Recipient 3'),('10000000-0000-0000-0000-000000000014','10000000-0000-0000-0000-000000000004','Recipient 4'),('10000000-0000-0000-0000-000000000015','10000000-0000-0000-0000-000000000005','Recipient 5');
INSERT INTO house_memberships(player_id,house_id,authorized_by) VALUES('10000000-0000-0000-0000-000000000012','mail-a','10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000013','mail-b','10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000014','mail-c','10000000-0000-0000-0000-000000000001'),('10000000-0000-0000-0000-000000000015','mail-b','10000000-0000-0000-0000-000000000001');
INSERT INTO campaign_records(id,house_id,visibility,kind,title,content,created_by,updated_by)
VALUES('10000000-0000-0000-0000-000000000050','mail-a','house','character','Court source','Private biography','10000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000002');
INSERT INTO noble_house_sheets(house_id,updated_by,state) VALUES('mail-a','10000000-0000-0000-0000-000000000002','{"court":[{"id":"court-1","npcId":"10000000-0000-0000-0000-000000000050","role":"Administrador","name":""}],"units":[{"id":"unit-1","name":"Guard","destroyed":false},{"id":"unit-dead","name":"Destroyed","destroyed":true}]}');
INSERT INTO letter_rounds(number,status,closed) VALUES(1,'open',false);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
SELECT pg_temp.assert(jsonb_array_length(public.mail_compose_options()->'players')=4,'directory has active players');
SELECT pg_temp.assert(jsonb_array_length(public.mail_compose_options()->'houses')=1,'options expose own house only');
SELECT pg_temp.assert(strpos(public.mail_compose_options()::text,'Private biography')=0,'options exclude biography');
SELECT public.send_linked_mail('10000000-0000-0000-0000-000000000100','mail-a',ARRAY['p:10000000-0000-0000-0000-000000000013','p:10000000-0000-0000-0000-000000000014','p:10000000-0000-0000-0000-000000000013'],'Joint order','Dispatch','court-1','unit-1','executor');
SELECT public.send_linked_mail('10000000-0000-0000-0000-000000000100','mail-a',ARRAY['p:10000000-0000-0000-0000-000000000014','p:10000000-0000-0000-0000-000000000013'],'Joint order','Dispatch','court-1','unit-1','executor');
SELECT pg_temp.assert((SELECT count(*)=2 FROM campaign_letters WHERE batch_key='10000000-0000-0000-0000-000000000100'),'duplicate recipients and retries do not duplicate delivery');
SELECT pg_temp.assert((SELECT count(DISTINCT conversation_id)=2 FROM campaign_letters WHERE batch_key='10000000-0000-0000-0000-000000000100'),'each recipient has private conversation');
SELECT pg_temp.assert((SELECT bool_and(publication_state='delivered') FROM campaign_letters WHERE batch_key='10000000-0000-0000-0000-000000000100'),'player copies delivered in open week');
SELECT pg_temp.assert((SELECT (value->>'messages')::int=1 AND (value->>'deliveries')::int=2 FROM jsonb_array_elements(public.mail_insights()) WHERE value->>'court_member_id'='court-1' AND value->>'military_unit_id'='unit-1'),'analytics distinguish message from deliveries');
SELECT pg_temp.assert((public.mail_page('{"court":"mail-a:court-1","unit":"mail-a:unit-1"}')->>'total')::int=2,'combined link filters');
SELECT pg_temp.assert(jsonb_array_length(public.mail_page('{}',0,1)->'letters')=1,'bounded page');
SELECT pg_temp.assert(public.mail_page('{}',0,1)->'letters'->0->>'id'<>public.mail_page('{}',1,1)->'letters'->0->>'id','stable nonoverlapping pages');
DO $$ BEGIN
 BEGIN PERFORM public.mail_page('{}',0,NULL); RAISE EXCEPTION 'null page limit accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='null page limit accepted' THEN RAISE; END IF; END;
 BEGIN PERFORM public.send_linked_mail('10000000-0000-0000-0000-000000000100','mail-a',ARRAY['p:10000000-0000-0000-0000-000000000013'],'Changed','Dispatch'); RAISE EXCEPTION 'changed retry accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='changed retry accepted' THEN RAISE; END IF; END;
 BEGIN PERFORM public.send_linked_mail('10000000-0000-0000-0000-000000000101','mail-a',ARRAY['p:10000000-0000-0000-0000-000000000013','p:10000000-0000-0000-0000-000000000999'],'Invalid batch','Body'); RAISE EXCEPTION 'invalid target accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='invalid target accepted' THEN RAISE; END IF; END;
 BEGIN PERFORM public.send_linked_mail('10000000-0000-0000-0000-000000000102','mail-b',ARRAY['p:10000000-0000-0000-0000-000000000013'],'Foreign origin','Body'); RAISE EXCEPTION 'foreign house accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='foreign house accepted' THEN RAISE; END IF; END;
 BEGIN PERFORM public.send_linked_mail('10000000-0000-0000-0000-000000000103','mail-a',ARRAY['p:10000000-0000-0000-0000-000000000013'],'Dead unit','Body',NULL,'unit-dead'); RAISE EXCEPTION 'destroyed unit accepted'; EXCEPTION WHEN raise_exception THEN IF SQLERRM='destroyed unit accepted' THEN RAISE; END IF; END;
END $$;
SELECT pg_temp.assert((SELECT count(*)=0 FROM campaign_letters WHERE batch_key='10000000-0000-0000-0000-000000000101'),'failed batch is atomic');
SELECT public.send_linked_mail('10000000-0000-0000-0000-000000000104','mail-a',ARRAY['narrator'],'No links','Body');
SELECT public.send_linked_mail('10000000-0000-0000-0000-000000000105','mail-a',ARRAY['narrator'],'Court only','Body','court-1',NULL,'order_recipient');
SELECT public.send_linked_mail('10000000-0000-0000-0000-000000000106','mail-a',ARRAY['p:10000000-0000-0000-0000-000000000013'],'Unit only','Body',NULL,'unit-1',NULL,true);
SELECT id AS draft_id FROM campaign_letters WHERE batch_key='10000000-0000-0000-0000-000000000106' \gset
SELECT id AS b_id FROM campaign_letters WHERE batch_key='10000000-0000-0000-0000-000000000100' AND recipient_player_id='10000000-0000-0000-0000-000000000013' \gset
SELECT id AS c_id FROM campaign_letters WHERE batch_key='10000000-0000-0000-0000-000000000100' AND recipient_player_id='10000000-0000-0000-0000-000000000014' \gset
SELECT set_config('test.b',:'b_id',true);
SELECT set_config('test.c',:'c_id',true);
SELECT set_config('test.draft',:'draft_id',true);
SELECT pg_temp.assert((public.mail_page('{"court":"none","unit":"none"}')->>'total')::int=1,'no-link filters');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
SELECT pg_temp.assert((SELECT count(*)=1 FROM campaign_letters),'recipient sees one private delivery');
SELECT pg_temp.assert(strpos(public.mail_compose_options()::text,'Court source')=0,'foreign source name remains private');
SELECT public.mark_letter_read(:'b_id');
SELECT public.reply_weekly_message(:'b_id',NULL,'Specific reply content','10000000-0000-0000-0000-000000000110',false);
SELECT pg_temp.assert((public.mail_page('{"box":"programadas","number":"2"}')->>'total')::int=1,'scheduled reply matches its delivery week');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
SELECT pg_temp.assert((SELECT count(*)=0 FROM letter_replies),'other recipient cannot read private reply');
SELECT pg_temp.assert((SELECT count(*)=1 FROM campaign_letters),'other recipient sees own copy only');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
SELECT pg_temp.assert(public.mail_recipient_read(:'b_id'),'sender sees recipient reading without recipient profile access');
SELECT pg_temp.assert(NOT public.mail_recipient_read(:'c_id'),'other recipient remains unread');
RESET ROLE;
UPDATE noble_house_sheets SET state=jsonb_set(state,'{units}','[]') WHERE house_id='mail-a';
SET LOCAL ROLE authenticated;
DO $$ BEGIN
 BEGIN PERFORM public.schedule_letter_draft(current_setting('test.draft')::uuid,1); RAISE EXCEPTION 'stale unit accepted';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='stale unit accepted' THEN RAISE; END IF; END;
END $$;
SELECT public.edit_linked_mail_draft(:'draft_id',1,'Unit removed','Body','mail-a',NULL,NULL,NULL);
SELECT public.schedule_letter_draft(:'draft_id',1);
SELECT pg_temp.assert((SELECT military_unit_id='unit-1' FROM campaign_letters WHERE id=:'b_id'),'sent references survive removal');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
SELECT public.set_letter_round(2,false);
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000002',true);
SELECT pg_temp.assert((public.mail_page('{"number":"2","text":"Specific reply"}')->>'total')::int=1,'week and text search includes delivered reply on old letter');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000004',true);
SELECT pg_temp.assert((public.mail_page('{"text":"Specific reply"}')->>'total')::int=0,'search cannot reveal another recipient response');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000005',true);
SELECT pg_temp.assert((public.mail_page()->>'total')::int=0,'same-house nonrecipient page empty');
SELECT pg_temp.assert(public.mail_insights()='[]'::jsonb,'same-house nonrecipient analytics empty');
-- Lote 3: respostas entre casas não criam pendências do Mestre.
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.assert((public.mail_page('{"answered":"awaiting-narrator","text":"Specific reply"}')->>'total')::int=0,'peer-to-peer letter is not awaiting the narrator');
SELECT pg_temp.assert((public.mail_page('{"answered":"no-delivered","text":"Specific reply"}')->>'total')::int=0,'delivered peer reply counts as delivered');
-- A carta do Mestre fica programada e aparece na caixa de respostas pendentes de envio.
SELECT public.send_linked_mail('10000000-0000-0000-0000-000000000120',NULL,ARRAY['h:mail-b'],'Narrator Batch3 letter','Awaiting the house',NULL,NULL,NULL,false,3);
SELECT id AS gm_batch3_id FROM campaign_letters WHERE batch_key='10000000-0000-0000-0000-000000000120' \gset
SELECT pg_temp.assert((public.mail_page('{"box":"programadas","number":"3","text":"Narrator Batch3"}')->>'total')::int=1,'narrator scheduled root appears in planned week');
SELECT pg_temp.assert((public.mail_page('{"answered":"pending-outgoing","text":"Narrator Batch3"}')->>'total')::int=1,'pending narrator outgoing filter includes scheduled root');
SELECT public.set_letter_round(3,false);
SELECT pg_temp.assert((public.mail_page('{"answered":"awaiting-house","text":"Narrator Batch3"}')->>'total')::int=1,'GM delivered turn awaits house');
SELECT pg_temp.assert((public.mail_page('{"answered":"no-delivered","text":"Narrator Batch3"}')->>'total')::int=1,'no delivered reply while awaiting house');
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000003',true);
SELECT public.reply_weekly_message(:'gm_batch3_id',NULL,'House responds Batch3','10000000-0000-0000-0000-000000000121',false);
SELECT set_config('request.jwt.claim.sub','10000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.assert((public.mail_page('{"answered":"awaiting-narrator","text":"Narrator Batch3"}')->>'total')::int=1,'house delivered turn awaits narrator');
SELECT pg_temp.assert((public.mail_page('{"answered":"awaiting-house","text":"Narrator Batch3"}')->>'total')::int=0,'house reply ends awaiting-house stage');
SELECT pg_temp.assert((public.mail_page('{"answered":"no-delivered","text":"Narrator Batch3"}')->>'total')::int=0,'house delivered response clears no-delivered filter');
SELECT pg_temp.assert((public.mail_page('{"number":"3","text":"House responds Batch3"}')->>'total')::int=1,'old letter appears under response delivery week');
-- Respostas próprias em rascunho são visíveis na caixa correspondente, sem parecer entregues.
SELECT public.save_weekly_reply_draft('10000000-0000-0000-0000-000000000122',:'gm_batch3_id',(SELECT id FROM letter_replies WHERE idempotency_key='10000000-0000-0000-0000-000000000121'),'Mestre prepara retorno Batch3');
SELECT pg_temp.assert((public.mail_page('{"box":"rascunhos","text":"Narrator Batch3"}')->>'total')::int=1,'delivered root with narrator draft appears in drafts box');
SELECT pg_temp.assert((public.mail_page('{"answered":"pending-outgoing","text":"Narrator Batch3"}')->>'total')::int=1,'narrator draft appears in pending outgoing');
SELECT pg_temp.assert((public.mail_page('{"answered":"awaiting-narrator","text":"Narrator Batch3"}')->>'total')::int=1,'draft does not alter active delivered turn');
SELECT public.mark_letter_read(:'gm_batch3_id');
SELECT pg_temp.assert((public.mail_page('{"read":"yes","text":"Narrator Batch3"}')->>'total')::int=1,'GM read receipt makes returned letter read independently');
SELECT pg_temp.assert(NOT has_function_privilege('anon','public.send_linked_mail(uuid,text,text[],text,text,text,text,text,boolean,integer)','EXECUTE'),'anonymous send denied');
ROLLBACK;
