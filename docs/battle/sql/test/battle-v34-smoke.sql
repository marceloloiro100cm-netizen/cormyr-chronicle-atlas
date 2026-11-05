-- Testes V3.4 em PostgreSQL descartável: RLS, CAS, idempotência e revogação.
\set ON_ERROR_STOP on
SET app.campaign_active='on';
GRANT SELECT,INSERT ON TABLE public.battle_v3_invitations TO service_role;
SET ROLE service_role;
INSERT INTO public.battle_v3_invitations(
 title,target_house_id,created_by,scenario,attacker_model_id,defender_model_id,
 attacker_commander,defender_commander
) VALUES ('Treino de duas casas','house-v34-a','11111111-1111-4111-8111-111111111111',
 'plain-open','evenhand-model','ashkar-model','tillet','knight')
RETURNING id AS invite_id \gset
INSERT INTO public.battle_v34_sessions(
 invitation_id,title,attacker_house_id,defender_house_id,created_by,
 config_json,initial_game_json,current_game_json,initial_hash,current_hash
) VALUES (:'invite_id'::uuid,'Treino de duas casas','house-v34-a','house-v34-b',
 '11111111-1111-4111-8111-111111111111',
 '{"scenario":"plain-open"}'::jsonb,'{"mode":"PTE-3.0-SANDBOX"}'::jsonb,
 '{"mode":"PTE-3.0-SANDBOX"}'::jsonb,repeat('a',64),repeat('a',64))
RETURNING id AS sid \gset
SELECT set_config('test.v34_sid',:'sid',false);
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claim.sub='44444444-4444-4444-8444-444444444444';
DO $v34$ BEGIN
 IF (SELECT count(*) FROM public.battle_v34_sessions)<>0 THEN
  RAISE EXCEPTION 'V34: jogador externo enxergou sessão'; END IF;
 BEGIN
  UPDATE public.battle_v34_sessions SET status='closed';
  RAISE EXCEPTION 'V34: usuário consegue escrever tabela';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  PERFORM public.battle_v34_commit_step(null,null,null,0,null,'{}','{}','', '');
  RAISE EXCEPTION 'V34: RPC aceita token de jogador';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $v34$;
SET request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
DO $v34$ BEGIN
 IF (SELECT count(*) FROM public.battle_v34_sessions)<>1 THEN
  RAISE EXCEPTION 'V34: atacante não enxerga sessão'; END IF;
 IF NOT public.battle_v34_can_control('house-v34-a') THEN
  RAISE EXCEPTION 'V34: função JWT negou casa válida'; END IF;
END $v34$;
SET request.jwt.claim.sub='33333333-3333-4333-8333-333333333333';
DO $v34$ BEGIN
 IF (SELECT count(*) FROM public.battle_v34_sessions)<>1 THEN
  RAISE EXCEPTION 'V34: defensor não enxerga sessão'; END IF;
END $v34$;
RESET ROLE;
SET ROLE service_role;
SELECT public.battle_v34_join_seat(:'sid'::uuid,
 '22222222-2222-4222-8222-222222222222','attacker');
SELECT public.battle_v34_join_seat(:'sid'::uuid,
 '33333333-3333-4333-8333-333333333333','defender');
DO $v34$ BEGIN
 IF (SELECT status FROM public.battle_v34_sessions WHERE id=:'sid'::uuid)<>'active'
 THEN RAISE EXCEPTION 'V34: segunda cadeira não ativou partida'; END IF;
END $v34$;
SELECT public.battle_v34_commit_step(:'sid'::uuid,
 '22222222-2222-4222-8222-222222222222','attacker',0,
 '55555555-5555-4555-8555-555555555555',
 '{"kind":"order","command":{"type":"END_ACTIVATION","unitId":"attacker-0"}}'::jsonb,
 '{"mode":"PTE-3.0-SANDBOX","battle":{"phase":"active"}}'::jsonb,
 repeat('a',64),repeat('b',64));
SELECT public.battle_v34_commit_step(:'sid'::uuid,
 '22222222-2222-4222-8222-222222222222','attacker',0,
 '55555555-5555-4555-8555-555555555555',
 '{"kind":"order","command":{"type":"END_ACTIVATION","unitId":"attacker-0"}}'::jsonb,
 '{"mode":"PTE-3.0-SANDBOX","battle":{"phase":"active"}}'::jsonb,
 repeat('a',64),repeat('b',64));
DO $v34$
DECLARE v uuid:=current_setting('test.v34_sid')::uuid;
BEGIN
 IF (SELECT state_version FROM public.battle_v34_sessions WHERE id=v)<>1 OR
  (SELECT count(*) FROM public.battle_v34_receipts WHERE session_id=v)<>1 THEN
  RAISE EXCEPTION 'V34: duplicata alterou estado'; END IF;
 BEGIN
  PERFORM public.battle_v34_commit_step(v,
   '22222222-2222-4222-8222-222222222222','attacker',0,
   '66666666-6666-4666-8666-666666666666',
   '{"kind":"order"}'::jsonb,'{}'::jsonb,repeat('a',64),repeat('c',64));
  RAISE EXCEPTION 'V34: CAS aceitou versão antiga';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'V34:%' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.battle_v34_commit_step(v,
   '44444444-4444-4444-8444-444444444444','defender',1,
   '77777777-7777-4777-8777-777777777777',
   '{"kind":"order"}'::jsonb,'{}'::jsonb,repeat('b',64),repeat('c',64));
  RAISE EXCEPTION 'V34: lado não autorizado passou';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'V34:%' THEN RAISE; END IF;
 END;
END $v34$;
RESET ROLE;
-- A revogação bloqueia tanto a leitura RLS quanto novo comando interno.
UPDATE public.battle_v34_test_members SET active=false
 WHERE actor_id='22222222-2222-4222-8222-222222222222';
SET ROLE authenticated;
SET request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
DO $v34$ BEGIN
 IF (SELECT count(*) FROM public.battle_v34_sessions)<>0 THEN
  RAISE EXCEPTION 'V34: vínculo revogado ainda pode ler'; END IF;
 IF public.battle_v34_can_control('house-v34-a') THEN
  RAISE EXCEPTION 'V34: vínculo revogado ainda controla'; END IF;
END $v34$;
RESET ROLE;
SET ROLE service_role;
DO $v34$
DECLARE v uuid:=current_setting('test.v34_sid')::uuid;
BEGIN
 BEGIN
  PERFORM public.battle_v34_commit_step(v,
   '22222222-2222-4222-8222-222222222222','attacker',1,
   '88888888-8888-4888-8888-888888888888',
   '{"kind":"order"}'::jsonb,'{}'::jsonb,repeat('b',64),repeat('c',64));
  RAISE EXCEPTION 'V34: RPC permitiu vínculo revogado';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'V34:%' THEN RAISE; END IF;
 END;
 IF (SELECT count(*) FROM public.battle_v34_receipts WHERE session_id=v)<>1
 THEN RAISE EXCEPTION 'V34: rollback falhou'; END IF;
END $v34$;
RESET ROLE;
