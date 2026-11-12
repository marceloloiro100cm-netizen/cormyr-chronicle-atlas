-- A Folha Sem Selo: corpo de funcionários da Redação (foto, nome, especialidade e texto livres).
-- Só o Editor-Chefe e o Narrador leem e escrevem. A assinatura das matérias usa estes registros.
-- Aplicar depois de 0111, 0116 e 0117. O commit GitHub não aplica SQL.
BEGIN;

CREATE TABLE IF NOT EXISTS public.campaign_newspaper_staff (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  specialty text NOT NULL DEFAULT '' CHECK (length(specialty) <= 120),
  bio text NOT NULL DEFAULT '' CHECK (length(bio) <= 3000),
  photo_path text CHECK (photo_path IS NULL OR length(photo_path) <= 300),
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.campaign_newspaper_staff ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_newspaper_staff FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.campaign_newspaper_staff TO authenticated;
GRANT ALL ON public.campaign_newspaper_staff TO service_role;
DROP POLICY IF EXISTS newspaper_staff_all ON public.campaign_newspaper_staff;
CREATE POLICY newspaper_staff_all ON public.campaign_newspaper_staff
  FOR ALL TO authenticated
  USING (public.can_edit_campaign_newspaper())
  WITH CHECK (public.can_edit_campaign_newspaper());

INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
 VALUES ('campaign-newspaper-staff','campaign-newspaper-staff',false,5242880,
 ARRAY['image/png','image/jpeg','image/webp'])
 ON CONFLICT(id) DO NOTHING;
DROP POLICY IF EXISTS newspaper_staff_photo_read ON storage.objects;
CREATE POLICY newspaper_staff_photo_read ON storage.objects
 FOR SELECT TO authenticated
 USING (bucket_id='campaign-newspaper-staff' AND public.can_edit_campaign_newspaper());
DROP POLICY IF EXISTS newspaper_staff_photo_upload ON storage.objects;
CREATE POLICY newspaper_staff_photo_upload ON storage.objects
 FOR INSERT TO authenticated
 WITH CHECK (bucket_id='campaign-newspaper-staff' AND public.can_edit_campaign_newspaper()
   AND name ~ '^[0-9a-f-]{36}\.(png|jpg|webp)$');
DROP POLICY IF EXISTS newspaper_staff_photo_delete ON storage.objects;
CREATE POLICY newspaper_staff_photo_delete ON storage.objects
 FOR DELETE TO authenticated
 USING (bucket_id='campaign-newspaper-staff' AND public.can_edit_campaign_newspaper());

COMMIT;
