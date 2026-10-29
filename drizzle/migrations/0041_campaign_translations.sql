CREATE TABLE IF NOT EXISTS public.campaign_translations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type text NOT NULL CHECK (entity_type IN ('house', 'region', 'event', 'adventure', 'catalog_item', 'record', 'festival', 'constitution')),
  entity_id text NOT NULL,
  field_name text NOT NULL,
  locale text NOT NULL CHECK (locale IN ('pt', 'en', 'es', 'de')),
  translated_text text NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entity_type, entity_id, field_name, locale)
);

CREATE INDEX IF NOT EXISTS idx_campaign_translations_lookup
  ON public.campaign_translations (locale, entity_type, entity_id);

ALTER TABLE public.campaign_translations ENABLE ROW LEVEL SECURITY;

-- Leitura liberada para todos (público e autenticados) para traduzir tanto o Atlas público quanto a Ficha
CREATE POLICY "campaign_translations_read_all"
  ON public.campaign_translations
  FOR SELECT
  USING (true);

-- Escrita permitida apenas ao Administrador/Narrador da campanha
CREATE POLICY "campaign_translations_admin_write"
  ON public.campaign_translations
  FOR ALL
  USING (public.is_campaign_admin())
  WITH CHECK (public.is_campaign_admin());
