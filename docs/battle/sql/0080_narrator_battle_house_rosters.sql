-- Cormyr · catálogo militar do módulo de batalha (exclusivo do Narrador).
-- Não se vincula a pagamentos, ações oficiais, alteração de unidades ou perfis do jogador.
-- Dados de origem: https://docs.google.com/spreadsheets/d/1k8vvnu2V1cD73zkeQlnqE81Z6dpUaOfK/edit
-- NÃO inserir automaticamente propostas em noble_house_sheets.
CREATE TABLE IF NOT EXISTS public.battle_house_roster_imports (
 source_key text PRIMARY KEY,
 house_id text NOT NULL REFERENCES public.house_catalog(id),
 unit_name text NOT NULL,
 catalog_id text NOT NULL,
 unit_type text NOT NULL,
 training text NOT NULL CHECK (training IN ('green','trained','veteran','elite')),
 quantity integer NOT NULL CHECK (quantity BETWEEN 1 AND 30),
 standard_unit_strength integer NOT NULL CHECK (standard_unit_strength BETWEEN 1 AND 1000),
 unit_strength_basis text NOT NULL DEFAULT 'unit-military-standard',
 source_status text NOT NULL,
 source_region text NOT NULL,
 source_domain text,
 source_row integer NOT NULL,
 source_file_id text NOT NULL,
 source_url text,
 source_note text,
 simulation_only boolean NOT NULL DEFAULT true CHECK (simulation_only),
 imported_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_file_id,source_row)
);
ALTER TABLE public.battle_house_roster_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.battle_house_roster_imports FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.battle_house_roster_imports FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.battle_house_roster_imports TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.battle_house_roster_imports TO service_role;
DO $guard$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public'
   AND tablename='battle_house_roster_imports' AND policyname='battle_roster_narrator_read') THEN
  CREATE POLICY battle_roster_narrator_read ON public.battle_house_roster_imports
   FOR SELECT TO authenticated USING (public.is_campaign_admin() AND public.campaign_access_active());
 END IF;
END $guard$;
-- A importação dos registros é feita em lotes de 85, por chave imutável
-- (ID do arquivo de origem + linha da aba Painel Dinâmico), com DO NOTHING.
-- 483 linhas: 467 propostas / 16 lançamentos de ficha autoral.
-- Estes registros não são escritas oficiais no sistema de Casas.
