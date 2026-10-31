-- Reconciliation invariants in a disposable CI database.
-- Avoid assigning fake authenticated identities or touching campaign records.
DO $check$
DECLARE n integer;
BEGIN
 IF to_regclass('public.campaign_translations') IS NULL THEN RAISE EXCEPTION 'Missing translation table'; END IF;
 IF to_regclass('public.letter_reply_versions') IS NULL THEN RAISE EXCEPTION 'Missing reply version history'; END IF;
 IF to_regclass('public.narrator_mail_notes') IS NULL THEN RAISE EXCEPTION 'Missing narrator-only notes'; END IF;
 IF EXISTS (
  SELECT 1 FROM (VALUES ('version'),('updated_at'),('deleted_at')) AS expected(column_name)
  WHERE NOT EXISTS (SELECT 1 FROM information_schema.columns c WHERE c.table_schema='public' AND c.table_name='letter_replies' AND c.column_name=expected.column_name)
 ) THEN RAISE EXCEPTION 'Missing reply columns'; END IF;
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='house_memberships' AND column_name='can_edit_attributes')
 THEN RAISE EXCEPTION 'Missing narrator point-buy permission'; END IF;
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns
   WHERE table_schema='public' AND table_name='letter_rounds' AND column_name='harptos_period')
 THEN RAISE EXCEPTION 'Missing Harptos round reference'; END IF;
 IF (SELECT COUNT(*) FROM pg_trigger WHERE tgrelid='public.letter_replies'::regclass AND tgname IN ('reply_version_created','reply_version_audit') AND NOT tgisinternal) <> 2
 THEN RAISE EXCEPTION 'Reply version audit triggers absent'; END IF;
 IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgrelid='public.letter_rounds'::regclass AND tgname='z_round_harptos_period' AND NOT tgisinternal)
 THEN RAISE EXCEPTION 'Round Harptos trigger absent'; END IF;
 IF to_regprocedure('public.edit_letter_reply(uuid,integer,text)') IS NULL
  OR to_regprocedure('public.delete_letter_reply(uuid,integer)') IS NULL
  OR to_regprocedure('public.can_read_reply_version(uuid)') IS NULL
 THEN RAISE EXCEPTION 'Missing reply editing/history RPCs'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='letter_reply_versions' AND policyname='reply_versions_read')
  OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='narrator_mail_notes' AND policyname='narrator_mail_notes_private')
  OR NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='campaign_house_crests_read')
 THEN RAISE EXCEPTION 'Required private read policies absent'; END IF;
 IF EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE (n.nspname,c.relname) IN (('public','letter_reply_versions'),('public','narrator_mail_notes'),('public','campaign_translations'))
      AND NOT c.relrowsecurity)
 THEN RAISE EXCEPTION 'Row level security disabled on new tables'; END IF;
 IF pg_get_functiondef('public.can_read_reply_as(public.letter_replies,uuid)'::regprocedure) NOT ILIKE '%r.deleted_at IS NULL%'
 THEN RAISE EXCEPTION 'Reply privacy guard is outdated'; END IF;
 IF pg_get_functiondef('public.campaign_representation_action(text,jsonb)'::regprocedure) NOT ILIKE '%app.is_representation%'
 THEN RAISE EXCEPTION 'Representation receipt safeguard is outdated'; END IF;
 IF pg_get_functiondef('public.audit_letter_edit()'::regprocedure) NOT ILIKE '%ON CONFLICT%'
 THEN RAISE EXCEPTION 'Letter version auditing lacks idempotent sync update'; END IF;
END $check$;
