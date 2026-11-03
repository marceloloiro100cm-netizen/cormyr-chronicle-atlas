-- CCA-ESP-MVP-001: PostgreSQL descartável, nunca no banco real.
-- Previous suite: house-c has valid trip to dom-d; calendar version 5 at 1524-01-19.
INSERT INTO auth.users(id) VALUES('44444444-4444-4444-8444-444444444444');
INSERT INTO public.test_roles(user_id,is_admin) VALUES('44444444-4444-4444-8444-444444444444',false);
INSERT INTO public.test_memberships(user_id,house_id,can_edit)
 VALUES('44444444-4444-4444-8444-444444444444','house-c',true);

-- Deliberate invalid scope is blocked by DB, not just the React form.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
DO $check$
DECLARE available_agent uuid;
BEGIN
 SELECT id INTO available_agent FROM public.spy_assets
  WHERE owner_house_id='house-c' AND source_ref='contractor:hold-contract-c:1';
 BEGIN
  PERFORM public.spy_submit_mission('house-c',available_agent,
   'bbbbbbbb-3333-4333-8333-444444444444','region','region-d',
   'regional_recon',ARRAY['house_army'],5,'CCA-ESP-MVP-001:v1');
  RAISE EXCEPTION 'Mission scope bypassed';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%fora do escopo%' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.spy_resolve_mission(
   '11111111-aaaa-4111-8111-111111111111',gen_random_uuid(),
   'success','Jogador não pode resolver a espionagem',1);
  RAISE EXCEPTION 'Player adjudicated';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%Somente o Narrador%' THEN RAISE; END IF;
 END;
END $check$;
RESET ROLE;
-- The official published clock advances in an isolated fixture, NOT via the feature.
UPDATE public.campaign_calendar SET day=22,version=6 WHERE id=true;
INSERT INTO public.campaign_time_operations(after_state) VALUES('{"version":6}'::jsonb);
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
DO $check$
DECLARE operation uuid; agent uuid; out jsonb; facts jsonb;
 report_id uuid:='bbbbbbbb-aaaa-4bbb-8bbb-bbbbbbbbbbbb';
BEGIN
 SELECT op.id,op.asset_id INTO operation,agent
  FROM public.spy_operations op WHERE op.owner_house_id='house-c'
   AND op.mission_kind='regional_recon' AND op.target_id='region-d' LIMIT 1;
 IF operation IS NULL THEN RAISE EXCEPTION 'Previous route fixture missing'; END IF;
 BEGIN
  PERFORM public.spy_seal_intel_report(operation,report_id,gen_random_uuid(),
   'ES-C-01','Dom D','1524-01-22','[]'::jsonb,
   'Sem decisão do narrador não pode selar');
  RAISE EXCEPTION 'Report sealed without decision';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%sem decisão%' THEN RAISE; END IF;
 END;
 out:=public.spy_process_published_movements(
  6,'bbbbbbbb-aaaa-4bbb-8bbb-aaaaaaaaaaaa','Publicação narratorial oficial de 22 Hammer');
 PERFORM public.spy_test_assert((out->>'processed')='1','Arrive exactly once at destination');
 out:=public.spy_resolve_mission(operation,
  'bbbbbbbb-bbbb-4bbb-8bbb-aaaaaaaaaaaa','partial',
  'O agente observou a ponte, mas não confirmou toda a informação',2);
 PERFORM public.spy_test_assert((out->>'outcome_recorded')='true',
  'Narrator records explicit mission outcome');
 PERFORM public.spy_test_assert((out->>'difficulty')='awaiting_approved_rules',
  'No invented difficulty is presented to any player');
 PERFORM public.spy_test_assert(
  (SELECT status FROM public.spy_assets WHERE id=agent)='operating',
  'Partial discovery does not auto-capture agent');
 BEGIN
  PERFORM public.spy_seal_intel_report(operation,gen_random_uuid(),gen_random_uuid(),
   'ES-INVALID','Dom D','1524-01-22',
   jsonb_build_array(jsonb_build_object(
    'id','aaaa0000-0000-4000-8000-000000000001','fieldCode','house_army',
    'disclosedValue','segredo indevido','confidence','confirmed',
    'observedDateKey','1524-01-22','approvedByNarrator',true,
    'sourceOperationId',operation)),
   'Tentativa de informação fora do escopo');
  RAISE EXCEPTION 'Unrequested secret sealed';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%Fato duplicado, fora de escopo%' THEN RAISE; END IF;
 END;
 facts:=jsonb_build_array(jsonb_build_object(
  'id','aaaa0000-0000-4000-8000-000000000002','fieldCode','regional_roads',
  'disclosedValue','Uma ponte está transitável','confidence','partial',
  'observedDateKey','1524-01-22','approvedByNarrator',true,
  'sourceOperationId',operation));
 out:=public.spy_seal_intel_report(operation,report_id,
  'bbbbbbbb-cccc-4bbb-8bbb-aaaaaaaaaaaa','ES-C-01','Dom D',
  '1524-01-22',facts,'Informação parcial checada e reservada');
 PERFORM public.spy_test_assert((out->>'state')='sealed','Report sealed in DB');
 PERFORM public.spy_test_assert(
  (public.spy_seal_intel_report(operation,report_id,
   'bbbbbbbb-cccc-4bbb-8bbb-aaaaaaaaaaaa','ES-C-01','Dom D',
   '1524-01-22',facts,'Repetição idempotente do mesmo selamento')->>'duplicate')='true',
  'Report sealing is idempotent');
 BEGIN
  PERFORM public.spy_seal_intel_report(operation,gen_random_uuid(),
   'bbbbbbbb-cccc-4bbb-8bbb-aaaaaaaaaaaa','ES-C-02','Dom D',
   '1524-01-22',facts,'Repetir chave com outro relatório deve falhar');
  RAISE EXCEPTION 'Different report ID was accepted on the same operation key';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%não corresponde ao relatório%' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.spy_release_report(report_id,
   'bbbbbbbb-dddd-4bbb-8bbb-aaaaaaaaaaaa','1524-01-22',
   'O agente ainda não retornou à origem','returned');
  RAISE EXCEPTION 'Returned without home accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%Retorno físico ainda não comprovado%' THEN RAISE; END IF;
 END;
END $check$;
RESET ROLE;
-- Deliberate admin fixture check bypasses normal client role; this is never a player query.
SELECT public.spy_test_assert(
 (SELECT count(*) FROM public.spy_mission_decisions
  WHERE target_law IS NULL AND difficulty IS NULL
   AND operation_id IN (SELECT id FROM public.spy_operations WHERE owner_house_id='house-c')
   AND resolution='partial')=1,
 'No private target Law or success chance was invented');
-- A member of C cannot read sealed reports at all, nor approve/release them.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
SELECT public.spy_test_assert(
 (SELECT count(*) FROM public.spy_intel_reports WHERE owner_house_id='house-c')=0,
 'Owner C sees ZERO sealed reports');
DO $check$ BEGIN
 BEGIN
  PERFORM public.spy_release_report('bbbbbbbb-aaaa-4bbb-8bbb-bbbbbbbbbbbb',
   gen_random_uuid(),'1524-01-22','Jogador tentou divulgar carta',
   'explicit_communication');
  RAISE EXCEPTION 'Player released sealed report';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%Narrador obrigatório%' THEN RAISE; END IF;
 END;
END $check$;
RESET ROLE;
-- Explicit prior communication is accepted only by narrator, with written reason.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
SELECT public.spy_test_assert(
 (public.spy_release_report('bbbbbbbb-aaaa-4bbb-8bbb-bbbbbbbbbbbb',
  'bbbbbbbb-eeee-4bbb-8bbb-aaaaaaaaaaaa','1524-01-22',
  'Mensagem intermediária autorizada nominalmente pelo Narrador',
  'explicit_communication')->>'status')='released',
 'Narrator releases approved snapshot');
SELECT public.spy_test_assert(
 (public.spy_release_report('bbbbbbbb-aaaa-4bbb-8bbb-bbbbbbbbbbbb',
  'bbbbbbbb-eeee-4bbb-8bbb-aaaaaaaaaaaa','1524-01-22',
  'Mensagem intermediária autorizada nominalmente pelo Narrador',
  'explicit_communication')->>'duplicate')='true',
 'Repeated release key is idempotent');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
SELECT public.spy_test_assert(
 (SELECT count(*) FROM public.spy_intel_reports WHERE owner_house_id='house-c')=1,
 'C reads only released report');
SELECT public.spy_test_assert(
 (SELECT count(*) FROM public.spy_dossier_facts WHERE owner_house_id='house-c')=1,
 'Dossier includes only approved disclosed fact');
SELECT public.spy_test_assert(
 (SELECT count(*) FROM public.spy_dossier_facts WHERE owner_house_id='house-c'
   AND field_code='house_army')=0,
 'Unrequested secret never materialized');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
SELECT public.spy_test_assert(
 (SELECT count(*) FROM public.spy_intel_reports WHERE owner_house_id='house-c')=0,
 'Other house B sees no C intelligence');
SELECT public.spy_test_assert(
 (SELECT count(*) FROM public.spy_dossier_facts WHERE owner_house_id='house-c')=0,
 'Other house B sees no C dossier facts');
RESET ROLE;
SELECT 'ADJUDICACAO SEGURA: RESOLUCAO/SELAMENTO/LIBERACAO PASSOU' AS result;
