-- Reconciliação da Semana 1, baseada no PDF "Missiva 1.pdf" (14 páginas).
-- O usuário definiu que a data exibida será 5 Marpenoth 1522 CV,
-- independentemente das datas originais constantes das cartas do PDF.
-- Os originais íntegros são preservados no backup JSONB transacional.
-- Registros novos da semana 2 (outras casas) NÃO são reclassificados.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='40000ms';
SELECT pg_advisory_xact_lock(184522);

DO $check$
BEGIN
 IF EXISTS(SELECT 1 FROM public.campaign_migration_backups
  WHERE reason='reconcile-harcourt-week1-20261030') THEN
   RAISE EXCEPTION 'Reconciliação já realizada; não repetir sem auditoria';
 END IF;
 IF (SELECT count(*) FROM public.campaign_letters WHERE historical_source IS NULL
     AND creation_week=1 AND delivery_week=1)<>53 THEN
   RAISE EXCEPTION 'Conjunto da semana 1 diferente dos 53 registros auditados';
 END IF;
 IF (SELECT count(*) FROM public.letter_replies
     WHERE creation_week=1 AND delivery_week=1)<>28 THEN
   RAISE EXCEPTION 'Conjunto de 28 respostas históricas alterado';
 END IF;
 IF (SELECT count(*) FROM public.campaign_letters
     WHERE id::text LIKE 'b1201522-0000-4000-8000-00000000000%'
       AND historical_source='Ação da Casa Harcourt.docx'
       AND origin_house_id='harcourt')<>4 THEN
   RAISE EXCEPTION 'Quatro cartas externas Harcourt não localizadas';
 END IF;
 IF (SELECT count(*) FROM public.campaign_letters
     WHERE recipient_house_id='harcourt'
       AND id::text LIKE '52210000-0000-4000-8000-0000000000%')<>7 THEN
   RAISE EXCEPTION 'Sete cartas Harcourt do PDF não conferem com o banco';
 END IF;
 IF (SELECT count(*) FROM public.letter_replies r JOIN public.campaign_letters l ON l.id=r.letter_id
     WHERE l.recipient_house_id='harcourt' AND l.letter_kind='reservada'
       AND r.author_player_id=(SELECT id FROM public.campaign_players WHERE roster_house_id='harcourt' LIMIT 1))<>6 THEN
   RAISE EXCEPTION 'Respostas de Genevieve já existentes não conferem';
 END IF;
 IF NOT public.valid_campaign_date('1522-10-05') THEN
   RAISE EXCEPTION 'Data de Harptos inválida';
 END IF;
 INSERT INTO public.campaign_migration_backups(reason,snapshot)
 SELECT 'reconcile-harcourt-week1-20261030',
 jsonb_build_object(
   'reference','Missiva 1.pdf; ajuste explícito do Narrador para 5 Marpenoth 1522 CV',
   'legacy_week1_letters',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id)
      FROM public.campaign_letters l WHERE historical_source IS NULL AND creation_week=1 AND delivery_week=1),
   'legacy_week1_replies',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id)
      FROM public.letter_replies r WHERE creation_week=1 AND delivery_week=1),
   'prior_harcourt_sent',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id)
      FROM public.campaign_letters l WHERE id::text LIKE 'b1201522-0000-4000-8000-00000000000%'),
   'original_note_authors',(SELECT jsonb_agg(to_jsonb(l) ORDER BY id)
      FROM public.campaign_letters l WHERE id IN (
       '52210000-0000-4000-8000-000000000052'::uuid,
       '52210000-0000-4000-8000-000000000061'::uuid))
 );
END $check$;

-- Preexisting imported correspondence, originally already grouped in week 1.
UPDATE public.campaign_letters SET campaign_date='1522-10-05'
 WHERE historical_source IS NULL AND creation_week=1 AND delivery_week=1
 AND campaign_date IS DISTINCT FROM '1522-10-05';

-- Preserve the 6 existing Harcourt responses and 22 other historical replies.
UPDATE public.letter_replies
 SET campaign_date='1522-10-05',
 author_name=CASE WHEN author_player_id=(
   SELECT id FROM public.campaign_players WHERE roster_house_id='harcourt' LIMIT 1)
   AND author_name ILIKE '%Hardcourt%' THEN 'Lady Genevieve Harcourt'
   ELSE author_name END
 WHERE creation_week=1 AND delivery_week=1
 AND (campaign_date IS DISTINCT FROM '1522-10-05'
      OR (author_name ILIKE '%Hardcourt%' AND author_player_id=(
       SELECT id FROM public.campaign_players WHERE roster_house_id='harcourt' LIMIT 1)));

-- Corrections to Harcourt outgoing correspondence: sent week 1;
-- Everlost/Silversky actually receive week 2; narrator-managed NPCs week 1.
UPDATE public.campaign_letters
 SET campaign_date='1522-10-05',creation_week=1,
     delivery_week=CASE WHEN recipient_house_id IN ('everlost','silversky') THEN 2 ELSE 1 END,
     letter_number=CASE WHEN recipient_house_id IN ('everlost','silversky') THEN 2 ELSE 1 END,
     sender_name='Lady Genevieve Harcourt'
 WHERE id::text LIKE 'b1201522-0000-4000-8000-00000000000%'
   AND historical_source='Ação da Casa Harcourt.docx';

-- Original signatories of the letters delivered TO Harcourt remain NPCs,
-- rather than being mislabeled as "Narrador" in the sender field.
UPDATE public.campaign_letters SET sender_name=src.npc_name
 FROM (VALUES
 ('52210000-0000-4000-8000-000000000050'::uuid,'Mara, Carpinteira de Goldsun'),
 ('52210000-0000-4000-8000-000000000053'::uuid,'Oren, Escrivão de Goldsun'),
 ('52210000-0000-4000-8000-000000000055'::uuid,'Elina'),
 ('52210000-0000-4000-8000-000000000057'::uuid,'Bastien Roux, Mestre das Adegas'),
 ('52210000-0000-4000-8000-000000000059'::uuid,'Hadrien, Mestre dos Haras'),
 ('52210000-0000-4000-8000-000000000062'::uuid,'Edvardo Harcourt, herdeiro')
 ) AS src(letter_id,npc_name)
 WHERE campaign_letters.id=src.letter_id
   AND campaign_letters.sender_name IS DISTINCT FROM src.npc_name;

-- The PDF contains two additional private orders. Both already exist as
-- separate messages to the Narrador; fix the visible author and house link.
UPDATE public.campaign_letters
 SET sender_name='Lady Genevieve Harcourt',
     origin_house_id='harcourt',
     historical_recipient_name='Narrador · ordens reservadas da Casa Harcourt'
 WHERE id IN (
  '52210000-0000-4000-8000-000000000052'::uuid,
  '52210000-0000-4000-8000-000000000061'::uuid
 );

-- Reconcile embedded "Data:" headings with the mandatory campaign date.
-- Version increments to preserve audit trail and enqueue legitimate sync edits.
-- Original full bodies (including old dates) remain in campaign_migration_backups.
UPDATE public.campaign_letters
 SET content=regexp_replace(content,
 '^Data[[:space:]]*[:\-][[:space:]]*[0-9]{1,2}[[:space:]]*(de[[:space:]]+)?Marpenoth[[:space:]]*(de[[:space:]]+)?1522([[:space:]]*CV)?',
 'Data: 5 de Marpenoth de 1522 CV','i'),
 version=version+1,updated_at=now(),sync_state='pending'
 WHERE historical_source IS NULL AND creation_week=1 AND delivery_week=1
 AND content ~* '^Data[[:space:]]*[:\-][[:space:]]*[0-9]{1,2}[[:space:]]*(de[[:space:]]+)?Marpenoth[[:space:]]*(de[[:space:]]+)?1522([[:space:]]*CV)?'
 AND content !~* '^Data:[[:space:]]*5[[:space:]]+de[[:space:]]+Marpenoth[[:space:]]+de[[:space:]]+1522[[:space:]]+CV';

DO $validate$
BEGIN
 IF (SELECT count(*) FROM public.campaign_letters
  WHERE creation_week=1 AND delivery_week=1 AND historical_source IS NULL
    AND campaign_date='1522-10-05')<>53 THEN
  RAISE EXCEPTION 'Data obrigatória das 53 missivas da semana 1 incorreta';
 END IF;
 IF (SELECT count(*) FROM public.letter_replies
  WHERE creation_week=1 AND delivery_week=1 AND campaign_date='1522-10-05')<>28 THEN
  RAISE EXCEPTION 'Data das 28 respostas históricas incorreta';
 END IF;
 IF (SELECT count(*) FROM public.campaign_letters
 WHERE id::text LIKE 'b1201522-0000-4000-8000-00000000000%'
 AND campaign_date='1522-10-05' AND creation_week=1
 AND ((recipient_house_id IN ('everlost','silversky') AND delivery_week=2)
 OR (recipient_house_id IS NULL AND delivery_week=1)))<>4 THEN
  RAISE EXCEPTION 'Cronologia Harcourt enviada na semana 1 não confere';
 END IF;
 IF (SELECT count(*) FROM public.letter_replies r
 JOIN public.campaign_letters l ON l.id=r.letter_id
 WHERE l.recipient_house_id='harcourt' AND r.author_name='Lady Genevieve Harcourt')<>6 THEN
  RAISE EXCEPTION 'Autoria das seis respostas Harcourt incorreta';
 END IF;
END $validate$;
COMMIT;
