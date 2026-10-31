-- Lote 6 · canonical registry, review, relationships, and RLS. Disposable DB only.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',msg;END IF;END $$;
INSERT INTO auth.users(id) VALUES
 ('30000000-0000-0000-0000-000000000261'),
 ('30000000-0000-0000-0000-000000000262');
INSERT INTO public.user_roles(user_id,role) VALUES
 ('30000000-0000-0000-0000-000000000261','admin');
INSERT INTO public.campaign_houses(id,name,source)
 VALUES('lote6-casa','Casa do Teste Temporal','seed de teste');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000261',true);

SELECT pg_temp.assert(public.stage_campaign_character_sources()->>'houses_staged' IS NOT NULL,
 'import of internal candidates has counts');
SELECT pg_temp.assert(
 (SELECT count(*)=0 FROM public.campaign_characters),'staging does not create persons');
SELECT pg_temp.assert(
 (public.get_character_registry_hub(300)->>'count')::integer=0,'empty canonical registry');
-- Manifest never creates or merges canonical people, even after retry.
SELECT pg_temp.assert(public.import_character_source_candidates(
 '[{"source_kind":"archive_history","source_key":"evenhand","proposed_name":"Percival Evenhand",
 "claimed_birth_year":1492,"claimed_age":30,
 "evidence":{"source":"histories/evenhand.json","age_reference":"unknown"}},
 {"source_kind":"archive_history","source_key":"staghunt","proposed_name":"Tomenn Staghunt",
 "claimed_birth_year":1443,"claimed_age":64}]'::jsonb)=2,
 'two archive sources staged as candidates');
SELECT pg_temp.assert(public.import_character_source_candidates(
 '[{"source_kind":"archive_history","source_key":"evenhand","proposed_name":"Percival Evenhand"}]'::jsonb)=0,
 'reimport does not duplicate or overwrite review');
SELECT pg_temp.assert(
 (SELECT count(*)=0 FROM public.campaign_characters),'archive import does not create persons');

-- Narrator explicitly creates a person and confirms a birth year.
SELECT pg_temp.assert(
 (public.save_campaign_character(NULL,NULL,
  '{"display_name":"Percival Evenhand","is_noble":true,
   "birth_year":1492,"alive_status":"alive","house_id":null,
   "visibility":"gm","confidence":"confirmed","review_status":"reviewed"}'::jsonb,
  'Revisão documental comprovada do Narrador')->>'version')::integer=1,
 'new canonical person starts with version one');
SELECT pg_temp.assert(
 (SELECT count(*)=1 FROM public.campaign_characters WHERE display_name='Percival Evenhand'),
 'canonical row created once');
SELECT pg_temp.assert(
 (SELECT review_status='reviewed' FROM public.campaign_characters WHERE display_name='Percival Evenhand'),
 'explicit reviewed status retained');

-- Names alone never link source records; explicit confirmation is required.
SELECT pg_temp.assert(
 (SELECT count(*)=0 FROM public.character_source_links),'no implicit source matching');
SELECT pg_temp.assert(
 (public.review_character_source(
  (SELECT id FROM public.character_review_queue WHERE source_kind='archive_history' AND source_key='evenhand'),
  'link',
  (SELECT id FROM public.campaign_characters WHERE display_name='Percival Evenhand'),
  'Fonte comprovada na história e ficha do Narrador')->>'status')='linked',
 'explicit link creates provenance');
SELECT pg_temp.assert((SELECT count(*)=1 FROM public.character_source_links),
 'one source has one canonical person');
DO $test$ BEGIN
 BEGIN
  PERFORM public.review_character_source(
   (SELECT id FROM public.character_review_queue WHERE source_kind='archive_history' AND source_key='evenhand'),
   'ignore',NULL,'Tentativa de sobrescrever fonte já vinculada');
  RAISE EXCEPTION 'linked source was ignored';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='linked source was ignored' OR SQLERRM NOT LIKE 'Fonte já vinculada%' THEN RAISE; END IF;
 END;
END $test$;

-- Conflicting birth and baseline must be flagged, never silently reconciled.
SELECT pg_temp.assert(
 (public.save_campaign_character(NULL,NULL,
  '{"display_name":"Tomenn Staghunt","is_noble":true,"birth_year":1443,
  "baseline_age":64,"baseline_year":1522,"alive_status":"unknown",
  "visibility":"gm","confidence":"unverified","review_status":"pending"}'::jsonb,
  'Registro histórico com idade textual divergente')->>'review_status')='conflict',
 'birth/age disagreement is explicitly flagged');
SELECT pg_temp.assert(
 (SELECT count(*)=1 FROM public.campaign_characters WHERE review_status='conflict'),
 'conflict remains in narrator review queue');

DO $test$ BEGIN
 BEGIN
  PERFORM public.save_campaign_character(
   (SELECT id FROM public.campaign_characters WHERE display_name='Percival Evenhand'),99,
   '{"display_name":"Nome corrompido"}'::jsonb,'Tentativa com versão desatualizada');
  RAISE EXCEPTION 'stale update accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='stale update accepted' OR SQLERRM NOT LIKE 'Pessoa alterada%' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.save_campaign_character(NULL,NULL,
   '{"display_name":"Nome","birth_year":1492,"birth_date":"1522-01-01"}'::jsonb,
   'Nascimento informado em datas conflitantes');
  RAISE EXCEPTION 'incoherent birth accepted';
 EXCEPTION WHEN check_violation THEN NULL;
 END;
END $test$;

SELECT public.save_campaign_character(NULL,NULL,
 '{"display_name":"Descendente Evenhand","birth_year":1510,"alive_status":"alive","visibility":"gm"}'::jsonb,
 'Inclusão de descendente para teste de genealogia');
SELECT pg_temp.assert(
 (public.save_character_relation(
  (SELECT id FROM public.campaign_characters WHERE display_name='Percival Evenhand'),
  (SELECT id FROM public.campaign_characters WHERE display_name='Descendente Evenhand'),
  'parent','','Vínculo genealógico documentado e aprovado')->>'relation')='parent',
 'genealogy connects stable person identifiers');
DO $test$ BEGIN
 BEGIN
  PERFORM public.save_character_relation(
   (SELECT id FROM public.campaign_characters WHERE display_name='Descendente Evenhand'),
   (SELECT id FROM public.campaign_characters WHERE display_name='Percival Evenhand'),
   'parent','','Tentativa de genealogia circular não autorizada');
  RAISE EXCEPTION 'genealogy cycle accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='genealogy cycle accepted' OR SQLERRM NOT LIKE 'Ciclo genealógico%' THEN RAISE; END IF;
 END;
END $test$;
SELECT pg_temp.assert((SELECT count(*)=1 FROM public.character_relations),'only approved genealogy');

-- All tables protect identities, sources and audit details from arbitrary users.
SELECT pg_temp.assert(NOT has_table_privilege('anon','public.campaign_characters','SELECT'),
 'no anonymous character table SELECT');
SELECT pg_temp.assert(NOT has_table_privilege('anon','public.character_review_queue','SELECT'),
 'no anonymous queue SELECT');
SELECT pg_temp.assert(NOT has_table_privilege('authenticated','public.campaign_characters','INSERT'),
 'players cannot directly insert canonical characters');
SELECT pg_temp.assert(
 (SELECT count(*)>=4 FROM public.character_registry_audit),'changes are audited');

SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000262',true);
SELECT pg_temp.assert((SELECT count(*)=0 FROM public.campaign_characters),
 'another player cannot see secret canonical characters');
SELECT pg_temp.assert((SELECT count(*)=0 FROM public.character_review_queue),
 'another player cannot see source candidates');
SELECT pg_temp.assert((SELECT count(*)=0 FROM public.character_registry_audit),
 'another player cannot see review logs');
DO $test$ BEGIN
 BEGIN
  PERFORM public.get_character_registry_hub(200);
  RAISE EXCEPTION 'player accessed narrator hub';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='player accessed narrator hub' OR SQLERRM NOT LIKE 'Registro canônico restrito%' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.stage_campaign_character_sources();
  RAISE EXCEPTION 'player imported private sources';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='player imported private sources' OR SQLERRM NOT LIKE 'Apenas Narrador%' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.save_campaign_character(NULL,NULL,
   '{"display_name":"Pessoa indevida"}'::jsonb,'Tentativa de cadastro por jogador não autorizado');
  RAISE EXCEPTION 'player edited canonical identity';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='player edited canonical identity' OR SQLERRM NOT LIKE 'Cadastro canônico exclusivo%' THEN RAISE; END IF;
 END;
END $test$;
RESET ROLE;
ROLLBACK;
