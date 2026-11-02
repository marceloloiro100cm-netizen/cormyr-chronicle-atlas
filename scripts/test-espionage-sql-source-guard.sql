-- Disposable PostgreSQL only: deny missions when source holding changes state.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
DO $test$
DECLARE expansion uuid; other_expansion uuid; contractor uuid; result jsonb;
BEGIN
 SELECT id INTO expansion FROM public.spy_assets WHERE owner_house_id='house-c'
  AND source_ref='expanded:hold-expanded-c:0';
 SELECT id INTO other_expansion FROM public.spy_assets WHERE owner_house_id='house-c'
  AND source_ref='expanded:hold-expanded-c:1';
 SELECT id INTO contractor FROM public.spy_assets WHERE owner_house_id='house-c'
  AND source_ref='contractor:hold-contract-c:0';
 IF expansion IS NULL OR other_expansion IS NULL OR contractor IS NULL
 THEN RAISE EXCEPTION 'Preliminary agent reconciliation missing'; END IF;
 result:=public.spy_submit_mission('house-c',expansion,
  '22222222-1111-4111-8111-222222222222','house','house-d',
  'house_recon',ARRAY['house_name'],5,'CCA-ESP-MVP-001:v1');
 PERFORM public.spy_test_assert((result->>'status')='planned','Active expanded network can assign agent');
 UPDATE public.noble_house_sheets SET state=jsonb_set(state,'{holdings,0,status}','"destroyed"'::jsonb)
  WHERE house_id='house-c';
 BEGIN
  PERFORM public.spy_submit_mission('house-c',other_expansion,
   '22222222-2222-4222-8222-333333333333','house','house-d',
   'house_recon',ARRAY['house_name'],5,'CCA-ESP-MVP-001:v1');
  RAISE EXCEPTION 'Mission accepted with parent network destroyed';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%Rede principal desativada%' THEN RAISE; END IF;
 END;
 UPDATE public.noble_house_sheets SET state=jsonb_set(state,'{holdings,0,status}','"active"'::jsonb)
  WHERE house_id='house-c';
 UPDATE public.noble_house_sheets SET state=jsonb_set(state,'{holdings,1,status}','"sold"'::jsonb)
  WHERE house_id='house-c';
 BEGIN
  PERFORM public.spy_submit_mission('house-c',other_expansion,
   '22222222-3333-4333-8333-444444444444','house','house-d',
   'house_recon',ARRAY['house_name'],5,'CCA-ESP-MVP-001:v1');
  RAISE EXCEPTION 'Mission accepted with expanded holding sold';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%Posse de origem indisponível%' THEN RAISE; END IF;
 END;
 UPDATE public.noble_house_sheets SET state=jsonb_set(state,'{holdings,1,status}','"active"'::jsonb)
  WHERE house_id='house-c';
 UPDATE public.noble_house_sheets SET state=jsonb_set(state,'{holdings,2,status}','"destroyed"'::jsonb)
  WHERE house_id='house-c';
 BEGIN
  PERFORM public.spy_submit_mission('house-c',contractor,
   '22222222-4444-4444-8444-555555555555','house','house-d',
   'house_recon',ARRAY['house_name'],5,'CCA-ESP-MVP-001:v1');
  RAISE EXCEPTION 'Contractor assigned after batch expired or destroyed';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%Posse de origem indisponível%' THEN RAISE; END IF;
 END;
 PERFORM public.spy_test_assert((SELECT status FROM public.spy_assets WHERE id=other_expansion)='available',
  'Rejected assignments never alter agent availability');
 PERFORM public.spy_test_assert((SELECT count(*) FROM public.spy_operations WHERE
  asset_id=other_expansion)=0,'Rejected assignments never insert operations');
END $test$;
RESET ROLE;
SELECT 'GUARDA DE POSSE ATIVA: PASSOU' AS result;
