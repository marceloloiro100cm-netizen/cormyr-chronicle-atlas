-- CCA-BATTLE-V2 PTE-2.0 — MARCO B — PROPOSTA PARA HOMOLOGAÇÃO.
-- NÃO APLICAR EM PRODUÇÃO. Este arquivo fica deliberadamente fora de drizzle/migrations.
-- Requer revisão do Hub Temporal (NO_GO), restauração e teste RLS/rollback em banco descartável.
BEGIN;

CREATE TABLE IF NOT EXISTS public.battle_sim_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 created_by uuid NOT NULL,
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
 status text NOT NULL CHECK (status IN ('ready','active','completed','archived')),
 rules_version text NOT NULL DEFAULT 'PTE-2.0' CHECK (rules_version='PTE-2.0'),
 schema_version integer NOT NULL DEFAULT 2 CHECK (schema_version=2),
 initial_state_json jsonb NOT NULL,
 current_state_json jsonb NOT NULL,
 initial_state_hash text NOT NULL CHECK (initial_state_hash ~ '^[a-f0-9]{64}$'),
 state_hash text NOT NULL CHECK (state_hash ~ '^[a-f0-9]{64}$'),
 state_version integer NOT NULL DEFAULT 0 CHECK (state_version BETWEEN 0 AND 1200),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (octet_length(initial_state_json::text)<=800000),
 CHECK (octet_length(current_state_json::text)<=800000)
);
CREATE INDEX IF NOT EXISTS battle_sim_sessions_updated_idx ON public.battle_sim_sessions(updated_at DESC);

CREATE TABLE IF NOT EXISTS public.battle_sim_events (
 session_id uuid NOT NULL REFERENCES public.battle_sim_sessions(id) ON DELETE RESTRICT,
 seq integer NOT NULL CHECK (seq BETWEEN 1 AND 1200),
 command_id text NOT NULL CHECK (length(command_id) BETWEEN 5 AND 100),
 actor_id uuid NOT NULL,
 command_json jsonb NOT NULL,
 event_json jsonb NOT NULL,
 prev_hash text NOT NULL CHECK (prev_hash ~ '^[a-f0-9]{64}$'),
 state_hash text NOT NULL CHECK (state_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(session_id,seq),
 UNIQUE(session_id,command_id),
 CHECK (octet_length(command_json::text)<=10000),
 CHECK (octet_length(event_json::text)<=15000)
);
CREATE TABLE IF NOT EXISTS public.battle_sim_scenarios (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 created_by uuid NOT NULL,
 name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
 map_json jsonb NOT NULL,
 units_json jsonb NOT NULL DEFAULT '[]'::jsonb,
 schema_version integer NOT NULL DEFAULT 2 CHECK (schema_version=2),
 rules_version text NOT NULL DEFAULT 'PTE-2.0' CHECK (rules_version='PTE-2.0'),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (octet_length(map_json::text)<=150000),
 CHECK (octet_length(units_json::text)<=800000)
);
-- RLS + revogação em TODAS as tabelas, sem escrita direta por usuários.
ALTER TABLE public.battle_sim_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_sim_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_sim_scenarios ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.battle_sim_sessions,public.battle_sim_events,public.battle_sim_scenarios
  FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.battle_sim_sessions,public.battle_sim_events,public.battle_sim_scenarios TO authenticated;

DROP POLICY IF EXISTS battle_read_admin ON public.battle_sim_sessions;
CREATE POLICY battle_read_admin ON public.battle_sim_sessions FOR SELECT TO authenticated
 USING (auth.uid() IS NOT NULL AND public.campaign_access_active() AND public.is_campaign_admin());
DROP POLICY IF EXISTS battle_event_read_admin ON public.battle_sim_events;
CREATE POLICY battle_event_read_admin ON public.battle_sim_events FOR SELECT TO authenticated
 USING (auth.uid() IS NOT NULL AND public.campaign_access_active() AND public.is_campaign_admin());
DROP POLICY IF EXISTS battle_scenario_read_admin ON public.battle_sim_scenarios;
CREATE POLICY battle_scenario_read_admin ON public.battle_sim_scenarios FOR SELECT TO authenticated
 USING (auth.uid() IS NOT NULL AND public.campaign_access_active() AND public.is_campaign_admin());

-- Só a camada SERVER, autenticada e revalidada, usa esta função via service_role.
-- A própria transação recusa narrador cujo papel foi revogado.
CREATE OR REPLACE FUNCTION public.battle_sim_commit_replay(
 p_actor uuid,p_name text,p_initial jsonb,p_current jsonb,
 p_initial_hash text,p_current_hash text,p_receipts jsonb
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = pg_catalog,public AS $$
DECLARE v_session uuid;v_len integer;v_i integer:=0;v_e jsonb;v_previous text:=p_initial_hash;
BEGIN
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p_actor AND r.role='admin')
 THEN RAISE EXCEPTION 'Narrador não autorizado' USING ERRCODE='42501'; END IF;
 IF p_name IS NULL OR length(btrim(p_name)) NOT BETWEEN 1 AND 120
 OR jsonb_typeof(p_initial)<>'object' OR jsonb_typeof(p_current)<>'object'
 OR jsonb_typeof(p_receipts)<>'array'
 OR p_initial->>'rulesVersion'<>'PTE-2.0' OR p_current->>'rulesVersion'<>'PTE-2.0'
 OR p_initial->>'phase'<>'ready'
 OR p_current->>'phase' NOT IN ('active','completed','archived')
 OR p_initial_hash !~ '^[a-f0-9]{64}$' OR p_current_hash !~ '^[a-f0-9]{64}$'
 OR octet_length(p_initial::text)>800000 OR octet_length(p_current::text)>800000
 OR octet_length(p_receipts::text)>1500000
 THEN RAISE EXCEPTION 'Estado tático inválido'; END IF;
 v_len:=jsonb_array_length(p_receipts);
 IF v_len>1200 THEN RAISE EXCEPTION 'Limite de comandos excedido'; END IF;
 INSERT INTO public.battle_sim_sessions(created_by,name,status,rules_version,schema_version,
    initial_state_json,current_state_json,initial_state_hash,state_hash,state_version)
 VALUES(p_actor,p_name,p_current->>'phase','PTE-2.0',2,
    p_initial,p_current,p_initial_hash,p_current_hash,v_len)
 RETURNING id INTO v_session;
 FOR v_e IN SELECT value FROM jsonb_array_elements(p_receipts) LOOP
  v_i:=v_i+1;
  IF (v_e->>'actionSeq')::integer<>v_i OR v_e->>'commandId'<>('cmd-'||v_i)
    OR v_e->>'prevHash'<>v_previous OR v_e->>'stateHash' !~ '^[a-f0-9]{64}$'
    OR jsonb_typeof(v_e->'command')<>'object'
  THEN RAISE EXCEPTION 'Encadeamento de replay inválido'; END IF;
  INSERT INTO public.battle_sim_events(session_id,seq,command_id,actor_id,command_json,event_json,
     prev_hash,state_hash)
  VALUES(v_session,v_i,v_e->>'commandId',p_actor,v_e->'command',v_e,
     v_e->>'prevHash',v_e->>'stateHash');
  v_previous:=v_e->>'stateHash';
 END LOOP;
 IF v_previous<>p_current_hash THEN RAISE EXCEPTION 'Hash final divergente'; END IF;
 RETURN v_session;
END $$;

CREATE OR REPLACE FUNCTION public.battle_sim_commit_step(
 p_actor uuid,p_session uuid,p_expected integer,p_command_id text,
 p_command jsonb,p_receipt jsonb,p_current jsonb,p_prev_hash text,p_state_hash text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path = pg_catalog,public AS $$
DECLARE v_session public.battle_sim_sessions%ROWTYPE;v_duplicate public.battle_sim_events%ROWTYPE;
 v_next integer;
BEGIN
 IF p_actor IS NULL OR NOT EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p_actor AND r.role='admin')
 THEN RAISE EXCEPTION 'Narrador não autorizado' USING ERRCODE='42501'; END IF;
 IF p_command_id IS NULL OR length(p_command_id) NOT BETWEEN 5 AND 100
  OR jsonb_typeof(p_command)<>'object' OR jsonb_typeof(p_receipt)<>'object'
  OR jsonb_typeof(p_current)<>'object'
  OR p_prev_hash !~ '^[a-f0-9]{64}$' OR p_state_hash !~ '^[a-f0-9]{64}$'
  OR p_receipt->>'prevHash'<>p_prev_hash OR p_receipt->>'stateHash'<>p_state_hash
  OR octet_length(p_current::text)>800000 THEN RAISE EXCEPTION 'Comando tático inválido'; END IF;
 SELECT * INTO v_session FROM public.battle_sim_sessions WHERE id=p_session FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Sessão de batalha indisponível'; END IF;
 SELECT * INTO v_duplicate FROM public.battle_sim_events
 WHERE session_id=p_session AND command_id=p_command_id;
 IF FOUND THEN
   IF v_duplicate.command_json<>p_command THEN RAISE EXCEPTION 'Chave de comando reutilizada com outro payload'; END IF;
   RETURN jsonb_build_object('duplicate',true,'receipt',v_duplicate.event_json,
     'stateVersion',v_duplicate.seq);
 END IF;
 IF v_session.state_version<>p_expected THEN RAISE EXCEPTION 'CONFLICT: state_version alterada' USING ERRCODE='40001'; END IF;
 IF v_session.state_hash<>p_prev_hash THEN RAISE EXCEPTION 'CONFLICT: state_hash alterado' USING ERRCODE='40001'; END IF;
 IF v_session.status NOT IN ('ready','active') THEN RAISE EXCEPTION 'Batalha encerrada'; END IF;
 IF p_current->>'rulesVersion'<>'PTE-2.0' OR p_current->>'phase' NOT IN ('active','completed')
 THEN RAISE EXCEPTION 'Estado final inválido'; END IF;
 v_next:=v_session.state_version+1;
 IF v_next>1200 THEN RAISE EXCEPTION 'Limite de comandos excedido'; END IF;
 IF (p_receipt->>'actionSeq')::integer<>v_next
 THEN RAISE EXCEPTION 'Sequência inválida'; END IF;
 INSERT INTO public.battle_sim_events(session_id,seq,command_id,actor_id,command_json,event_json,
   prev_hash,state_hash)
 VALUES(p_session,v_next,p_command_id,p_actor,p_command,p_receipt,p_prev_hash,p_state_hash);
 UPDATE public.battle_sim_sessions SET current_state_json=p_current,state_version=v_next,
  state_hash=p_state_hash,status=p_current->>'phase',updated_at=now() WHERE id=p_session;
 RETURN jsonb_build_object('duplicate',false,'receipt',p_receipt,'stateVersion',v_next);
END $$;

-- SECURITY DEFINER só exposto à conta técnica do servidor, não ao navegador.
REVOKE ALL ON FUNCTION public.battle_sim_commit_replay(uuid,text,jsonb,jsonb,text,text,jsonb)
 FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.battle_sim_commit_step(uuid,uuid,integer,text,jsonb,jsonb,jsonb,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.battle_sim_commit_replay(uuid,text,jsonb,jsonb,text,text,jsonb)
 TO service_role;
GRANT EXECUTE ON FUNCTION public.battle_sim_commit_step(uuid,uuid,integer,text,jsonb,jsonb,jsonb,text,text)
 TO service_role;
COMMIT;
