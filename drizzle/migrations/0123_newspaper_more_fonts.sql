-- A Folha Sem Selo: duas novas tipografias em Configurações ('gotica' e 'romana').
-- Só amplia a lista permitida; nada existente muda. Aplicar depois da 0122. O commit GitHub não aplica SQL.
BEGIN;

ALTER TABLE public.campaign_newspapers DROP CONSTRAINT IF EXISTS campaign_newspapers_font_style_check;
ALTER TABLE public.campaign_newspapers ADD CONSTRAINT campaign_newspapers_font_style_check
  CHECK (font_style IN ('classico','editorial','condensado','gotica','romana'));

ALTER TABLE public.campaign_newspaper_settings DROP CONSTRAINT IF EXISTS campaign_newspaper_settings_font_style_check;
ALTER TABLE public.campaign_newspaper_settings ADD CONSTRAINT campaign_newspaper_settings_font_style_check
  CHECK (font_style IN ('classico','editorial','condensado','gotica','romana'));

COMMIT;
