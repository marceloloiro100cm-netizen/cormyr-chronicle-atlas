-- A Folha Sem Selo: "Gravuras do Reino" enviadas pelo Editor-Chefe (com marca de acervo)
-- e leitura do calendário público para o Editor-Chefe.
-- Aplicar depois de 0111, 0116, 0117, 0118 e 0119. O commit GitHub não aplica SQL.
BEGIN;

CREATE TABLE IF NOT EXISTS public.campaign_newspaper_engravings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 80),
  image_path text NOT NULL CHECK (length(image_path) <= 300),
  in_collection boolean NOT NULL DEFAULT true,
  created_by uuid DEFAULT auth.uid() REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.campaign_newspaper_engravings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_newspaper_engravings FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_newspaper_engravings TO authenticated;
GRANT ALL ON public.campaign_newspaper_engravings TO service_role;
DROP POLICY IF EXISTS newspaper_engravings_all ON public.campaign_newspaper_engravings;
CREATE POLICY newspaper_engravings_all ON public.campaign_newspaper_engravings
  FOR ALL TO authenticated
  USING (public.can_edit_campaign_newspaper())
  WITH CHECK (public.can_edit_campaign_newspaper());

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES ('campaign-newspaper-engravings','campaign-newspaper-engravings',false,5242880,
 ARRAY['image/png','image/jpeg','image/webp'])
 ON CONFLICT(id) DO NOTHING;
DROP POLICY IF EXISTS newspaper_engravings_read ON storage.objects;
CREATE POLICY newspaper_engravings_read ON storage.objects
 FOR SELECT TO authenticated
 USING (bucket_id='campaign-newspaper-engravings' AND public.can_edit_campaign_newspaper());
DROP POLICY IF EXISTS newspaper_engravings_upload ON storage.objects;
CREATE POLICY newspaper_engravings_upload ON storage.objects
 FOR INSERT TO authenticated
 WITH CHECK (bucket_id='campaign-newspaper-engravings' AND public.can_edit_campaign_newspaper()
   AND name ~ '^[0-9a-f-]{36}\.(png|jpg|webp)$');
DROP POLICY IF EXISTS newspaper_engravings_delete ON storage.objects;
CREATE POLICY newspaper_engravings_delete ON storage.objects
 FOR DELETE TO authenticated
 USING (bucket_id='campaign-newspaper-engravings' AND public.can_edit_campaign_newspaper());

-- Calendário público para o Editor-Chefe: só eventos que o Narrador já publicou.
CREATE OR REPLACE FUNCTION public.get_newspaper_calendar_events(p_year integer,p_month integer)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.can_edit_campaign_newspaper()
 THEN RAISE EXCEPTION 'Acesso não autorizado'; END IF;
 IF p_year NOT BETWEEN 1 AND 9999 OR p_month NOT BETWEEN 0 AND 11 THEN RAISE EXCEPTION 'Mês inválido'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id','schedule:'||id::text,'date',published_date,
   'title',published_title,'description',coalesce(published_description,''),
   'kind','kingdom') ORDER BY published_date,id),'[]'::jsonb)
 INTO result
 FROM campaign_schedule_events
 WHERE published_date IS NOT NULL AND published_title IS NOT NULL
   AND left(published_date,4)=lpad(p_year::text,4,'0')
   AND (substring(published_date,6,2)=lpad((p_month+1)::text,2,'0')
      OR (substring(published_date,6,2)='F-' AND (
       (p_month=0 AND published_date LIKE '%midwinter')
       OR (p_month=3 AND published_date LIKE '%greengrass')
       OR (p_month=6 AND (published_date LIKE '%midsummer' OR published_date LIKE '%shieldmeet'))
       OR (p_month=8 AND published_date LIKE '%highharvestide')
       OR (p_month=10 AND published_date LIKE '%feast-moon'))));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_newspaper_calendar_events(integer,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_newspaper_calendar_events(integer,integer) TO authenticated;

COMMIT;
