-- Lote 19: executar SOMENTE na fixture restaurada e descartável do CI.
-- Contrato das mesmas consultas agregadas usadas na auditoria read-only.
-- Não lê nomes, IDs, e-mails, conteúdo de missivas ou fichas individuais.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT count(*)::text AS total FROM public.campaign_houses;
SELECT count(*)::text AS total FROM public.noble_house_sheets;
SELECT count(*)::text AS total FROM public.house_memberships;
SELECT count(*)::text AS total FROM public.campaign_characters;
SELECT count(*)::text AS total FROM public.campaign_letters;
SELECT count(*)::text AS total FROM public.letter_replies;
SELECT count(*)::text AS total FROM public.noble_house_ledger;
SELECT count(*)::text AS total FROM public.campaign_time_operations;
SELECT count(*)::text AS total FROM public.campaign_temporal_deliveries;
-- Unidades militares e construções/posses ficam no estado JSON da Casa.
SELECT coalesce(sum(CASE WHEN jsonb_typeof(state->'units')='array'
 THEN jsonb_array_length(state->'units') ELSE 0 END),0)::text AS total
 FROM public.noble_house_sheets;
SELECT coalesce(sum(CASE WHEN jsonb_typeof(state->'holdings')='array'
 THEN jsonb_array_length(state->'holdings') ELSE 0 END),0)::text AS total
 FROM public.noble_house_sheets;
SELECT public.get_public_campaign_time();
COMMIT;
