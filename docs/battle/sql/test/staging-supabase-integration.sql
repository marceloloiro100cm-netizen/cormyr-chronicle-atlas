-- CCA BATTLE: supabase staging only. NEVER run against production or populated clones.
-- Testes executados com contas sintéticas, em uma única transação revertida.
-- Precondition: SQL 0076 already installed; role tables/functions provided by Supabase.
BEGIN;
DO $preflight$
BEGIN
 IF (SELECT count(*) FROM auth.users)<>0 OR
    (SELECT count(*) FROM public.user_roles)<>0 OR
    (SELECT count(*) FROM public.noble_house_sheets)<>0 OR
    (SELECT count(*) FROM drizzle.__drizzle_migrations)<>0
 THEN RAISE EXCEPTION 'Ambiente não está vazio e isolado. Abortando sem executar testes.'; END IF;
 IF to_regclass('public.battle_sim_sessions') IS NULL
 THEN RAISE EXCEPTION 'Instale o esquema de batalha primeiro em homologação.'; END IF;
 IF EXISTS(SELECT 1 FROM public.battle_sim_sessions)
 THEN RAISE EXCEPTION 'A homologação já possui batalhas. Execute em cópia descartável.'; END IF;
 IF has_table_privilege('anon','public.battle_sim_sessions','SELECT')
    OR has_table_privilege('authenticated','public.battle_sim_sessions','INSERT')
    OR has_function_privilege('authenticated','public.battle_sim_commit_replay(uuid,text,jsonb,jsonb,text,text,jsonb)','EXECUTE')
 THEN RAISE EXCEPTION 'Privilégios incorretos'; END IF;
END$preflight$;

INSERT INTO auth.users(id,aud,role,email,created_at,updated_at)
VALUES ('11111111-1111-4111-8111-111111111111','authenticated','authenticated','battle-homolog-admin@example.invalid',now(),now()),
('22222222-2222-4222-8222-222222222222','authenticated','authenticated','battle-homolog-player@example.invalid',now(),now());
INSERT INTO public.user_roles(user_id,role)
VALUES('11111111-1111-4111-8111-111111111111','admin');

SET LOCAL ROLE service_role;
DO $write$
DECLARE battle uuid; receipt jsonb;
BEGIN
 battle:=public.battle_sim_commit_replay('11111111-1111-4111-8111-111111111111','Teste tático de homologação',
 '{"phase":"ready","rulesVersion":"PTE-2.0"}'::jsonb,
 '{"phase":"active","rulesVersion":"PTE-2.0"}'::jsonb,
 repeat('a',64),repeat('a',64),'[]'::jsonb);
 receipt:=public.battle_sim_commit_step(
 '11111111-1111-4111-8111-111111111111',battle,0,'33333333-3333-4333-8333-333333333333',
 '{"type":"END_ACTIVATION","unitId":"a"}'::jsonb,
 jsonb_build_object('actionSeq',1,'commandId','cmd-1','actor','narrator',
 'prevHash',repeat('a',64),'stateHash',repeat('b',64),'command',jsonb_build_object('type','END_ACTIVATION','unitId','a')),
 '{"phase":"active","rulesVersion":"PTE-2.0"}'::jsonb,repeat('a',64),repeat('b',64));
 IF receipt->>'duplicate'<>'false' THEN RAISE EXCEPTION 'Primeira operação marcada duplicada'; END IF;
 receipt:=public.battle_sim_commit_step(
 '11111111-1111-4111-8111-111111111111',battle,0,'33333333-3333-4333-8333-333333333333',
 '{"type":"END_ACTIVATION","unitId":"a"}'::jsonb,
 jsonb_build_object('actionSeq',1,'commandId','cmd-1','actor','narrator',
 'prevHash',repeat('a',64),'stateHash',repeat('b',64),'command',jsonb_build_object('type','END_ACTIVATION','unitId','a')),
 '{"phase":"active","rulesVersion":"PTE-2.0"}'::jsonb,repeat('a',64),repeat('b',64));
 IF receipt->>'duplicate'<>'true' OR
  (SELECT state_version FROM public.battle_sim_sessions WHERE id=battle)<>1 OR
  (SELECT count(*) FROM public.battle_sim_events WHERE session_id=battle)<>1
 THEN RAISE EXCEPTION 'Idempotência/versão falhou';END IF;
 BEGIN
  PERFORM public.battle_sim_commit_step(
   '11111111-1111-4111-8111-111111111111',battle,0,'44444444-4444-4444-8444-444444444444',
   '{"type":"END_ACTIVATION","unitId":"a"}'::jsonb,
   jsonb_build_object('actionSeq',1,'prevHash',repeat('a',64),'stateHash',repeat('c',64)),
   '{"phase":"active","rulesVersion":"PTE-2.0"}'::jsonb,repeat('a',64),repeat('c',64));
  RAISE EXCEPTION 'Versão antiga inesperadamente aceita';
 EXCEPTION WHEN serialization_failure THEN NULL;END;
END$write$;
RESET ROLE;

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $admin$BEGIN
 IF NOT public.is_campaign_admin() OR (SELECT count(*) FROM public.battle_sim_sessions)<>1
 THEN RAISE EXCEPTION 'Narrador não consegue ler a própria sessão';END IF;
END$admin$;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
DO $player$BEGIN
 IF public.is_campaign_admin() OR (SELECT count(*) FROM public.battle_sim_sessions)<>0
 THEN RAISE EXCEPTION 'Jogador consultou dados do Narrador';END IF;
END$player$;
RESET ROLE;

DELETE FROM public.user_roles WHERE user_id='11111111-1111-4111-8111-111111111111';
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
DO $revoked$BEGIN
 IF public.is_campaign_admin() OR (SELECT count(*) FROM public.battle_sim_sessions)<>0
 THEN RAISE EXCEPTION 'Narrador revogado permanece autorizado';END IF;
END$revoked$;
RESET ROLE;
ROLLBACK;
SELECT 'PASS: auth/RLS, replay insert, CAS, idempotência e revogação; transação revertida' AS resultado,
(SELECT count(*)::int FROM auth.users) AS usuarios_restantes,
(SELECT count(*)::int FROM public.battle_sim_sessions) AS batalhas_restantes;
