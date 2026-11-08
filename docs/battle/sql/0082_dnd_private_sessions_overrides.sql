-- Cormyr D&D: sessões e ajustes táticos privados do Narrador.
-- Não altera o catálogo base, contas, Casas, tropas oficiais ou outras batalhas.
CREATE TABLE IF NOT EXISTS public.battle_dnd_sessions (
 owner_id uuid NOT NULL DEFAULT auth.uid(),
 battle_id text NOT NULL CHECK (char_length(battle_id) BETWEEN 1 AND 120),
 replay jsonb NOT NULL,
 report jsonb,
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (owner_id,battle_id)
);
ALTER TABLE public.battle_dnd_sessions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS battle_dnd_sessions_narrator_rw ON public.battle_dnd_sessions;
CREATE POLICY battle_dnd_sessions_narrator_rw
 ON public.battle_dnd_sessions FOR ALL TO authenticated
 USING (owner_id=auth.uid() AND public.is_campaign_admin() AND public.campaign_access_active())
 WITH CHECK (owner_id=auth.uid() AND public.is_campaign_admin() AND public.campaign_access_active());
REVOKE ALL ON public.battle_dnd_sessions FROM anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.battle_dnd_sessions TO authenticated;

CREATE TABLE IF NOT EXISTS public.battle_dnd_monster_overrides (
 monster_id text PRIMARY KEY REFERENCES public.battle_dnd_cormyr_monsters(id) ON DELETE CASCADE,
 combat_patch jsonb NOT NULL DEFAULT '{}'::jsonb,
 updated_by uuid NOT NULL DEFAULT auth.uid(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT combat_patch_is_object CHECK (jsonb_typeof(combat_patch)='object')
);
ALTER TABLE public.battle_dnd_monster_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS battle_dnd_monster_overrides_narrator_rw
 ON public.battle_dnd_monster_overrides;
CREATE POLICY battle_dnd_monster_overrides_narrator_rw
 ON public.battle_dnd_monster_overrides FOR ALL TO authenticated
 USING (public.is_campaign_admin() AND public.campaign_access_active())
 WITH CHECK (updated_by=auth.uid() AND public.is_campaign_admin() AND public.campaign_access_active());
REVOKE ALL ON public.battle_dnd_monster_overrides FROM anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.battle_dnd_monster_overrides TO authenticated;

COMMENT ON TABLE public.battle_dnd_sessions IS 'Replays D&D privados, sem atualizar exércitos ou casas oficiais.';
COMMENT ON TABLE public.battle_dnd_monster_overrides IS 'Ajustes privados de combate sobre o catálogo original imutável de 300 criaturas.';
