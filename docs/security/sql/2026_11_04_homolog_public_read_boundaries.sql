-- Homologação: minimização de dados públicos, sem alterar linhas de campanha.
-- Aplicar SOMENTE no banco isolado de homologação antes de promover à produção.
-- A página pública usa id/nome/região/classificação/galeria/narrativa;
-- archive_data é necessário apenas a componentes autenticados de vassalos.
BEGIN;
SET LOCAL lock_timeout='8s';
REVOKE SELECT (archive_data) ON TABLE public.house_catalog FROM anon;

DROP POLICY IF EXISTS campaign_translations_read_all ON public.campaign_translations;
DROP POLICY IF EXISTS campaign_translations_public_read ON public.campaign_translations;
CREATE POLICY campaign_translations_public_read
 ON public.campaign_translations
 FOR SELECT TO anon, authenticated
 USING (
  entity_type IN ('region','house','constitution')
  AND (
    entity_type <> 'house'
    OR EXISTS (
      SELECT 1 FROM public.house_catalog c
      WHERE c.id = campaign_translations.entity_id
        AND c.public_reviewed IS TRUE
    )
  )
 );
-- A política existente campaign_translations_admin_write continua permitindo
-- leitura e edição administrativa por is_campaign_admin(); service_role não muda.
COMMIT;
