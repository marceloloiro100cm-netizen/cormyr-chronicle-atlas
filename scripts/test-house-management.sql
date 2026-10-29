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

SELECT public.commit_noble_house_operation('10000000-0000-0000-0000-000000000001','mail-a',1,'10000000-0000-0000-0000-000000000801','unit','{"schemaVersion":1,"houseId":"mail-a","month":18264,"court":[],"units":[{"id":"unit-a","name":"Guard","commanderName":"Árlen"}]}','Recrutamento','Teste');
SELECT pg_temp.assert((SELECT count(*)=1 FROM campaign_records WHERE title='Árlen' AND house_id='mail-a'),'commander NPC created');
SELECT pg_temp.assert((SELECT jsonb_array_length(state->'court')=1 FROM noble_house_sheets WHERE house_id='mail-a'),'commander assigned to court');
SELECT public.commit_noble_house_operation('10000000-0000-0000-0000-000000000001','mail-a',1,'10000000-0000-0000-0000-000000000801','unit','{"schemaVersion":1,"houseId":"mail-a","month":18264,"court":[],"units":[]}','Retry','Teste');
SELECT pg_temp.assert((SELECT count(*)=1 FROM campaign_records WHERE title='Árlen'),'retry creates no NPC');
SELECT public.commit_noble_house_operation('10000000-0000-0000-0000-000000000001','mail-a',2,'10000000-0000-0000-0000-000000000802','unit',jsonb_set((SELECT state FROM noble_house_sheets WHERE house_id='mail-a'),'{units}', '[{"id":"unit-b","name":"Second Guard","commanderName":"arlen"}]'),'Same commander','Teste');
SELECT pg_temp.assert((SELECT count(*)=1 FROM campaign_records WHERE title IN ('Árlen','arlen')),'case and accent normalization reuses NPC');
DO $$ BEGIN
 BEGIN PERFORM public.commit_noble_house_operation('10000000-0000-0000-0000-000000000001','mail-a',1,'10000000-0000-0000-0000-000000000803','unit','{"schemaVersion":1,"houseId":"mail-a","month":18264,"court":[],"units":[{"id":"unit-c","name":"Guard","commanderName":"Orphan"}]}','Stale version','Teste');RAISE EXCEPTION 'stale accepted';EXCEPTION WHEN raise_exception THEN IF SQLERRM='stale accepted' THEN RAISE;END IF;END;
END $$;
SELECT pg_temp.assert((SELECT count(*)=0 FROM campaign_records WHERE title='Orphan'),'failed transaction creates no orphan NPC');
ROLLBACK;
