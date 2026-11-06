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

-- Negative access test, entirely inside a rollback transaction. Never create
-- accounts, modify campaign members or touch real data in production.
BEGIN;
INSERT INTO public.campaign_private_gm_content(id,payload)
 VALUES ('__test_public_privacy__','{"events":[],"adventures":[]}'::jsonb);
INSERT INTO public.campaign_private_vassal_workbooks(parent_house_id,vassal_house_id,payload)
 VALUES ('__test_parent__','__test_vassal__','{}'::jsonb);
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',true);
DO $deny$
BEGIN
 IF EXISTS(SELECT 1 FROM public.campaign_private_gm_content
           WHERE id='__test_public_privacy__')
 THEN RAISE EXCEPTION 'Ordinary users can read Narrator content'; END IF;
 IF has_table_privilege('authenticated','public.campaign_private_vassal_workbooks','SELECT')
 THEN RAISE EXCEPTION 'Ordinary users can directly select private vassals'; END IF;
END $deny$;
RESET ROLE;
ROLLBACK;
