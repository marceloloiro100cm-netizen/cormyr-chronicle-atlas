-- Lote 27 — revocation during the SAME authenticated database session.
-- Runs on disposable PostgreSQL 16 only and ROLLBACKs all fixture writes.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Lote27: %',label; END IF; END $$;
CREATE FUNCTION pg_temp.deny(statement text,label text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE refused boolean:=false;
BEGIN
 BEGIN EXECUTE statement; EXCEPTION WHEN OTHERS THEN refused:=true; END;
 PERFORM pg_temp.assert(refused,label);
END $$;

INSERT INTO auth.users(id) VALUES
 ('30000000-0000-0000-0000-000000002701'),
 ('30000000-0000-0000-0000-000000002702'),
 ('30000000-0000-0000-0000-000000002703');
INSERT INTO public.user_roles(user_id,role) VALUES
 ('30000000-0000-0000-0000-000000002701','admin');
INSERT INTO public.campaign_houses(id,name) VALUES
 ('l27-a','Casa A de revogação'),('l27-b','Casa B inalterada');
INSERT INTO public.campaign_players(id,user_id,name) VALUES
 ('30000000-0000-0000-0000-000000002711',
  '30000000-0000-0000-0000-000000002702','Jogador A'),
 ('30000000-0000-0000-0000-000000002712',
  '30000000-0000-0000-0000-000000002703','Jogador B');
INSERT INTO public.house_memberships(player_id,house_id,authorized_by,can_edit)
 VALUES
 ('30000000-0000-0000-0000-000000002711','l27-a',
  '30000000-0000-0000-0000-000000002701',true),
 ('30000000-0000-0000-0000-000000002712','l27-b',
  '30000000-0000-0000-0000-000000002701',true);
INSERT INTO public.noble_house_sheets(house_id,state,version,updated_by)
 VALUES('l27-a',jsonb_build_object(
  'schemaVersion',1,'houseId','l27-a','phase','active',
  'month',1522*12,'treasury',100,
  'permanent',jsonb_build_object('power',20,'wealth',10),
  'fortunes','[]'::jsonb,'actions','[]'::jsonb,
  'units','[{"id":"u-l27","strength":80}]'::jsonb,
  'holdings','[]'::jsonb,'projects','[]'::jsonb
 ),1,'30000000-0000-0000-0000-000000002701');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000002702',true);
SELECT pg_temp.assert(
 public.in_campaign_house('l27-a',false) AND
 public.in_campaign_house('l27-a',true),
 'player starts with read and write access to House A');
SELECT pg_temp.assert(
 NOT public.in_campaign_house('l27-b',false),
 'player A cannot access independent House B');

-- Simulate an authorized operator updating privileges while user A is online.
RESET ROLE;
UPDATE public.house_memberships SET can_edit=false
 WHERE player_id='30000000-0000-0000-0000-000000002711' AND house_id='l27-a';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000002702',true);
SELECT pg_temp.assert(
 public.in_campaign_house('l27-a',false) AND
 NOT public.in_campaign_house('l27-a',true),
 'reduced editing permission is effective without logging out');
-- No implicit credit/debit or clock change when edit permission is revoked.
SELECT pg_temp.assert(
 (public.get_public_campaign_time()->>'version')='1',
 'permission changes never publish a new campaign time');

-- Revoking the membership must immediately affect a fresh security check.
RESET ROLE;
DELETE FROM public.house_memberships
 WHERE player_id='30000000-0000-0000-0000-000000002711' AND house_id='l27-a';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000002702',true);
SELECT pg_temp.assert(
 NOT public.in_campaign_house('l27-a',false) AND
 NOT public.in_campaign_house('l27-a',true),
 'both read and write House authorizations vanish after revocation');
SELECT pg_temp.deny('SELECT public.get_temporal_consumer_dashboard(20)',
 'revoked member cannot inspect narrator private outbox');
SELECT pg_temp.deny(
 'SELECT public.publish_campaign_time_change(1,''30000000-0000-4000-8000-000000002720'',''set'',''1522-02-01'',0,''Forbidden'',false)',
 'revoked member cannot change the calendar');

-- Different player must remain authorized despite House A's revocation.
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000002703',true);
SELECT pg_temp.assert(
 public.in_campaign_house('l27-b',true) AND
 NOT public.in_campaign_house('l27-a',false),
 'B retains its own House and never gains access to A');

-- Regrant view access, then editing access, always from a trusted operator.
RESET ROLE;
INSERT INTO public.house_memberships(player_id,house_id,authorized_by,can_edit)
 VALUES('30000000-0000-0000-0000-000000002711',
  'l27-a','30000000-0000-0000-0000-000000002701',false);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000002702',true);
SELECT pg_temp.assert(public.in_campaign_house('l27-a',false) AND
 NOT public.in_campaign_house('l27-a',true),
 'read-only access restored but editing remains disabled');
RESET ROLE;
UPDATE public.house_memberships SET can_edit=true,can_edit_attributes=true
 WHERE player_id='30000000-0000-0000-0000-000000002711' AND house_id='l27-a';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000002702',true);
SELECT pg_temp.assert(public.in_campaign_house('l27-a',true),
 'editing can be re-granted by administrator without logout');

-- Losing GM role must immediately disable administrator-only RPCs in same JWT.
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000002701',true);
SELECT pg_temp.assert(public.is_campaign_admin(),
 'narrator starts with administrative role');
RESET ROLE;
DELETE FROM public.user_roles
 WHERE user_id='30000000-0000-0000-0000-000000002701' AND role='admin';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000002701',true);
SELECT pg_temp.assert(NOT public.is_campaign_admin(),
 'Narrator role revocation effective without refreshing JWT');
SELECT pg_temp.deny('SELECT public.get_temporal_consumer_dashboard(20)',
 'demoted Narrator cannot read private temporal dashboard');
SELECT pg_temp.deny('SELECT public.preview_campaign_time_change(1,''set'',''1522-02-01'',0,false)',
 'demoted Narrator cannot preview official date');
SELECT pg_temp.deny(
 'SELECT public.publish_campaign_time_change(1,''30000000-0000-4000-8000-000000002721'',''set'',''1522-02-01'',0,''Forbidden after demotion'',false)',
 'demoted Narrator cannot publish new date');
RESET ROLE;
SELECT pg_temp.assert(
 (SELECT count(*)=0 FROM public.campaign_temporal_effect_checkpoints),
 'permission revocation performs no automatic military or economic action');
SELECT pg_temp.assert(
 (SELECT state->>'treasury'='100' AND jsonb_array_length(state->'units')=1
 FROM public.noble_house_sheets WHERE house_id='l27-a'),
 'troops and treasury unchanged by permission changes');
ROLLBACK;
