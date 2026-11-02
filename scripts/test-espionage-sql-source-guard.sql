-- Disposable PostgreSQL only: source states are changed by superuser test fixture,
-- NEVER by authenticated player. Session-bound RPCs are exercised as Narrador.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
DO $test$
DECLARE agent uuid; result jsonb;
BEGIN
 SELECT id INTO agent FROM public.spy_assets WHERE owner_house_id='house-c'
  AND source_ref='expanded:hold-expanded-c:0';
 IF agent IS NULL THEN RAISE EXCEPTION 'No expanded agent'; END IF;
 result:=public.spy_submit_mission('house-c',agent,
  '22222222-1111-4111-8111-222222222222','house','house-d',
  'house_recon',ARRAY['house_name'],5,'CCA-ESP-MVP-001:v1');
 PERFORM public.spy_test_assert((result->>'status')='planned',
  'Active expanded network can assign agent');
END $test$;
RESET ROLE;
-- Simulate administrator-approved sale/destruction outside the espionage subsystem.
UPDATE public.noble_house_sheets SET state=jsonb_set(state,'{holdings,0,status}','"destroyed"'::jsonb)
 WHERE house_id='house-c';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
DO $test$
DECLARE agent uuid;
BEGIN
 SELECT id INTO agent FROM public.spy_assets WHERE owner_house_id='house-c'
  AND source_ref='expanded:hold-expanded-c:1';
 BEGIN
  PERFORM public.spy_submit_mission('house-c',agent,
   '22222222-2222-4222-8222-333333333333','house','house-d',
   'house_recon',ARRAY['house_name'],5,'CCA-ESP-MVP-001:v1');
  RAISE EXCEPTION 'Mission accepted with destroyed parent network';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%Rede principal desativada%' THEN RAISE; END IF;
 END;
END $test$;
RESET ROLE;
UPDATE public.noble_house_sheets SET state=jsonb_set(state,'{holdings,0,status}','"active"'::jsonb)
 WHERE house_id='house-c';
UPDATE public.noble_house_sheets SET state=jsonb_set(state,'{holdings,1,status}','"sold"'::jsonb)
 WHERE house_id='house-c';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
DO $test$
DECLARE agent uuid;
BEGIN
 SELECT id INTO agent FROM public.spy_assets WHERE owner_house_id='house-c'
  AND source_ref='expanded:hold-expanded-c:1';
 BEGIN
  PERFORM public.spy_submit_mission('house-c',agent,
   '22222222-3333-4333-8333-444444444444','house','house-d',
   'house_recon',ARRAY['house_name'],5,'CCA-ESP-MVP-001:v1');
  RAISE EXCEPTION 'Mission accepted with sold holding';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%Posse de origem indisponível%' THEN RAISE; END IF;
 END;
END $test$;
RESET ROLE;
UPDATE public.noble_house_sheets SET state=jsonb_set(state,'{holdings,1,status}','"active"'::jsonb)
 WHERE house_id='house-c';
UPDATE public.noble_house_sheets SET state=jsonb_set(state,'{holdings,2,status}','"destroyed"'::jsonb)
 WHERE house_id='house-c';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
DO $test$
DECLARE agent uuid;
BEGIN
 SELECT id INTO agent FROM public.spy_assets WHERE owner_house_id='house-c'
  AND source_ref='contractor:hold-contract-c:0';
 BEGIN
  PERFORM public.spy_submit_mission('house-c',agent,
   '22222222-4444-4444-8444-555555555555','house','house-d',
   'house_recon',ARRAY['house_name'],5,'CCA-ESP-MVP-001:v1');
  RAISE EXCEPTION 'Contractor assigned after batch destroyed';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%Posse de origem indisponível%' THEN RAISE; END IF;
 END;
 PERFORM public.spy_test_assert((SELECT count(*) FROM public.spy_operations op
  JOIN public.spy_assets a ON a.id=op.asset_id WHERE
  a.owner_house_id='house-c' AND a.source_ref='expanded:hold-expanded-c:1')=0,
  'Rejected spy operations are not inserted');
END $test$;
RESET ROLE;
SELECT 'GUARDA DE POSSE ATIVA: PASSOU' AS result;
