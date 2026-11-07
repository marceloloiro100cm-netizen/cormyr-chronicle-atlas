-- V3 LIVE - migração candidata. NÃO aplicar automaticamente em produção.
-- Exclusivamente partidas de exércitos-modelo, sem alteração de HouseState.
BEGIN;
CREATE TABLE IF NOT EXISTS public.battle_v3_live_matches (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 title text NOT NULL CHECK (char_length(title) BETWEEN 5 AND 120),
 attacker_house_id text NOT NULL REFERENCES public.campaign_houses(id),
 defender_house_id text NOT NULL REFERENCES public.campaign_houses(id),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 state_version integer NOT NULL DEFAULT 0 CHECK(state_version BETWEEN 0 AND 1500),
 state_hash text NOT NULL CHECK(state_hash ~ '^[0-9a-f]{64}$'),
 replay_json jsonb NOT NULL,
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','completed','closed')),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT battle_v3_live_distinct_houses CHECK(attacker_house_id<>defender_house_id)
);
CREATE INDEX IF NOT EXISTS battle_v3_live_house_attacker_idx
 ON public.battle_v3_live_matches(attacker_house_id,updated_at DESC);
CREATE INDEX IF NOT EXISTS battle_v3_live_house_defender_idx
 ON public.battle_v3_live_matches(defender_house_id,updated_at DESC);
ALTER TABLE public.battle_v3_live_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_v3_live_matches FORCE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS battle_v3_live_visible ON public.battle_v3_live_matches;
CREATE POLICY battle_v3_live_visible ON public.battle_v3_live_matches
 FOR SELECT TO authenticated USING(
  public.campaign_access_active() AND
  (public.is_campaign_admin() OR
   public.in_campaign_house(attacker_house_id,false) OR
   public.in_campaign_house(defender_house_id,false)));
REVOKE ALL ON TABLE public.battle_v3_live_matches FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.battle_v3_live_matches TO authenticated;
GRANT SELECT,INSERT,UPDATE ON public.battle_v3_live_matches TO service_role;
COMMENT ON TABLE public.battle_v3_live_matches IS
 'Partidas sincronizadas V3 com exércitos fictícios; comandos verificados no servidor e CAS por versão. Sem resultado oficial.';
COMMIT;
