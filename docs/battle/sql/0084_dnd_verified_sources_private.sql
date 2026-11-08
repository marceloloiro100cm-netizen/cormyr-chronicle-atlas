-- D&D Cormyr: reconstituição privada do arquivo 5etools enviado
-- pelo Narrador. Nenhum registro deste arquivo vai para o GitHub público.
-- Camada de dados-fonte só de leitura, separada dos 300 originais
-- e das alterações manuais do Narrador (estas têm precedência no cliente).
CREATE TABLE IF NOT EXISTS public.battle_dnd_verified_sources (
 monster_id text PRIMARY KEY
  REFERENCES public.battle_dnd_cormyr_monsters(id) ON DELETE CASCADE,
 combat_defaults jsonb NOT NULL
  CHECK (jsonb_typeof(combat_defaults)='object'),
 source_filename text NOT NULL
  CHECK (length(source_filename) BETWEEN 4 AND 160),
 verified_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.battle_dnd_verified_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.battle_dnd_verified_sources FROM anon, authenticated;
GRANT SELECT ON public.battle_dnd_verified_sources TO authenticated;
DROP POLICY IF EXISTS battle_dnd_verified_sources_narrator_read
 ON public.battle_dnd_verified_sources;
CREATE POLICY battle_dnd_verified_sources_narrator_read
 ON public.battle_dnd_verified_sources FOR SELECT TO authenticated
 USING (public.is_campaign_admin() AND public.campaign_access_active());
COMMENT ON TABLE public.battle_dnd_verified_sources IS
 'Metadados numéricos privados e verificados contra ZIP fornecido pelo Narrador; não são conteúdo para GitHub.';
