-- A Folha Sem Selo: o leitor pode marcar uma edição como "não lida" (o aviso volta).
-- Remove apenas o recibo do próprio usuário; nunca mexe no de outro leitor nem na edição.
-- Aplicar depois da 0111. O commit GitHub não aplica SQL.
BEGIN;

CREATE OR REPLACE FUNCTION public.mark_campaign_newspaper_unread(p_newspaper uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Sessão não autorizada.'; END IF;
  IF NOT (public.can_read_campaign_newspaper_player() OR public.can_edit_campaign_newspaper()) THEN
    RAISE EXCEPTION 'Jornal indisponível.';
  END IF;
  DELETE FROM public.campaign_newspaper_reads
   WHERE newspaper_id = p_newspaper AND user_id = auth.uid();
END;
$$;
REVOKE ALL ON FUNCTION public.mark_campaign_newspaper_unread(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_campaign_newspaper_unread(uuid) TO authenticated;

COMMIT;
