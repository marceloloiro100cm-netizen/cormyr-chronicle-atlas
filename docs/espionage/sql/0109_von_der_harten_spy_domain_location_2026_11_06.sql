-- 0109 · Reconciliação pontual do domínio recrutador da Casa Von der Harten.
-- Validação de produção em 2026-11-06: rede ativa e 3 vagas, retrato Contador livre,
-- mas localização do domínio dom-von-der-harten-lex-castle ausente em spy_locations.
-- Causa: spy_recruit_agent falha com 'Domínio de recrutamento sem localização homologada'.
-- Este patch nunca cria espiões, reserva imagens, move agentes ou altera credenciais.
-- Idempotente: aplicado na produção em 2026-11-06.
BEGIN;
WITH verified AS (
 SELECT d->>'id' AS ref_id,d->>'name' AS name
 FROM public.noble_house_sheets n
 JOIN public.house_catalog c ON c.id=n.house_id
 CROSS JOIN LATERAL jsonb_array_elements(
  CASE WHEN jsonb_typeof(n.state->'domains')='array'
    THEN n.state->'domains' ELSE '[]'::jsonb END
 ) d
 WHERE n.house_id='von-der-harten'
   AND n.state->>'phase'='active'
   AND c.public_reviewed IS TRUE
   AND lower(c.region)='crownlands'
   AND d->>'id'='dom-von-der-harten-lex-castle'
   AND EXISTS (
    SELECT 1 FROM jsonb_array_elements(n.state->'holdings') h
    WHERE h->>'id'='von-der-harten-spy-network'
      AND h->>'itemId'='pros-spy-network'
      AND h->>'status'='active'
      AND h->>'domainId'=d->>'id'
   )
)
INSERT INTO public.spy_locations
 (kind,ref_id,region_id,name,approved,visibility,source,version)
SELECT 'domain',ref_id,'crownlands',name,true,'narrator',
 'von-der-harten-reconciliation-2026-11-06',1
FROM verified
ON CONFLICT (kind,ref_id) DO NOTHING;
COMMIT;

-- Conferência SOMENTE leitura, sem consultar dados de agentes de outras Casas:
-- SELECT ref_id,region_id,approved,visibility FROM public.spy_locations
--  WHERE kind='domain' AND ref_id='dom-von-der-harten-lex-castle';
