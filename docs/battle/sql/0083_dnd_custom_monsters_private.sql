-- Cormyr D&D · Lote 2. Entradas privadas de autoria do Narrador, separadas
-- do catálogo original 300. Nenhuma alteração em senhas, Casas ou recursos.
CREATE TABLE IF NOT EXISTS public.battle_dnd_custom_monsters (
 id text PRIMARY KEY CHECK (id ~ '^[a-z0-9][a-z0-9-]{0,55}$'),
 payload jsonb NOT NULL CHECK (jsonb_typeof(payload)='object'),
 catalog_version integer NOT NULL DEFAULT 2 CHECK (catalog_version=2),
 created_by uuid NOT NULL DEFAULT auth.uid(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT dnd_custom_id_matches_payload CHECK (payload->>'id'=id)
);
ALTER TABLE public.battle_dnd_custom_monsters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.battle_dnd_custom_monsters FROM anon;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.battle_dnd_custom_monsters TO authenticated;
DROP POLICY IF EXISTS dnd_custom_monsters_narrator ON public.battle_dnd_custom_monsters;
CREATE POLICY dnd_custom_monsters_narrator
 ON public.battle_dnd_custom_monsters FOR ALL TO authenticated
 USING (public.is_campaign_admin() AND public.campaign_access_active())
 WITH CHECK (created_by=auth.uid() AND
  public.is_campaign_admin() AND public.campaign_access_active());
COMMENT ON TABLE public.battle_dnd_custom_monsters IS
 'Criaturas originais adicionadas pelo Narrador ao catálogo privado V2; base de 300 intacta.';
