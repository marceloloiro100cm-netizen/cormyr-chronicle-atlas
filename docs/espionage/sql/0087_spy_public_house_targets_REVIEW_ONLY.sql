-- CCA-ESP-0087 · REVIEW ONLY · IDs/names/regions of already-reviewed Houses.
-- DO NOT apply without production backup, migration reconciliation and narrator approval.
-- Filters only public_reviewed catalogue rows. This RPC must never reveal
-- sheet.state, Law, holdings, family members or narrator-only data.
BEGIN;
CREATE OR REPLACE FUNCTION public.spy_public_house_targets()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $body$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
 THEN RAISE EXCEPTION 'Cadastro regional não autorizado'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'id',c.id,'name',c.name,
  'region',COALESCE(h.region,c.region)
 ) ORDER BY c.name,c.id),'[]'::jsonb)
 INTO result
 FROM public.house_catalog c
 LEFT JOIN public.campaign_houses h ON h.id=c.id AND h.active
 WHERE c.public_reviewed IS TRUE
  AND c.classification IN ('noble','major','royal')
  AND c.id IS NOT NULL AND c.name IS NOT NULL AND c.region IS NOT NULL;
 RETURN result;
END $body$;
REVOKE ALL ON FUNCTION public.spy_public_house_targets() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spy_public_house_targets() TO authenticated;
COMMIT;
