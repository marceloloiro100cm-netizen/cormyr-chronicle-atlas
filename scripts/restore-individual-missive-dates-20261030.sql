-- Undo the overly broad "5 Marpenoth" normalization on 2026-10-30.
-- Source of truth is the immutable JSONB snapshot saved before that edit.
-- Use the date written near the start of each ORIGINAL missive/reply.
-- Never invent a date for a text lacking one. Preserve independent author fixes.
-- The four first-lot Harcourt outbound letters are intentionally left at 05.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='50000ms';
SELECT pg_advisory_xact_lock(184522);

DO $check_backup$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM public.campaign_migration_backups
 WHERE reason='reconcile-harcourt-week1-20261030') THEN
  RAISE EXCEPTION 'Original pre-reconciliation snapshot unavailable';
 END IF;
 IF EXISTS(SELECT 1 FROM public.campaign_migration_backups
 WHERE reason='restore-original-missive-dates-20261030') THEN
  RAISE EXCEPTION 'Date restoration already applied; cannot repeat blindly';
 END IF;
END $check_backup$;

-- Capture exact original content before replacing dates. Pattern accepts
-- 'Data: 3 de Marpenoth', 'Data - 4 de Marpenoth', and datelines
-- such as 'Oxstep Hill, 3 de Marpenoth de 1522 CV'.
CREATE TEMP TABLE _restore_letter_dates ON COMMIT DROP AS
SELECT (b.obj->>'id')::uuid id,
 b.obj->>'content' AS original_content,
 (b.obj->>'version')::integer AS original_version,
 CASE WHEN d.day IS NOT NULL AND d.day::integer BETWEEN 1 AND 30
 THEN '1522-10-'||lpad(d.day,2,'0') ELSE NULL END AS target_date,
 CASE WHEN b.obj->>'content' ~* '^Data[[:space:]]*[:\-][[:space:]]*[0-9]{1,2}[[:space:]]*(de[[:space:]]+)?Marpenoth[[:space:]]*(de[[:space:]]+)?1522([[:space:]]*CV)?'
   AND b.obj->>'content' !~* '^Data:[[:space:]]*5[[:space:]]+de[[:space:]]+Marpenoth[[:space:]]+de[[:space:]]+1522[[:space:]]+CV'
 THEN regexp_replace(b.obj->>'content',
 '^Data[[:space:]]*[:\-][[:space:]]*[0-9]{1,2}[[:space:]]*(de[[:space:]]+)?Marpenoth[[:space:]]*(de[[:space:]]+)?1522([[:space:]]*CV)?',
 'Data: 5 de Marpenoth de 1522 CV','i')
 ELSE b.obj->>'content' END AS expected_erroneous_content
FROM public.campaign_migration_backups backup
CROSS JOIN LATERAL jsonb_array_elements(backup.snapshot->'legacy_week1_letters') b(obj)
CROSS JOIN LATERAL (SELECT
 (regexp_match(left(b.obj->>'content',220),
 '([0-9]{1,2})[[:space:]]+(?:de[[:space:]]+)?Marpenoth[[:space:]]+de[[:space:]]+1522','i'))[1] AS day) d
WHERE backup.reason='reconcile-harcourt-week1-20261030';

CREATE TEMP TABLE _restore_reply_dates ON COMMIT DROP AS
SELECT (b.obj->>'id')::uuid id,
 CASE WHEN d.day IS NOT NULL AND d.day::integer BETWEEN 1 AND 30
 THEN '1522-10-'||lpad(d.day,2,'0') ELSE NULL END AS target_date
FROM public.campaign_migration_backups backup
CROSS JOIN LATERAL jsonb_array_elements(backup.snapshot->'legacy_week1_replies') b(obj)
CROSS JOIN LATERAL (SELECT
 (regexp_match(left(b.obj->>'content',220),
 '([0-9]{1,2})[[:space:]]+(?:de[[:space:]]+)?Marpenoth[[:space:]]+de[[:space:]]+1522','i'))[1] AS day) d
WHERE backup.reason='reconcile-harcourt-week1-20261030';

DO $verify$
BEGIN
 IF (SELECT count(*) FROM _restore_letter_dates)<>53
 OR (SELECT count(*) FROM _restore_reply_dates)<>28 THEN
  RAISE EXCEPTION 'Unexpected number of historical letters/replies';
 END IF;
 IF (SELECT count(*) FROM _restore_letter_dates WHERE target_date IS NOT NULL)<>49
 OR (SELECT count(*) FROM _restore_reply_dates WHERE target_date IS NOT NULL)<>17 THEN
  RAISE EXCEPTION 'Date extraction no longer matches audited original text';
 END IF;
 IF (SELECT count(*) FROM public.campaign_letters l JOIN _restore_letter_dates t USING(id)
   WHERE l.content=t.expected_erroneous_content
   AND l.campaign_date='1522-10-05'
   AND l.version=t.original_version+
    (CASE WHEN t.original_content IS DISTINCT FROM t.expected_erroneous_content THEN 1 ELSE 0 END))<>53 THEN
  RAISE EXCEPTION 'Letters changed since the overbroad rewrite; manual reconciliation required';
 END IF;
 IF (SELECT count(*) FROM public.letter_replies r JOIN _restore_reply_dates t USING(id)
   WHERE r.campaign_date='1522-10-05')<>28 THEN
  RAISE EXCEPTION 'Replies changed since overbroad rewrite';
 END IF;
 IF (SELECT count(*) FROM public.campaign_letters l
 WHERE l.historical_source='Ação da Casa Harcourt.docx'
   AND l.origin_house_id='harcourt' AND l.campaign_date='1522-10-05'
   AND l.creation_week=1)<>4 THEN
  RAISE EXCEPTION 'Harcourt first-lot exception not intact';
 END IF;
END $verify$;

-- Additional restoration backup, including prior erroneous values and queue
-- entries. The first backup retains the actual content before the error.
INSERT INTO public.campaign_migration_backups(reason,snapshot)
SELECT 'restore-original-missive-dates-20261030',
 jsonb_build_object(
  'why','Restore individual Harptos dates from texts; keep four Harcourt outbound letters dated 5 Marpenoth',
  'before_letters',(SELECT jsonb_agg(to_jsonb(l) ORDER BY l.id) FROM public.campaign_letters l JOIN _restore_letter_dates t USING(id)),
  'before_replies',(SELECT jsonb_agg(to_jsonb(r) ORDER BY r.id) FROM public.letter_replies r JOIN _restore_reply_dates t USING(id)),
  'before_outbox',(SELECT jsonb_agg(to_jsonb(o) ORDER BY o.id) FROM public.sync_outbox o
      JOIN _restore_letter_dates t ON o.entity_type='letter' AND o.entity_id=t.id
      WHERE o.state='pending')
 );

-- Restore the original header/body word-for-word by comparing with the saved
-- original, not by guessing the previous numeric day.
UPDATE public.campaign_letters l
 SET campaign_date=t.target_date,
     updated_at=now(),
     sync_state='pending'
 FROM _restore_letter_dates t
 WHERE l.id=t.id AND l.campaign_date IS DISTINCT FROM t.target_date;

-- An UPDATE OF content creates a new audited version and queues its payload.
UPDATE public.campaign_letters l
 SET content=t.original_content,version=l.version+1,
     updated_at=now(),sync_state='pending'
 FROM _restore_letter_dates t
 WHERE l.id=t.id AND l.content IS DISTINCT FROM t.original_content;

-- Replies have no standalone version log. Do not substitute the parent
-- letter's date when the reply has no date of its own.
UPDATE public.letter_replies r
 SET campaign_date=t.target_date,sync_state='pending'
 FROM _restore_reply_dates t
 WHERE r.id=t.id AND r.campaign_date IS DISTINCT FROM t.target_date;

-- Obsolete pending payloads from the broad edit must not later overwrite the
-- restored source text in the external archive. Keep their audit in backup.
DELETE FROM public.sync_outbox o
 USING public.campaign_letters l,_restore_letter_dates t
 WHERE o.entity_type='letter' AND o.entity_id=l.id AND l.id=t.id
  AND o.state='pending' AND o.version<l.version
  AND o.payload->>'campaign_date'='1522-10-05';

-- Date-only changes do not invoke the content audit trigger; enqueue them
-- explicitly so the external archive receives the latest individual date.
UPDATE public.campaign_letters l SET version=l.version+1, updated_at=now(), sync_state='pending'
FROM _restore_letter_dates t WHERE t.id=l.id AND t.original_content=t.expected_erroneous_content
AND t.target_date IS DISTINCT FROM '1522-10-05';
INSERT INTO public.letter_versions(letter_id,version,snapshot,author)
SELECT l.id,l.version,to_jsonb(l),(SELECT user_id FROM public.user_roles WHERE role='admin' ORDER BY user_id LIMIT 1)
FROM public.campaign_letters l JOIN _restore_letter_dates t USING(id)
WHERE t.original_content=t.expected_erroneous_content AND t.target_date IS DISTINCT FROM '1522-10-05';

INSERT INTO public.sync_outbox(entity_type,entity_id,version,payload)
SELECT 'letter',l.id,l.version,to_jsonb(l)
FROM public.campaign_letters l JOIN _restore_letter_dates t USING(id)
WHERE t.original_content=t.expected_erroneous_content
 AND t.target_date IS DISTINCT FROM '1522-10-05';

INSERT INTO public.sync_outbox(entity_type,entity_id,version,payload)
SELECT 'reply',r.id,(SELECT coalesce(max(o.version),0)+1 FROM public.sync_outbox o WHERE o.entity_type='reply' AND o.entity_id=r.id),to_jsonb(r)
FROM public.letter_replies r JOIN _restore_reply_dates t USING(id)
WHERE t.target_date IS DISTINCT FROM '1522-10-05';

DO $final_validation$
BEGIN
 IF (SELECT count(*) FROM public.campaign_letters l JOIN _restore_letter_dates t USING(id)
  WHERE l.content=t.original_content AND l.campaign_date IS NOT DISTINCT FROM t.target_date)<>53
 THEN RAISE EXCEPTION 'Original letter content and dates not completely restored'; END IF;
 IF (SELECT count(*) FROM public.letter_replies r JOIN _restore_reply_dates t USING(id)
  WHERE r.campaign_date IS NOT DISTINCT FROM t.target_date)<>28
 THEN RAISE EXCEPTION 'Original reply dates not completely restored'; END IF;
 IF (SELECT count(*) FROM public.campaign_letters l
  WHERE l.origin_house_id='harcourt' AND l.historical_source='Ação da Casa Harcourt.docx'
   AND l.campaign_date='1522-10-05' AND l.creation_week=1
   AND ((l.recipient_house_id IN ('everlost','silversky') AND l.delivery_week=2)
        OR (l.recipient_house_id IS NULL AND l.delivery_week=1)))<>4
 THEN RAISE EXCEPTION 'Harcourt first-lot send/delivery rules were changed'; END IF;
 IF EXISTS(SELECT 1 FROM public.sync_outbox o
    JOIN _restore_letter_dates t ON o.entity_type='letter' AND o.entity_id=t.id
    JOIN public.campaign_letters l ON l.id=t.id
    WHERE o.state='pending' AND o.version<l.version
       AND o.payload->>'campaign_date'='1522-10-05')
 THEN RAISE EXCEPTION 'Obsolete wrong-date pending delivery remains'; END IF;
END $final_validation$;
COMMIT;
