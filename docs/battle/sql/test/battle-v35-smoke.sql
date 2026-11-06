-- V3.5: no database real. Teste de revisão, aprovação, atomicidade e idempotência.
\set ON_ERROR_STOP on
SET app.campaign_active='on';
SELECT id AS bid FROM public.battle_sim_sessions WHERE name='V35 official test' \gset
SET ROLE service_role;
INSERT INTO public.battle_v35_cases(
 battle_session_id,created_by,house_a_id,house_b_id,
 expected_version_a,expected_version_b,source_hash_a,source_hash_b,battle_hash,
 sources_json,report_json
) VALUES (:'bid'::uuid,'11111111-1111-4111-8111-111111111111',
 'house-v34-a','house-v34-b',7,8,repeat('a',64),repeat('b',64),repeat('c',64),
 '[{"unitId":"a"},{"unitId":"b"}]'::jsonb,'{"rounds":4}'::jsonb)
 RETURNING id AS caseid \gset
SELECT set_config('test.v35_case',:'caseid',false);
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
DO $v35$ BEGIN
 IF (SELECT count(*) FROM public.battle_v35_cases)<>0
 THEN RAISE EXCEPTION 'V35_TEST: jogador conseguiu ler dossiê'; END IF;
 BEGIN
  UPDATE public.battle_v35_cases SET status='applied';
  RAISE EXCEPTION 'V35_TEST: jogador conseguiu aplicar';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
  PERFORM public.battle_v35_apply(null,null,null,null,null,null,null,null,0,0,null,null);
  RAISE EXCEPTION 'V35_TEST: RPC exposta ao jogador';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $v35$;
SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
DO $v35$ BEGIN
 IF (SELECT count(*) FROM public.battle_v35_cases)<>1
 THEN RAISE EXCEPTION 'V35_TEST: narrador não consegue ler dossiê'; END IF;
END $v35$;
RESET ROLE;
SET ROLE service_role;
SELECT public.battle_v35_save_plan(
 '11111111-1111-4111-8111-111111111111',:'caseid'::uuid,0,
 '[{"stackId":"a","losses":4,"note":"Perdas manuais aprovadas"},{"stackId":"b","losses":2,"note":"Perdas manuais aprovadas"}]'::jsonb,
 repeat('f',64));
SELECT public.battle_v35_approve_plan(
 '11111111-1111-4111-8111-111111111111',:'caseid'::uuid,1,repeat('f',64));
SELECT public.battle_v35_apply(
 '11111111-1111-4111-8111-111111111111',:'caseid'::uuid,
 '99999999-9999-4999-8999-999999999999',repeat('f',64),
 '{"houseId":"house-v34-a","units":[{"id":"a","strength":100,"casualties":0}]}'::jsonb,
 '{"houseId":"house-v34-b","units":[{"id":"b","strength":100,"casualties":0}]}'::jsonb,
 '{"houseId":"house-v34-a","units":[{"id":"a","strength":100,"casualties":4}]}'::jsonb,
 '{"houseId":"house-v34-b","units":[{"id":"b","strength":100,"casualties":2}]}'::jsonb,
 7,8,repeat('1',64),repeat('2',64));
SELECT public.battle_v35_apply(
 '11111111-1111-4111-8111-111111111111',:'caseid'::uuid,
 '99999999-9999-4999-8999-999999999999',repeat('f',64),
 '{"houseId":"house-v34-a","units":[{"id":"a","strength":100,"casualties":0}]}'::jsonb,
 '{"houseId":"house-v34-b","units":[{"id":"b","strength":100,"casualties":0}]}'::jsonb,
 '{"houseId":"house-v34-a","units":[{"id":"a","strength":100,"casualties":4}]}'::jsonb,
 '{"houseId":"house-v34-b","units":[{"id":"b","strength":100,"casualties":2}]}'::jsonb,
 7,8,repeat('1',64),repeat('2',64));
DO $v35$
DECLARE v uuid:=current_setting('test.v35_case')::uuid;
BEGIN
 IF (SELECT version FROM public.noble_house_sheets WHERE house_id='house-v34-a')<>8
  OR (SELECT version FROM public.noble_house_sheets WHERE house_id='house-v34-b')<>9
  OR (SELECT count(*) FROM public.battle_v35_receipts WHERE case_id=v)<>1
  OR (SELECT status FROM public.battle_v35_cases WHERE id=v)<>'applied' THEN
  RAISE EXCEPTION 'V35_TEST: aplicação não foi atômica/idempotente'; END IF;
END $v35$;
RESET ROLE;
-- Preparar outra operação com falha injetada no segundo UPDATE.
SELECT id AS bid2 FROM public.battle_sim_sessions WHERE name='V35 rollback' \gset
SET ROLE service_role;
INSERT INTO public.battle_v35_cases(
 battle_session_id,created_by,house_a_id,house_b_id,
 expected_version_a,expected_version_b,source_hash_a,source_hash_b,battle_hash,
 sources_json,report_json,decisions_json,plan_hash,
 review_version,status,approved_by,approved_at
) VALUES (:'bid2'::uuid,'11111111-1111-4111-8111-111111111111',
 'house-v34-a','house-v34-b',8,9,repeat('1',64),repeat('2',64),repeat('c',64),
 '[{"unitId":"a"},{"unitId":"b"}]'::jsonb,'{"rounds":4}'::jsonb,
 '[{"stackId":"a","losses":1},{"stackId":"b","losses":1}]'::jsonb,
 repeat('f',64),1,'approved','11111111-1111-4111-8111-111111111111',now())
 RETURNING id AS second_case \gset
RESET ROLE;
CREATE FUNCTION public.v35_abort_second_house() RETURNS trigger
 LANGUAGE plpgsql AS $v35$ BEGIN
 IF NEW.house_id='house-v34-b' THEN RAISE EXCEPTION 'INJECTED_SECOND_HOUSE_FAILURE'; END IF;
 RETURN NEW;
 END $v35$;
CREATE TRIGGER v35_fail_second BEFORE UPDATE ON public.noble_house_sheets
 FOR EACH ROW EXECUTE FUNCTION public.v35_abort_second_house();
SELECT set_config('test.v35_case',:'second_case',false);
SET ROLE service_role;
DO $v35$
DECLARE v uuid:=current_setting('test.v35_case')::uuid;
BEGIN
 BEGIN
  PERFORM public.battle_v35_apply(
  '11111111-1111-4111-8111-111111111111',v,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',repeat('f',64),
  '{"houseId":"house-v34-a","units":[{"id":"a","strength":100,"casualties":4}]}'::jsonb,
  '{"houseId":"house-v34-b","units":[{"id":"b","strength":100,"casualties":2}]}'::jsonb,
  '{"houseId":"house-v34-a","units":[{"id":"a","strength":100,"casualties":5}]}'::jsonb,
  '{"houseId":"house-v34-b","units":[{"id":"b","strength":100,"casualties":3}]}'::jsonb,
  8,9,repeat('3',64),repeat('4',64));
  RAISE EXCEPTION 'V35_TEST: gatilho de falha não executou';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'V35_TEST:%' THEN RAISE; END IF;
 END;
 IF (SELECT version FROM public.noble_house_sheets WHERE house_id='house-v34-a')<>8 OR
    (SELECT version FROM public.noble_house_sheets WHERE house_id='house-v34-b')<>9 OR
    EXISTS(SELECT 1 FROM public.battle_v35_receipts WHERE case_id=v) THEN
  RAISE EXCEPTION 'V35_TEST: rollback não reverteu as duas casas'; END IF;
END $v35$;
RESET ROLE;
DROP TRIGGER v35_fail_second ON public.noble_house_sheets;
DROP FUNCTION public.v35_abort_second_house();
