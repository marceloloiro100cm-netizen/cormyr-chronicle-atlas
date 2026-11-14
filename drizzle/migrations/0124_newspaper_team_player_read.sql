-- A Folha Sem Selo: "Conheça Nossa Equipe". Jogadores passam a LER (somente leitura) o corpo
-- de funcionários da Redação e as fotos. Escrita continua exclusiva do Editor-Chefe e do Narrador.
-- Aplicar depois da 0118 e da 0111. O commit GitHub não aplica SQL.
BEGIN;

DROP POLICY IF EXISTS newspaper_staff_player_read ON public.campaign_newspaper_staff;
CREATE POLICY newspaper_staff_player_read ON public.campaign_newspaper_staff
  FOR SELECT TO authenticated
  USING (public.can_read_campaign_newspaper_player());

DROP POLICY IF EXISTS newspaper_staff_photo_player_read ON storage.objects;
CREATE POLICY newspaper_staff_photo_player_read ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id='campaign-newspaper-staff' AND public.can_read_campaign_newspaper_player());

COMMIT;
