-- Assertions de segurança em PostgreSQL de descarte.
INSERT INTO spy_locations(id,kind,ref_id,region_id,name,approved,visibility,source)
 VALUES('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','domain','domain-a','helmlands','Local A',true,'public','mapa');
INSERT INTO spy_assets(id,owner_house_id,kind,codename,source_holding_id,source_ref,
 current_location_id,status,rules_version)
 VALUES
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','house-a','contractor','A',
  'cccccccc-cccc-4ccc-8ccc-cccccccccccc','contractor:h-a:0',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','available','r1'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','house-b','contractor','B',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','contractor:h-b:0',
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','available','r1');
INSERT INTO spy_operations(
 id,owner_house_id,asset_id,operation_key,target_type,target_id,
 mission_kind,requested_fields,status,source_calendar_version,rules_version,created_by)
VALUES
 ('11111111-aaaa-4111-8111-111111111111','house-a',
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '11111111-bbbb-4111-8111-111111111111','house','house-b','military',
  ARRAY['house_army'],'pending_narrator_review',4,'r1','11111111-1111-4111-8111-111111111111'),
 ('22222222-aaaa-4222-8222-222222222222','house-b',
  'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  '22222222-bbbb-4222-8222-222222222222','house','house-a','military',
  ARRAY['house_army'],'pending_narrator_review',4,'r1','22222222-2222-4222-8222-222222222222');
INSERT INTO spy_mission_decisions(operation_id,target_law,law_source,difficulty,
 rule_version,resolution)
VALUES('11111111-aaaa-4111-8111-111111111111',42,'private-sheet',18,'v1','success');
INSERT INTO spy_intel_reports(
 id,operation_id,owner_house_id,code,observed_date_key,asset_codename,
 location_label,requested_fields,status,facts)
VALUES('99999999-9999-4999-8999-999999999999',
 '11111111-aaaa-4111-8111-111111111111','house-a','ES-1',
 '1524-01-20','A','Local A',ARRAY['house_army'],'sealed',
 '[{"id":"88888888-8888-4888-8888-888888888888","fieldCode":"house_army",
 "disclosedValue":"guarnição observada","confidence":"partial","observedDateKey":"1524-01-20",
 "approvedByNarrator":true}]');
-- A: apenas próprios ativos; carta selada não aparece, Lei secreta sem GRANT.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SELECT public.spy_test_assert((SELECT count(*) FROM spy_assets)=1,'A não lê agentes de B');
SELECT public.spy_test_assert((SELECT count(*) FROM spy_operations)=1,'A não lê operações de B');
SELECT public.spy_test_assert((SELECT count(*) FROM spy_intel_reports)=0,'A não lê carta selada');
DO $assert$ BEGIN
 BEGIN
  PERFORM count(*) FROM spy_mission_decisions;
  RAISE EXCEPTION 'RLS leak: decisions should not be granted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.spy_submit_mission('house-b','dddddddd-dddd-4ddd-8ddd-dddddddddddd',
   gen_random_uuid(),'house','house-a','military',ARRAY['house_army'],4,'r1');
  RAISE EXCEPTION 'A escreveu missão da Casa B';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%não autorizada%' THEN RAISE; END IF;
 END;
END $assert$;
RESET ROLE;
-- B não consulta missões feitas contra B nem relatórios de A.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
SELECT public.spy_test_assert((SELECT count(*) FROM spy_operations)=1,'B não lê espionagem inimiga');
SELECT public.spy_test_assert((SELECT count(*) FROM spy_intel_reports)=0,'B não lê carta de A');
RESET ROLE;
-- Narrador, com JWT da sessão, libera material aprovado; sem novos campos da ficha do alvo.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
SELECT public.spy_test_assert((SELECT count(*) FROM spy_mission_decisions)=0,'Decisão nem ao admin por SELECT direto');
SELECT public.spy_test_assert(
 (public.spy_release_report('99999999-9999-4999-8999-999999999999',
  'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee','1524-01-20',
  'Divulgação aprovada pelo Narrador','explicit_communication')->>'status')='released',
 'Narrador pode liberar snapshot aprovado');
SELECT public.spy_test_assert(
 (public.spy_release_report('99999999-9999-4999-8999-999999999999',
  'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee','1524-01-20',
  'Divulgação aprovada pelo Narrador','explicit_communication')->>'duplicate')='true',
 'Release idempotente');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SELECT public.spy_test_assert((SELECT count(*) FROM spy_intel_reports)=1,'A vê carta liberada');
SELECT public.spy_test_assert((SELECT count(*) FROM spy_dossier_facts)=1,'A vê fato autorizado');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
SELECT public.spy_test_assert((SELECT count(*) FROM spy_intel_reports)=0,'B não vê carta contra B');
SELECT public.spy_test_assert((SELECT count(*) FROM spy_dossier_facts)=0,'B não vê fato inimigo');
RESET ROLE;
SELECT 'SQL ESPIONAGEM HOMOLOGACAO ISOLADA: PASSOU' AS result;
