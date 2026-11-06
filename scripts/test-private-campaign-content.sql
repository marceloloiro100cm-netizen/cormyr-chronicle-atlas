-- Run only in the isolated PostgreSQL CI service. No player accounts are touched.
DO $check$
BEGIN
 IF to_regclass('public.campaign_private_gm_content') IS NULL OR
    to_regclass('public.campaign_private_vassal_workbooks') IS NULL
 THEN RAISE EXCEPTION 'Private content tables missing'; END IF;
 IF EXISTS (
   SELECT 1 FROM pg_class WHERE oid IN
    ('public.campaign_private_gm_content'::regclass,
     'public.campaign_private_vassal_workbooks'::regclass)
    AND NOT relrowsecurity
 ) THEN RAISE EXCEPTION 'Private content table RLS disabled'; END IF;
 IF has_table_privilege('anon','public.campaign_private_gm_content','SELECT') OR
    has_table_privilege('anon','public.campaign_private_vassal_workbooks','SELECT') OR
    has_table_privilege('authenticated','public.campaign_private_vassal_workbooks','SELECT')
 THEN RAISE EXCEPTION 'Unauthorized private content SQL grants'; END IF;
 IF NOT EXISTS (
  SELECT 1 FROM pg_policies WHERE schemaname='public'
   AND tablename='campaign_private_gm_content'
   AND policyname='private_gm_read_admin' AND cmd='SELECT'
 ) THEN RAISE EXCEPTION 'GM admin RLS policy missing'; END IF;
END $check$;
