-- Test dashboard only after mission adjudication fixture has released one House C letter.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
DO $test$
DECLARE result jsonb;
BEGIN
 result:=public.spy_read_house_dashboard('house-c');
 PERFORM public.spy_test_assert(result->>'houseId'='house-c','Dashboard scoped to requested House');
 PERFORM public.spy_test_assert(jsonb_array_length(result->'agents')=5,
  'Own agent list has five reconciled assets');
 PERFORM public.spy_test_assert(jsonb_array_length(result->'reports')=1,
  'Only one released report is materialized');
 PERFORM public.spy_test_assert(jsonb_array_length(result->'dossiers')=1,
  'Only own dossier is loaded');
 PERFORM public.spy_test_assert(jsonb_array_length(result->'reports'->0->'facts')=1,
  'Only approved fact shown');
 PERFORM public.spy_test_assert(result::text NOT LIKE '%target_law%' AND
  result::text NOT LIKE '%difficulty%' AND result::text NOT LIKE '%law_source%',
  'Private target Law and decision metadata omitted');
 BEGIN
  PERFORM public.spy_read_house_dashboard('house-b');
  RAISE EXCEPTION 'House C read B dashboard';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%indisponível para esta Casa%' THEN RAISE; END IF;
 END;
END $test$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
DO $test$
DECLARE result jsonb;
BEGIN
 result:=public.spy_read_house_dashboard('house-b');
 PERFORM public.spy_test_assert(jsonb_array_length(result->'reports')=0,
  'B cannot see report released to C');
 BEGIN
  PERFORM public.spy_read_house_dashboard('house-c');
  RAISE EXCEPTION 'B viewed House C dashboard';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%indisponível para esta Casa%' THEN RAISE; END IF;
 END;
END $test$;
RESET ROLE;
SET ROLE anon;
DO $test$ BEGIN
 BEGIN
  PERFORM public.spy_read_house_dashboard('house-c');
  RAISE EXCEPTION 'Anonymous read private dashboard';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $test$;
RESET ROLE;
SELECT 'DASHBOARD INTELIGENCIA RLS: PASSOU' AS result;
