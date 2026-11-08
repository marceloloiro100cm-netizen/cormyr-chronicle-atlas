-- Catálogo privado, sem fichas do 5etools em código/repositório público.
-- Tabela aplicada via banco do projeto em 2026-11-07, com os 300
-- atributos básicos da seleção entregue pelo Narrador.
-- Somente servidor autorizado e narrador ativo podem consultar.
-- A carga inicial dos dados NÃO integra este arquivo SQL.
CREATE TABLE IF NOT EXISTS public.battle_dnd_cormyr_monsters (
 id text PRIMARY KEY CHECK (char_length(id) BETWEEN 1 AND 56),
 name text NOT NULL CHECK (char_length(name) BETWEEN 1 AND 120),
 group_name text NOT NULL CHECK (group_name IN (
  'Dragões','Goblinoides','Humanoides','Constructos','Mortos-vivos'
 )),
 source text NOT NULL CHECK (char_length(source) BETWEEN 1 AND 45),
 challenge_rating numeric(8,3) NOT NULL CHECK (challenge_rating BETWEEN 0 AND 30),
 hp integer NOT NULL CHECK (hp BETWEEN 1 AND 100000),
 ac integer NOT NULL CHECK (ac BETWEEN 1 AND 40),
 size text NOT NULL CHECK (size IN ('T','S','M','L','H','G')),
 speed_ft integer NOT NULL CHECK (speed_ft BETWEEN 0 AND 1000),
 melee jsonb,
 ranged jsonb,
 catalog_version integer NOT NULL DEFAULT 1,
 inserted_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.battle_dnd_cormyr_monsters ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS battle_dnd_cormyr_narrator_read
 ON public.battle_dnd_cormyr_monsters;
CREATE POLICY battle_dnd_cormyr_narrator_read
 ON public.battle_dnd_cormyr_monsters FOR SELECT TO authenticated
 USING (public.is_campaign_admin() AND public.campaign_access_active());
REVOKE ALL ON public.battle_dnd_cormyr_monsters FROM anon;
REVOKE INSERT,UPDATE,DELETE,TRUNCATE ON public.battle_dnd_cormyr_monsters FROM authenticated;
GRANT SELECT ON public.battle_dnd_cormyr_monsters TO authenticated;
