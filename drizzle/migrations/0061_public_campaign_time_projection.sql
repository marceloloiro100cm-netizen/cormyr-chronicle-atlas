-- Lote 5 · publicação mínima e deliberada do relógio ao Atlas anônimo.
-- Não expõe dados da campanha, turnos, jogadores, Casas, missivas ou histórico.
BEGIN;
CREATE OR REPLACE FUNCTION public.get_public_campaign_time()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT jsonb_build_object(
  'year',c.year,
  'month',c.month,
  'day',c.day,
  'festival',c.festival,
  'version',c.version
 ) FROM public.campaign_calendar c WHERE c.id=true
$$;
REVOKE ALL ON FUNCTION public.get_public_campaign_time() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_public_campaign_time() TO anon,authenticated;
-- Não se concede SELECT de campaign_calendar a anon; o RPC é a única projeção pública.
COMMIT;
