-- Defesa em profundidade: revoga concessões diretas de anon na tabela.
-- A data mínima segue pública somente pelo RPC get_public_campaign_time(),
-- SECURITY DEFINER (migration 0061), com cinco campos whitelisted.
-- Não altera registros, contas, senhas, ownership, nem grants authenticated.
BEGIN;
REVOKE ALL PRIVILEGES ON TABLE public.campaign_calendar FROM anon;
REVOKE ALL PRIVILEGES ON TABLE public.campaign_calendar FROM PUBLIC;
-- RPC: explicitamente mantém execução de leitura mínima ao visitante.
GRANT EXECUTE ON FUNCTION public.get_public_campaign_time() TO anon, authenticated;
COMMIT;
