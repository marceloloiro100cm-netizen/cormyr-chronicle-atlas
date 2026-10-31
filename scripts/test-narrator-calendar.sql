BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;
INSERT INTO auth.users(id) VALUES
 ('30000000-0000-0000-0000-000000000001'),
 ('30000000-0000-0000-0000-000000000002');
INSERT INTO user_roles(user_id,role) VALUES('30000000-0000-0000-0000-000000000001','admin');
INSERT INTO campaign_houses(id,name) VALUES('schedule-test-house','Calendar test');
INSERT INTO campaign_players(id,user_id,name) VALUES(
 '30000000-0000-0000-0000-000000000012','30000000-0000-0000-0000-000000000002','Calendar player');
INSERT INTO house_memberships(player_id,house_id,authorized_by) VALUES(
 '30000000-0000-0000-0000-000000000012','schedule-test-house','30000000-0000-0000-0000-000000000001');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
SELECT pg_temp.assert(jsonb_array_length(get_campaign_schedule_drafts())=0,'no drafts initially');
SELECT pg_temp.assert(jsonb_array_length(get_campaign_schedule_events(1522,0))=0,'no events initially');

SELECT save_campaign_schedule_event('{"date":"1522-01-05","title":"Audiência real","description":"Convocação pública"}');
SELECT pg_temp.assert(jsonb_array_length(get_campaign_schedule_drafts())=1,'narrator draft saved');
SELECT pg_temp.assert(jsonb_array_length(get_campaign_schedule_events(1522,0))=0,'draft not public before publishing');
SELECT publish_campaign_time_change((get_campaign_calendar()->>'version')::int,'30000000-0000-4000-8000-000000000101','set','1522-01-10',0,'Primeira publicação',false);
SELECT pg_temp.assert(get_campaign_calendar()->>'published_week'='1','week stays separate from the official Harptos clock');
SELECT pg_temp.assert(get_campaign_calendar()->>'day'='10','global campaign day published');
SELECT pg_temp.assert(jsonb_array_length(get_campaign_schedule_events(1522,0))=1,'published event visible');

SELECT save_campaign_schedule_event(jsonb_build_object('id',(get_campaign_schedule_drafts()->0->>'id'),'version',(get_campaign_schedule_drafts()->0->>'version')::int,'date','1522-01-09','title','Audiência atualizada','description','Nota corrigida'));
SELECT pg_temp.assert(get_campaign_schedule_events(1522,0)->0->>'title'='Audiência real','draft editing keeps published snapshot');
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000002',true);
SELECT pg_temp.assert(jsonb_array_length(get_campaign_schedule_events(1522,0))=1,'authorized player reads published event');
SELECT pg_temp.assert(get_campaign_schedule_events(1522,0)->0->>'title'='Audiência real','player cannot see unapproved edit');
DO $$ BEGIN
 BEGIN PERFORM get_campaign_schedule_drafts(); RAISE EXCEPTION 'player saw calendar drafts';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='player saw calendar drafts' THEN RAISE; END IF; END;
 BEGIN PERFORM save_campaign_schedule_event('{"date":"1522-01-11","title":"Unauthorized"}'); RAISE EXCEPTION 'player changed event';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='player changed event' THEN RAISE; END IF; END;
 BEGIN PERFORM publish_campaign_time_change(1,'30000000-0000-4000-8000-000000000102','set','1522-01-11',0,'Acesso indevido',false); RAISE EXCEPTION 'player published calendar';
 EXCEPTION WHEN raise_exception THEN IF SQLERRM='player published calendar' THEN RAISE; END IF; END;
END $$;
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000001',true);
SELECT publish_campaign_time_change((get_campaign_calendar()->>'version')::int,'30000000-0000-4000-8000-000000000103','set','1522-01-11',0,'Publicação alterada',false);
SELECT pg_temp.assert(get_campaign_schedule_events(1522,0)->0->>'title'='Audiência atualizada','published edited event visible');
SELECT save_campaign_schedule_event(jsonb_build_object('id',(get_campaign_schedule_drafts()->0->>'id'),'version',(get_campaign_schedule_drafts()->0->>'version')::int,'date','1522-01-09','title','Audiência atualizada','description','Nota corrigida','deleted',true));
SELECT pg_temp.assert(jsonb_array_length(get_campaign_schedule_events(1522,0))=1,'pending deletion still published');
SELECT publish_campaign_time_change((get_campaign_calendar()->>'version')::int,'30000000-0000-4000-8000-000000000104','publish',NULL,0,'Publicação da exclusão',false);
SELECT pg_temp.assert(jsonb_array_length(get_campaign_schedule_events(1522,0))=0,'deletion takes effect only when published');
RESET ROLE;
SELECT pg_temp.assert((SELECT count(*)>=3 FROM campaign_schedule_event_audit),'event audit preserved');
ROLLBACK;
