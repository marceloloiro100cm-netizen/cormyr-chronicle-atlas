-- Itinerary tests run after operational RPC fixture, on PostgreSQL 16 disposable only.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $check$ BEGIN
 BEGIN
  PERFORM public.spy_plan_operation_route(
   '11111111-aaaa-4111-8111-111111111111',1,5,gen_random_uuid(),'[]'::jsonb,
   'Jogador não pode planejar missões de ninguém');
  RAISE EXCEPTION 'Unprivileged route plan accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%Somente Narrador%' THEN RAISE; END IF;
 END;
END $check$;
RESET ROLE;

SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
DO $check$
DECLARE agent uuid; operation uuid; outcome jsonb; legs jsonb;
BEGIN
 SELECT id INTO agent FROM public.spy_assets
  WHERE owner_house_id='house-c' AND source_ref='base:hold-network-c:0';
 IF agent IS NULL THEN RAISE EXCEPTION 'Fixture agent missing'; END IF;
 outcome:=public.spy_submit_mission('house-c',agent,
  '11111111-1111-4111-8111-222222222222','region','region-d',
  'regional_recon',ARRAY['regional_roads'],5,'CCA-ESP-MVP-001:v1');
 operation:=(outcome->>'id')::uuid;
 legs:=jsonb_build_array(jsonb_build_object(
  'edgeId','c0c0c0c0-c0c0-40c0-80c0-c0c0c0c0c0c0',
  'edgeVersion',1,'fromLocationId','a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0',
  'toLocationId','b0b0b0b0-b0b0-40b0-80b0-b0b0b0b0b0b0',
  'durationDays',3,'departureDateKey','1524-01-19','arrivalDateKey','1524-01-22'
 ));
 BEGIN
  PERFORM public.spy_plan_operation_route(operation,1,5,
   '22222222-2222-4222-8222-222222222222',
   jsonb_set(legs,'{0,durationDays}','2'::jsonb),
   'Narrador tentou simular duração errada');
  RAISE EXCEPTION 'Tampered duration accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%duração incompatível%' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.spy_plan_operation_route(operation,1,5,
   '33333333-3333-4333-8333-333333333333',
   jsonb_set(legs,'{0,arrivalDateKey}','"1524-01-21"'::jsonb),
   'Narrador tentou data fora do calendário');
  RAISE EXCEPTION 'Tampered date accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%calendário de Harptos%' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.spy_plan_operation_route(operation,1,4,
   '44444444-4444-4444-8444-444444444444',legs,
   'Narrador tentou versão vencida do calendário');
  RAISE EXCEPTION 'Stale official calendar accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%Calendário oficial mudou%' THEN RAISE; END IF;
 END;
 outcome:=public.spy_plan_operation_route(operation,1,5,
  '55555555-5555-4555-8555-555555555555',legs,
  'Rota validada no mapa e duração em Harptos');
 PERFORM public.spy_test_assert((outcome->>'segments')='1',
  'Exactly one registered leg');
 PERFORM public.spy_test_assert((outcome->>'total_days')='3',
  '3 approved days, no travel-time invention');
 PERFORM public.spy_test_assert((outcome->>'arrival_date_key')='1524-01-22',
  'Arrival key Harptos preserved');
 PERFORM public.spy_test_assert(
  (public.spy_plan_operation_route(operation,1,5,
   '55555555-5555-4555-8555-555555555555',legs,
   'Rota validada no mapa e duração em Harptos')->>'duplicate')='true',
  'Same key cannot insert leg twice');
 PERFORM public.spy_test_assert(
  (SELECT count(*) FROM public.spy_operation_segments WHERE operation_id=operation)=1,
  'No duplicated segments');
 PERFORM public.spy_test_assert(
  (SELECT status FROM public.spy_operations WHERE id=operation)='traveling',
  'Operation now traveling');
 PERFORM public.spy_test_assert(
  (SELECT status FROM public.spy_assets WHERE id=agent)='traveling',
  'Agent now traveling');
END $check$;
RESET ROLE;
SELECT 'ROTA ESPIONAGEM: HARPTOS/RLS/IDEMPOTENCIA PASSOU' AS result;
