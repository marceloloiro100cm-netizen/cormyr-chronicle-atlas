-- Stream only the already-readable global calendar row to authorized sessions.
-- PostgreSQL Realtime evaluates SELECT grants and the calendar_read RLS policy
-- for every subscriber; unauthenticated visitors must not receive changes.
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
   RAISE EXCEPTION 'Supabase realtime publication does not exist';
 END IF;
 IF NOT EXISTS (
   SELECT 1 FROM pg_publication_tables
   WHERE pubname='supabase_realtime' AND schemaname='public'
     AND tablename='campaign_calendar'
 ) THEN
   ALTER PUBLICATION supabase_realtime ADD TABLE public.campaign_calendar;
 END IF;
END $$;
-- The table already has a primary key and calendar_read RLS.
-- Do not enable REPLICA IDENTITY FULL or publish drafts/audit tables.
