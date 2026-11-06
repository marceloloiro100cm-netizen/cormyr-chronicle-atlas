-- CCA-ESP-MVP-001 · Importação de atributos nobres do Google Sheets
-- Fonte: [fonte privada no Drive do Narrador]
-- Aba: Atributos das Casas (A2:O171), última modificação observada 2026-11-03T18:14:40.277Z
-- 170 registros verificados por nome/ID/região contra house_catalog; 8 fichas operacionais preservadas.
-- As abas "Compras" são propostas e NÃO constituem construções adquiridas.
-- Adição atômica: NÃO altera noble_house_sheets, house_catalog, ledger nem cartas.
BEGIN;
SET LOCAL lock_timeout = '8s';
CREATE TABLE IF NOT EXISTS public.spy_noble_house_stats (
 house_id text PRIMARY KEY REFERENCES public.house_catalog(id) ON DELETE RESTRICT,
 house_name text NOT NULL,
 region_id text NOT NULL CHECK(region_id IN
 ('crownlands','veilstone','shieldmark','helmlands','horselands','dragoncoast',
 'swordmark','ferlin','stonelands','elfhold','volkumburgh')),
 hierarchy text NOT NULL DEFAULT '',
 overlord text NOT NULL DEFAULT '',
 defense integer NOT NULL CHECK(defense BETWEEN 0 AND 100000),
 influence integer NOT NULL CHECK(influence BETWEEN 0 AND 100000),
 lands integer NOT NULL CHECK(lands BETWEEN 0 AND 100000),
 law integer NOT NULL CHECK(law BETWEEN 0 AND 100000),
 population integer NOT NULL CHECK(population BETWEEN 0 AND 100000),
 power integer NOT NULL CHECK(power BETWEEN 0 AND 100000),
 wealth integer NOT NULL CHECK(wealth BETWEEN 0 AND 100000),
 budget integer NOT NULL CHECK(budget BETWEEN 0 AND 100000),
 total integer NOT NULL CHECK(total BETWEEN 0 AND 100000),
 difference integer NOT NULL,
 attribute_origin text NOT NULL,
 source_spreadsheet_id text NOT NULL DEFAULT '1Yts9r_X4yc1PsXcz1ah0HqmFvQme0CRCDoFhIgPMTmA',
 source_sheet text NOT NULL DEFAULT 'Atributos das Casas',
 source_row integer NOT NULL UNIQUE CHECK(source_row>=2),
 source_modified_at timestamptz NOT NULL DEFAULT '2026-11-03T18:14:40.277Z'::timestamptz,
 imported_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT spy_stats_total_matches CHECK(total=defense+influence+lands+law+population+power+wealth),
 CONSTRAINT spy_stats_budget_matches CHECK(difference=total-budget)
);
ALTER TABLE public.spy_noble_house_stats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.spy_noble_house_stats FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.spy_noble_house_stats TO authenticated;
DROP POLICY IF EXISTS spy_noble_stats_narrator_select ON public.spy_noble_house_stats;
CREATE POLICY spy_noble_stats_narrator_select ON public.spy_noble_house_stats
 FOR SELECT TO authenticated
 USING (auth.uid() IS NOT NULL AND public.campaign_access_active() AND public.is_campaign_admin());

DO $preflight$ BEGIN
 IF (SELECT count(*) FROM public.spy_noble_house_stats) <> 0
 THEN RAISE EXCEPTION 'Tabela já contém registros: conciliar versões antes de nova importação'; END IF;
 IF (SELECT count(*) FROM public.noble_house_sheets) <> 8
 THEN RAISE EXCEPTION 'Contagem de fichas operacionais divergiu: revisar antes de prosseguir'; END IF;
END $preflight$;

-- Real campaign statistics for 170 houses were imported to Supabase on 2026-11-03.
-- The original inline JSON dataset is deliberately absent from public Git.
-- For a new environment, restore it from an administrator-controlled private source.
-- This public schema script no longer inserts or overwrites any house attributes.

CREATE OR REPLACE FUNCTION public.spy_public_noble_targets()
RETURNS TABLE(id text,name text,region text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
 THEN RAISE EXCEPTION 'Lista pública de Casas indisponível para esta sessão'; END IF;
 RETURN QUERY
 SELECT c.id,c.name,c.region
 FROM public.house_catalog c
 WHERE c.public_reviewed IS TRUE
 ORDER BY c.region,c.name,c.id;
END $fn$;
REVOKE ALL ON FUNCTION public.spy_public_noble_targets() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spy_public_noble_targets() TO authenticated;

-- Metadados para resolução da dificuldade SOMENTE pelo Narrador.
-- A existência da ficha prevalece sobre o atributo importado; o Narrador
-- deverá calcular a Lei operacional e os bônus pela engine de Casa.
CREATE OR REPLACE FUNCTION public.spy_narrator_noble_defense_source(p_house text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $fn$
DECLARE v record;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active() OR
    NOT public.is_campaign_admin()
 THEN RAISE EXCEPTION 'Dificuldade de Casa-alvo reservada ao Narrador'; END IF;
 SELECT c.id,c.name,c.region,
  EXISTS(SELECT 1 FROM public.noble_house_sheets n WHERE n.house_id=c.id) AS has_sheet,
  s.law AS imported_law,s.source_row AS imported_row,
  s.source_spreadsheet_id AS imported_spreadsheet
 INTO v
 FROM public.house_catalog c
 LEFT JOIN public.spy_noble_house_stats s ON s.house_id=c.id
 WHERE c.id=p_house AND c.public_reviewed IS TRUE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Casa nobre desconhecida ou não homologada'; END IF;
 RETURN jsonb_build_object(
  'id',v.id,'name',v.name,'region',v.region,'hasOperationalSheet',v.has_sheet,
  'importedLaw',v.imported_law,'importedSourceRow',v.imported_row,
  'source',CASE WHEN v.has_sheet THEN 'operational_sheet'
   WHEN v.imported_law IS NOT NULL THEN 'imported_spreadsheet'
   ELSE 'missing_sheet_and_spreadsheet' END);
END $fn$;
REVOKE ALL ON FUNCTION public.spy_narrator_noble_defense_source(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spy_narrator_noble_defense_source(text) TO authenticated;
COMMIT;
SELECT count(*) AS imported_houses,count(DISTINCT region_id) AS regions,
 min(law) AS min_law,max(law) AS max_law
 FROM public.spy_noble_house_stats;
