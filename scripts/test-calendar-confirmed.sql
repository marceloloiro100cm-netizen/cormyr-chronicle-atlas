BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;
INSERT INTO auth.users(id) VALUES
 ('30000000-0000-0000-0000-000000000041'),
 ('30000000-0000-0000-0000-000000000042');
INSERT INTO public.user_roles(user_id,role) VALUES
 ('30000000-0000-0000-0000-000000000041','admin');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000041',true);
SELECT pg_temp.assert(
  public.publish_campaign_schedule_confirmed(
    (public.get_campaign_calendar()->>'version')::integer,'1522-01-01',true,2
  )->>'day'='1','event publication preserves already published day 1');
SELECT pg_temp.assert(public.get_campaign_calendar()->>'day'='1',
 'published day available through normal player read');
SELECT pg_temp.assert(public.get_campaign_calendar()->>'published_week'='2',
 'published week preserved');
DO $$ BEGIN
 BEGIN
  PERFORM public.publish_campaign_schedule_confirmed(1,'1522-01-01',true,3);
  RAISE EXCEPTION 'stale version incorrectly accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='stale version incorrectly accepted' THEN RAISE; END IF;
 END;
END $$;
SELECT pg_temp.assert(public.get_campaign_calendar()->>'day'='11',
 'conflict must not modify published day');
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000042',true);
DO $$ BEGIN
 BEGIN
  PERFORM public.publish_campaign_schedule_confirmed(2,'1522-01-01',true,3);
  RAISE EXCEPTION 'non-narrator published calendar';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='non-narrator published calendar' THEN RAISE; END IF;
 END;
END $$;
-- This user has no house membership, so normal read is intentionally RLS-filtered.
-- Verify the denied publish by switching back to the authorized narrator.
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000041',true);
SELECT pg_temp.assert(public.get_campaign_calendar()->>'day'='11',
 'non-narrator cannot change global date');
RESET ROLE;
SELECT pg_temp.assert((SELECT count(*)>=1 FROM public.campaign_calendar_audit),
 'confirmed publication audited');
ROLLBACK;
