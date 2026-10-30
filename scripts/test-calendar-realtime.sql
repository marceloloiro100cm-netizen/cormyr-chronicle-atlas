-- Confirm only the single global calendar is broadcast to authorized players.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;

SELECT pg_temp.assert(
 (SELECT count(*)=1 FROM pg_publication_tables
  WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='campaign_calendar'),
 'global calendar must be registered exactly once for Realtime');
SELECT pg_temp.assert(
 (SELECT relrowsecurity FROM pg_class WHERE oid='public.campaign_calendar'::regclass),
 'calendar row level security must remain enabled');
SELECT pg_temp.assert(
 (SELECT count(*)>=1 FROM pg_policies WHERE schemaname='public' AND tablename='campaign_calendar'
  AND policyname='calendar_read' AND cmd='SELECT'),
 'read RLS policy required for Realtime recipients');
SELECT pg_temp.assert(
 has_table_privilege('authenticated','public.campaign_calendar','SELECT'),
 'authenticated campaign members must be able to read calendar');
SELECT pg_temp.assert(
 NOT has_table_privilege('anon','public.campaign_calendar','SELECT'),
 'anonymous visitors must not see calendar updates');
SELECT pg_temp.assert(
 (SELECT count(*)=0 FROM pg_publication_tables
  WHERE pubname='supabase_realtime' AND schemaname='public'
  AND tablename IN ('campaign_schedule_events','campaign_schedule_event_audit','campaign_calendar_audit')),
 'drafts and audit trails must never be broadcast');

INSERT INTO auth.users(id) VALUES
 ('30000000-0000-0000-0000-000000000051'),
 ('30000000-0000-0000-0000-000000000052');
INSERT INTO public.user_roles(user_id,role)
 VALUES ('30000000-0000-0000-0000-000000000051','admin');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000051',true);
SELECT pg_temp.assert(public.get_campaign_calendar() IS NOT NULL,
 'narrator can query authoritative calendar');
SELECT pg_temp.assert(
 public.publish_campaign_schedule_confirmed(
 (public.get_campaign_calendar()->>'version')::integer,'1522-01-11',true,2
 )->>'day'='11','narrator publish returns saved date');
SELECT pg_temp.assert(public.get_campaign_calendar()->>'day'='11',
 'calendar subscription reads changed source row');
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000052',true);
SELECT pg_temp.assert(public.get_campaign_calendar() IS NULL,
 'unauthorized authenticated user must not see calendar');
ROLLBACK;
