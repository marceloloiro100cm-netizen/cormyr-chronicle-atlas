-- A Folha Sem Selo: (1) as gravuras originais do site entram no acervo editável (o Editor-Chefe
-- pode manter ou excluir cada uma) e (2) publicação agendada para uma data do Reino.
-- Aplicar depois da 0121. O commit GitHub não aplica SQL.
BEGIN;

-- ---- Acervo: gravura enviada (image_path) OU original do site (public_src) ----
ALTER TABLE public.campaign_newspaper_engravings ALTER COLUMN image_path DROP NOT NULL;
ALTER TABLE public.campaign_newspaper_engravings ADD COLUMN IF NOT EXISTS public_src text;
ALTER TABLE public.campaign_newspaper_engravings DROP CONSTRAINT IF EXISTS newspaper_engravings_source_check;
ALTER TABLE public.campaign_newspaper_engravings ADD CONSTRAINT newspaper_engravings_source_check
  CHECK ((image_path IS NOT NULL) <> (public_src IS NOT NULL));
ALTER TABLE public.campaign_newspaper_engravings DROP CONSTRAINT IF EXISTS newspaper_engravings_public_src_check;
ALTER TABLE public.campaign_newspaper_engravings ADD CONSTRAINT newspaper_engravings_public_src_check
  CHECK (public_src IS NULL OR (public_src ~ '^/newspaper/gravuras/[A-Za-z0-9_.-]+$' AND length(public_src) <= 200));
CREATE UNIQUE INDEX IF NOT EXISTS newspaper_engravings_public_src_key
  ON public.campaign_newspaper_engravings (public_src) WHERE public_src IS NOT NULL;

INSERT INTO public.campaign_newspaper_engravings (name, public_src, in_collection, created_at) VALUES
  ('Castelo de Cormyr', '/newspaper/gravuras/castelo_cormyr.jpg', true, '2000-01-01 00:00:01+00'),
  ('Conselho Real',     '/newspaper/gravuras/conselho_real.jpg',   true, '2000-01-01 00:00:02+00'),
  ('Mercado de Suzail', '/newspaper/gravuras/mercado_suzail.jpg',  true, '2000-01-01 00:00:03+00')
ON CONFLICT DO NOTHING;

-- ---- Publicação agendada ----
ALTER TABLE public.campaign_newspapers ADD COLUMN IF NOT EXISTS publish_on text;
ALTER TABLE public.campaign_newspapers DROP CONSTRAINT IF EXISTS campaign_newspapers_publish_on_check;
ALTER TABLE public.campaign_newspapers ADD CONSTRAINT campaign_newspapers_publish_on_check
  CHECK (publish_on IS NULL OR publish_on ~ '^([0-9]{4}-[0-9]{2}-[0-9]{2}|[0-9]{4}-F-[a-z-]+)$');

-- Posição da data no ano de Harptos (mesma conta de dateOrdinal() em src/lib/newspaper/editing.ts).
CREATE OR REPLACE FUNCTION public.newspaper_date_ordinal(p text)
RETURNS bigint LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN p ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
      substr(p,1,4)::bigint*100000 + (substr(p,6,2)::int-1)*1000 + substr(p,9,2)::int*2
    WHEN p ~ '^[0-9]{4}-F-[a-z-]+$' THEN
      substr(p,1,4)::bigint*100000
      + CASE substr(p,8) WHEN 'midwinter' THEN 0 WHEN 'greengrass' THEN 3000 WHEN 'midsummer' THEN 6000
          WHEN 'shieldmeet' THEN 6000 WHEN 'highharvestide' THEN 8000 WHEN 'feast-moon' THEN 10000 END
      + CASE WHEN substr(p,8)='shieldmeet' THEN 62 ELSE 61 END
  END
$$;

-- Publica os rascunhos agendados cuja data do Reino já chegou. Idempotente; qualquer conta
-- autenticada pode chamar porque só o relógio do HUB decide, nunca o chamador.
CREATE OR REPLACE FUNCTION public.publish_due_campaign_newspapers()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE today text; changed integer;
BEGIN
  IF auth.uid() IS NULL THEN RETURN 0; END IF;
  SELECT CASE WHEN c.festival IS NOT NULL
           THEN lpad(c.year::text,4,'0')||'-F-'||c.festival
           ELSE lpad(c.year::text,4,'0')||'-'||lpad((c.month+1)::text,2,'0')||'-'||lpad(c.day::text,2,'0') END
    INTO today FROM public.campaign_calendar c WHERE c.id = true;
  IF today IS NULL OR public.newspaper_date_ordinal(today) IS NULL THEN RETURN 0; END IF;
  UPDATE public.campaign_newspapers
     SET state = 'published', publish_on = NULL
   WHERE state = 'draft' AND publish_on IS NOT NULL
     AND public.newspaper_date_ordinal(publish_on) <= public.newspaper_date_ordinal(today)
     AND (jsonb_array_length(blocks) > 0 OR pdf_path IS NOT NULL);
  GET DIAGNOSTICS changed = ROW_COUNT;
  RETURN changed;
END $$;
REVOKE ALL ON FUNCTION public.publish_due_campaign_newspapers() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.publish_due_campaign_newspapers() TO authenticated;
REVOKE ALL ON FUNCTION public.newspaper_date_ordinal(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.newspaper_date_ordinal(text) TO authenticated;

COMMIT;
