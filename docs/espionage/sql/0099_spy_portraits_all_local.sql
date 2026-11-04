-- Idempotent convergence for the five formerly Drive-backed portraits.
-- Does not create agents, change assignments, or alter shared-house rules.
-- The server also resolves the official URLs at read time if this is pending.
BEGIN;
UPDATE public.spy_portrait_catalog
SET image_url = CASE id
    WHEN 'espiao-tillet' THEN 'https://cormyr-chronicle-atlas.lovable.app/spy-portraits/tillet.jpg'
    WHEN 'espiao-cortesa' THEN 'https://cormyr-chronicle-atlas.lovable.app/spy-portraits/cortesa.jpg'
    WHEN 'espiao-vigia' THEN 'https://cormyr-chronicle-atlas.lovable.app/spy-portraits/vigia.jpg'
    WHEN 'espiao-guarda' THEN 'https://cormyr-chronicle-atlas.lovable.app/spy-portraits/guarda.jpg'
    WHEN 'espiao-ladrao' THEN 'https://cormyr-chronicle-atlas.lovable.app/spy-portraits/ladrao.jpg'
  ELSE image_url
END
WHERE id IN ('espiao-tillet', 'espiao-cortesa', 'espiao-vigia', 'espiao-guarda', 'espiao-ladrao');
COMMIT;
