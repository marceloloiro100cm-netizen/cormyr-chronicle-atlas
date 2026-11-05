-- Disposable DB acceptance: RLS, CAS, idempotency, rollback, admin revocation.
-- Must be executed ONLY after battle-test-bootstrap.sql + isolated candidate migration.
\set ON_ERROR_STOP on
GRANT SELECT ON public.battle_sim_sessions, public.battle_sim_events TO service_role;
SET ROLE service_role;
SELECT public.battle_sim_commit_replay(
 '11111111-1111-4111-8111-111111111111','Batalha de teste',
 '{"phase":"ready","rulesVersion":"PTE-2.0"}'::jsonb,
 '{"phase":"active","rulesVersion":"PTE-2.0"}'::jsonb,
 repeat('a',64),repeat('a',64),'[]'::jsonb
) AS session_id \gset
RESET ROLE;

-- RLS roles: anonymous 0, player 0, admin 1.
SET ROLE anon;
SET request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
SET app.campaign_active='on';
DO $$ BEGIN
 BEGIN
  PERFORM count(*) FROM public.battle_sim_sessions;
  RAISE EXCEPTION 'B-033: anonymous SELECT unexpectedly permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $$;
RESET ROLE;

SET ROLE authenticated;
SET request.jwt.claim.sub='22222222-2222-4222-8222-222222222222';
DO $$ BEGIN
 IF (SELECT count(*) FROM public.battle_sim_sessions)<>0
 THEN RAISE EXCEPTION 'B-033: player RLS failed'; END IF;
END $$;
RESET ROLE;

SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
DO $$ BEGIN
 IF (SELECT count(*) FROM public.battle_sim_sessions)<>1
 THEN RAISE EXCEPTION 'admin RLS failed'; END IF;
END $$;
RESET ROLE;

-- RPC cannot be called as player (privilege denied by GRANT), and cannot mutate house data.
SET ROLE service_role;
SELECT public.battle_sim_commit_step(
 '11111111-1111-4111-8111-111111111111',
 :'session_id'::uuid,0,'33333333-3333-4333-8333-333333333333',
 '{"type":"END_ACTIVATION","unitId":"a"}'::jsonb,
 jsonb_build_object('actionSeq',1,'commandId','cmd-1','actor','narrator',
   'prevHash',repeat('a',64),'stateHash',repeat('b',64),
   'command',jsonb_build_object('type','END_ACTIVATION','unitId','a')),
 '{"phase":"active","rulesVersion":"PTE-2.0"}'::jsonb,
 repeat('a',64),repeat('b',64)
);
DO $$ BEGIN
 IF (SELECT state_version FROM public.battle_sim_sessions LIMIT 1)<>1
 THEN RAISE EXCEPTION 'B-035: state_version did not advance exactly once'; END IF;
END $$;
SELECT public.battle_sim_commit_step(
 '11111111-1111-4111-8111-111111111111',
 :'session_id'::uuid,0,'33333333-3333-4333-8333-333333333333',
 '{"type":"END_ACTIVATION","unitId":"a"}'::jsonb,
 jsonb_build_object('actionSeq',1,'commandId','cmd-1','actor','narrator',
   'prevHash',repeat('a',64),'stateHash',repeat('b',64),
   'command',jsonb_build_object('type','END_ACTIVATION','unitId','a')),
 '{"phase":"active","rulesVersion":"PTE-2.0"}'::jsonb,
 repeat('a',64),repeat('b',64)
);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.battle_sim_events)<>1
 THEN RAISE EXCEPTION 'B-035: duplicate command inserted another event'; END IF;
END $$;
-- B-036 conflict and B-035 divergent commandId payload.
DO $$DECLARE v uuid;BEGIN
 SELECT id INTO v FROM public.battle_sim_sessions LIMIT 1;
 BEGIN
  PERFORM public.battle_sim_commit_step('11111111-1111-4111-8111-111111111111',
   v,0,'44444444-4444-4444-8444-444444444444',
   '{"type":"END_ACTIVATION","unitId":"b"}'::jsonb,
   jsonb_build_object('actionSeq',1,'prevHash',repeat('a',64),'stateHash',repeat('c',64)),
   '{"phase":"active","rulesVersion":"PTE-2.0"}'::jsonb,repeat('a',64),repeat('c',64));
  RAISE EXCEPTION 'B-036: conflict not detected';
 EXCEPTION WHEN serialization_failure THEN NULL; END;
 BEGIN
  PERFORM public.battle_sim_commit_step('11111111-1111-4111-8111-111111111111',
   v,0,'33333333-3333-4333-8333-333333333333',
   '{"type":"END_ACTIVATION","unitId":"malicious"}'::jsonb,
   jsonb_build_object('actionSeq',1,'prevHash',repeat('a',64),'stateHash',repeat('c',64)),
   '{"phase":"active","rulesVersion":"PTE-2.0"}'::jsonb,repeat('a',64),repeat('c',64));
  RAISE EXCEPTION 'B-035: duplicate id with divergent payload accepted';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'B-035:%' THEN RAISE; END IF;
 END;
END $$;
-- B-037 forced failure after event insert must roll back both event and session.
CREATE FUNCTION public.battle_test_abort_event() RETURNS trigger LANGUAGE plpgsql AS $$
 BEGIN RAISE EXCEPTION 'Injected transactional failure'; END $$;
CREATE TRIGGER battle_test_abort AFTER INSERT ON public.battle_sim_events
 FOR EACH ROW EXECUTE FUNCTION public.battle_test_abort_event();
DO $$ DECLARE v uuid; BEGIN
 SELECT id INTO v FROM public.battle_sim_sessions LIMIT 1;
 BEGIN
  PERFORM public.battle_sim_commit_step('11111111-1111-4111-8111-111111111111',
   v,1,'55555555-5555-4555-8555-555555555555',
   '{"type":"END_ACTIVATION","unitId":"b"}'::jsonb,
   jsonb_build_object('actionSeq',2,'commandId','cmd-2','prevHash',repeat('b',64),'stateHash',repeat('c',64)),
   '{"phase":"active","rulesVersion":"PTE-2.0"}'::jsonb,repeat('b',64),repeat('c',64));
  RAISE EXCEPTION 'B-037: trigger not fired';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM LIKE 'B-037:%' THEN RAISE; END IF;
 END;
 IF (SELECT state_version FROM public.battle_sim_sessions LIMIT 1)<>1
   OR (SELECT count(*) FROM public.battle_sim_events)<>1
 THEN RAISE EXCEPTION 'B-037: partial transaction committed'; END IF;
END $$;
DROP TRIGGER battle_test_abort ON public.battle_sim_events;
DROP FUNCTION public.battle_test_abort_event();

-- B-034: revoke actor, RPC rejects and RLS immediately hides former sessions.
DELETE FROM public.user_roles WHERE user_id='11111111-1111-4111-8111-111111111111';
DO $$DECLARE v uuid;BEGIN
 SELECT id INTO v FROM public.battle_sim_sessions LIMIT 1;
 BEGIN
  PERFORM public.battle_sim_commit_step('11111111-1111-4111-8111-111111111111',
    v,1,'66666666-6666-4666-8666-666666666666',
    '{"type":"END_ACTIVATION","unitId":"b"}'::jsonb,
    jsonb_build_object('actionSeq',2,'prevHash',repeat('b',64),'stateHash',repeat('c',64)),
    '{"phase":"active","rulesVersion":"PTE-2.0"}'::jsonb,repeat('b',64),repeat('c',64));
  RAISE EXCEPTION 'B-034: revoked actor permitted';
 EXCEPTION WHEN insufficient_privilege THEN NULL; END;
END $$;
RESET ROLE;
SET ROLE authenticated;
SET request.jwt.claim.sub='11111111-1111-4111-8111-111111111111';
DO $$ BEGIN
 IF (SELECT count(*) FROM public.battle_sim_sessions)<>0
 THEN RAISE EXCEPTION 'B-034: revoked admin still sees data'; END IF;
END $$;
RESET ROLE;
SELECT 'battle SQL sandbox acceptance passed' AS result;
