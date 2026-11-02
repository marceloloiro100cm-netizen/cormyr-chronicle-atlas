-- Disposable-only tests for server-side location, route and agents reconciliation.
INSERT INTO public.campaign_houses(id) VALUES ('house-c'),('house-d');
INSERT INTO public.noble_house_sheets(house_id,state) VALUES(
 'house-c','{"houseId":"house-c","phase":"active","domains":[{"id":"dom-c","name":"Dom C"}],"holdings":[
  {"id":"hold-network-c","itemId":"pros-spy-network","status":"active","domainId":"dom-c"},
  {"id":"hold-expanded-c","itemId":"pros-spy-network--expanded-network","parentId":"hold-network-c","status":"active","domainId":"dom-c"},
  {"id":"hold-contract-c","itemId":"pros-spy-contract-batch","status":"active","domainId":"dom-c","costs":[{"resource":"wealth","amount":5,"mode":"allocation"}]}
 ]}'::jsonb),
 ('house-d','{"houseId":"house-d","phase":"active","domains":[{"id":"dom-d","name":"Dom D"}],"holdings":[
  {"id":"hold-contract-unverified","itemId":"pros-spy-contract-batch","status":"active","domainId":"dom-d",
   "costs":[{"resource":"wealth","amount":5,"mode":"allocation"}]}
 ]}'::jsonb);
INSERT INTO public.noble_house_ledger(house_id,operation_key,action,before_state,after_state)
 SELECT 'house-c','88888888-8888-4888-8888-888888888888','purchase',
  '{"holdings":[]}'::jsonb,
  '{"holdings":[{"id":"hold-contract-c","itemId":"pros-spy-contract-batch",
   "costs":[{"resource":"wealth","amount":5,"mode":"allocation"}]}]}'::jsonb;
-- Narrator authority is resolved from session, not accepted from the browser.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $deny$ BEGIN
 BEGIN
  PERFORM public.spy_upsert_location(
   'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0','domain','dom-c','helmlands',
   'Dom C','Fonte aprovada','public',true,0,
   '11111111-aaaa-4111-8111-aaaaaaaaaaaa','Mapa aprovado pelo Narrador');
  RAISE EXCEPTION 'Player approved an unauthorized location';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%Narrador obrigatório%' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.spy_reconcile_house_agents('house-c',
   '11111111-bbbb-4111-8111-aaaaaaaaaaaa','Conciliar agentes da Casa C');
  RAISE EXCEPTION 'Player reconciled adversary assets';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%Narrador obrigatório%' THEN RAISE; END IF;
 END;
END $deny$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
SELECT public.spy_test_assert(
 (public.spy_upsert_location('a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0',
 'domain','dom-c','helmlands','Dom C','Fonte aprovada','narrator',true,0,
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaabbbb','Localidade homologada oficialmente')->>'version')='1',
 'Narrator approves domain using an audited RPC');
SELECT public.spy_test_assert(
 (public.spy_upsert_location('b0b0b0b0-b0b0-40b0-80b0-b0b0b0b0b0b0',
 'domain','dom-d','helmlands','Dom D','Fonte aprovada','narrator',true,0,
 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbcccc','Localidade homologada oficialmente')->>'version')='1',
 'Narrator approves other domain');
SELECT public.spy_test_assert(
 (public.spy_upsert_edge('c0c0c0c0-c0c0-40c0-80c0-c0c0c0c0c0c0',
  'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0','b0b0b0b0-b0b0-40b0-80b0-b0b0b0b0b0b0',
  'horse',3,false,true,false,'Estrada aprovada',0,
  'cccccccc-cccc-4ccc-8ccc-ccccccccdddd','Aresta aprovada pelo Narrador')->>'version')='1',
 'Narrator registers approved three-day edge');
SELECT public.spy_test_assert(
 (public.spy_reconcile_house_agents('house-c',
  'dddddddd-dddd-4ddd-8ddd-ddddddddeeee','Conciliação de posse e ledger confirmados')->>'created')='5',
 '1 base + 2 expanded + 2 paid contractors');
SELECT public.spy_test_assert(
 (public.spy_reconcile_house_agents('house-c',
  'dddddddd-dddd-4ddd-8ddd-ddddddddeeee','Conciliação de posse e ledger confirmados')->>'duplicate')='true',
 'Same operation key does not duplicate assets');
SELECT public.spy_test_assert(
 (public.spy_reconcile_house_agents('house-c',
  'eeeeeeee-eeee-4eee-8eee-eeeeeeeeffff','Repetir conciliação da mesma Casa')->>'created')='0',
 'Fresh key also does not duplicate assets');
SELECT public.spy_test_assert(
 (public.spy_reconcile_house_agents('house-d',
  'ffffffff-ffff-4fff-8fff-ffffffffaaaa','Não reconhecer compras sem registro financeiro')->>'created')='0',
 'Unproven contractor holdings yield no agent');
SELECT public.spy_test_assert(
 (SELECT count(*) FROM public.spy_assets WHERE owner_house_id='house-c')=5,
 'Exactly five new agents in C');
SELECT public.spy_test_assert(
 (SELECT count(*) FROM public.spy_assets WHERE owner_house_id='house-d')=0,
 'No unpaid agent in D');
DO $deny$ BEGIN
 BEGIN
  PERFORM public.spy_upsert_edge('c0c0c0c0-c0c0-40c0-80c0-c0c0c0c0c0c0',
   'a0a0a0a0-a0a0-40a0-80a0-a0a0a0a0a0a0','b0b0b0b0-b0b0-40b0-80b0-b0b0b0b0b0b0',
   'horse',1,false,true,false,'Estrada aprovada',0,
   '11111111-cccc-4111-8111-aaaaaaaaaaaa','Alteração com versão antiga');
  RAISE EXCEPTION 'Outdated version accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%mudou de versão%' THEN RAISE; END IF;
 END;
END $deny$;
RESET ROLE;
-- Restore read rights to check that players cannot see C or D.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
SELECT public.spy_test_assert((SELECT count(*) FROM public.spy_assets WHERE owner_house_id='house-c')=0,
 'A cannot read agents of C');
RESET ROLE;
SELECT 'SQL ESPIONAGEM RPCs REAIS: PASSOU' AS result;
