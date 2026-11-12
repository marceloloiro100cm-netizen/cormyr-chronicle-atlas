-- A Folha Sem Selo: configurações do jornal (nome, subtítulo, modelo e fonte) independentes de edição.
-- Valem como padrão para as próximas edições e para o título do site da Redação.
-- Aplicar depois de 0111 e 0116. O commit GitHub não aplica SQL.
BEGIN;

CREATE TABLE IF NOT EXISTS public.campaign_newspaper_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  title text NOT NULL DEFAULT 'A Folha Sem Selo' CHECK (length(btrim(title)) BETWEEN 1 AND 180),
  subtitle text NOT NULL DEFAULT 'O jornal independente de Cormyr' CHECK (length(subtitle) <= 240),
  template text NOT NULL DEFAULT 'classico' CHECK (template IN ('classico','guerra','gazeta')),
  font_style text NOT NULL DEFAULT 'classico' CHECK (font_style IN ('classico','editorial','condensado')),
  updated_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.campaign_newspaper_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_newspaper_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.campaign_newspaper_settings TO authenticated;
GRANT ALL ON public.campaign_newspaper_settings TO service_role;
DROP POLICY IF EXISTS newspaper_settings_all ON public.campaign_newspaper_settings;
CREATE POLICY newspaper_settings_all ON public.campaign_newspaper_settings
  FOR ALL TO authenticated
  USING (public.can_edit_campaign_newspaper())
  WITH CHECK (public.can_edit_campaign_newspaper());

COMMIT;
