-- Cormyr Crusada V3.4 — compartilhamento de turnos SOMENTE entre contas autorizadas.
-- Migração aditiva e isolada: sem efeitos em noble_house_sheets, XP ou calendário.
-- NÃO executar automaticamente em produção. Primeiro PostgreSQL descartável e homologação.
BEGIN;
CREATE TABLE IF NOT EXISTS public.battle_v34_sessions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 invitation_id uuid NOT NULL UNIQUE REFERENCES public.battle_v3_invitations(id),
 title text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 120),
 attacker_house_id text NOT NULL REFERENCES public.campaign_houses(id),
 defender_house_id text NOT NULL REFERENCES public.campaign_houses(id),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 attacker_user_id uuid REFERENCES auth.users(id),
 defender_user_id uuid REFERENCES auth.users(id),
 config_json jsonb NOT NULL,
 initial_game_json jsonb NOT NULL,
 current_game_json jsonb NOT NULL,
 initial_hash text NOT NULL CHECK (initial_hash ~ '^[a-f0-9]{64}$'),
 current_hash text NOT NULL CHECK (current_hash ~ '^[a-f0-9]{64}$'),
 state_version integer NOT NULL DEFAULT 0 CHECK (state_version BETWEEN 0 AND 600),
 status text NOT NULL DEFAULT 'waiting' CHECK (status IN ('waiting','active','completed','closed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT battle_v34_distinct_houses CHECK (attacker_house_id<>defender_house_id),
 CONSTRAINT battle_v34_distinct_users CHECK
   (attacker_user_id IS NULL OR defender_user_id IS NULL OR attacker_user_id<>defender_user_id)
);
CREATE INDEX IF NOT EXISTS battle_v34_attacker_house_idx ON public.battle_v34_sessions(attacker_house_id,status,updated_at DESC);
CREATE INDEX IF NOT EXISTS battle_v34_defender_house_idx ON public.battle_v34_sessions(defender_house_id,status,updated_at DESC);
CREATE TABLE IF NOT EXISTS public.battle_v34_receipts (
 session_id uuid NOT NULL REFERENCES public.battle_v34_sessions(id) ON DELETE RESTRICT,
 seq integer NOT NULL CHECK (seq BETWEEN 1 AND 600),
 command_id uuid NOT NULL,
 actor_id uuid NOT NULL REFERENCES auth.users(id),
 side text NOT NULL CHECK (side IN ('attacker','defender')),
 action_json jsonb NOT NULL,
 prev_hash text NOT NULL CHECK (prev_hash ~ '^[a-f0-9]{64}$'),
 state_hash text NOT NULL CHECK (state_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(session_id,seq),UNIQUE(session_id,command_id)
);
ALTER TABLE public.battle_v34_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_v34_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.battle_v34_receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_v34_receipts FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS battle_v34_session_read ON public.battle_v34_sessions;
CREATE POLICY battle_v34_session_read ON public.battle_v34_sessions
 FOR SELECT TO authenticated
 USING (public.campaign_access_active() AND (
   public.is_campaign_admin()
   OR public.in_campaign_house(attacker_house_id,false)
   OR public.in_campaign_house(defender_house_id,false)));
DROP POLICY IF EXISTS battle_v34_receipt_read ON public.battle_v34_receipts;
CREATE POLICY battle_v34_receipt_read ON public.battle_v34_receipts
 FOR SELECT TO authenticated
 USING (EXISTS (
   SELECT 1 FROM public.battle_v34_sessions s
   WHERE s.id=session_id
   AND public.campaign_access_active()
   AND (public.is_campaign_admin()
     OR public.in_campaign_house(s.attacker_house_id,false)
     OR public.in_campaign_house(s.defender_house_id,false))));
REVOKE ALL ON TABLE public.battle_v34_sessions,public.battle_v34_receipts FROM PUBLIC,anon,authenticated;
GRANT SELECT ON TABLE public.battle_v34_sessions,public.battle_v34_receipts TO authenticated;
-- Escrever requer Supabase service_role no servidor APÓS revalidar JWT, acesso e lado.
CREATE OR REPLACE FUNCTION public.battle_v34_join_seat(
 p_session uuid,p_actor uuid,p_side text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.battle_v34_sessions%ROWTYPE;
BEGIN
 IF p_side NOT IN ('attacker','defender') THEN RAISE EXCEPTION 'INVALID_SIDE'; END IF;
 SELECT * INTO s FROM public.battle_v34_sessions WHERE id=p_session FOR UPDATE;
 IF NOT FOUND OR s.status NOT IN ('waiting','active') THEN RAISE EXCEPTION 'SESSION_CLOSED'; END IF;
 IF p_side='attacker' THEN
   IF s.attacker_user_id IS NOT NULL AND s.attacker_user_id<>p_actor THEN RAISE EXCEPTION 'SEAT_TAKEN'; END IF;
   IF s.defender_user_id=p_actor THEN RAISE EXCEPTION 'SAME_PLAYER_BOTH_SIDES'; END IF;
   UPDATE public.battle_v34_sessions SET attacker_user_id=p_actor,updated_at=now()
     WHERE id=p_session AND (attacker_user_id IS NULL OR attacker_user_id=p_actor);
 ELSE
   IF s.defender_user_id IS NOT NULL AND s.defender_user_id<>p_actor THEN RAISE EXCEPTION 'SEAT_TAKEN'; END IF;
   IF s.attacker_user_id=p_actor THEN RAISE EXCEPTION 'SAME_PLAYER_BOTH_SIDES'; END IF;
   UPDATE public.battle_v34_sessions SET defender_user_id=p_actor,updated_at=now()
     WHERE id=p_session AND (defender_user_id IS NULL OR defender_user_id=p_actor);
 END IF;
 UPDATE public.battle_v34_sessions SET status='active',updated_at=now()
  WHERE id=p_session AND attacker_user_id IS NOT NULL AND defender_user_id IS NOT NULL
    AND status='waiting';
 RETURN jsonb_build_object('joined',true,'side',p_side);
END;$$;
CREATE OR REPLACE FUNCTION public.battle_v34_commit_step(
 p_session uuid,p_actor uuid,p_side text,p_expected integer,p_command_id uuid,
 p_action jsonb,p_next jsonb,p_prev_hash text,p_next_hash text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s public.battle_v34_sessions%ROWTYPE; existing public.battle_v34_receipts%ROWTYPE;
BEGIN
 SELECT * INTO s FROM public.battle_v34_sessions WHERE id=p_session FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
 SELECT * INTO existing FROM public.battle_v34_receipts
  WHERE session_id=p_session AND command_id=p_command_id;
 IF FOUND THEN
   IF existing.actor_id<>p_actor OR existing.side<>p_side OR existing.action_json<>p_action THEN
     RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT';
   END IF;
   RETURN jsonb_build_object('duplicate',true,'version',existing.seq,'hash',existing.state_hash);
 END IF;
 IF s.status<>'active' OR p_expected<>s.state_version OR p_prev_hash<>s.current_hash
    OR p_expected>=600 THEN RAISE EXCEPTION 'CONFLICT_OR_CLOSED'; END IF;
 IF (p_side='attacker' AND s.attacker_user_id IS DISTINCT FROM p_actor)
    OR (p_side='defender' AND s.defender_user_id IS DISTINCT FROM p_actor)
    OR p_side NOT IN ('attacker','defender') THEN RAISE EXCEPTION 'SEAT_DENIED'; END IF;
 IF p_action->>'kind' NOT IN ('order','skill','power') OR jsonb_typeof(p_next)<>'object'
    OR p_next_hash !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'INVALID_STEP'; END IF;
 INSERT INTO public.battle_v34_receipts
  (session_id,seq,command_id,actor_id,side,action_json,prev_hash,state_hash)
  VALUES(p_session,p_expected+1,p_command_id,p_actor,p_side,p_action,p_prev_hash,p_next_hash);
 UPDATE public.battle_v34_sessions SET
  current_game_json=p_next,current_hash=p_next_hash,state_version=p_expected+1,
  status=CASE WHEN p_next#>>'{battle,phase}'='completed' THEN 'completed' ELSE status END,
  updated_at=now() WHERE id=p_session;
 RETURN jsonb_build_object('duplicate',false,'version',p_expected+1,'hash',p_next_hash);
END;$$;
REVOKE ALL ON FUNCTION public.battle_v34_join_seat(uuid,uuid,text) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.battle_v34_commit_step(uuid,uuid,text,integer,uuid,jsonb,jsonb,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.battle_v34_join_seat(uuid,uuid,text) TO service_role;
GRANT EXECUTE ON FUNCTION public.battle_v34_commit_step(uuid,uuid,text,integer,uuid,jsonb,jsonb,text,text) TO service_role;
COMMENT ON TABLE public.battle_v34_sessions IS
 'Partidas de treino V3.4: snapshots e lados fictícios. Sem saldo, imóveis, soldados oficiais ou cronologia.';
COMMIT;
