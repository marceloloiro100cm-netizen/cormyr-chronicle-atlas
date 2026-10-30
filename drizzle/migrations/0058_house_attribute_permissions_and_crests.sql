-- Casa Nobre / lote 2: separar edição de ficha de point-buy de atributos.
BEGIN;
ALTER TABLE public.house_memberships
 ADD COLUMN IF NOT EXISTS can_edit_attributes boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN public.house_memberships.can_edit_attributes IS
 'Permissão explícita do Narrador para distribuir pontos-base via point buy, apenas em rascunhos. Não autoriza editar recursos de casas ativas.';
-- Private crest files are accessible only to the house or the Narrator.
-- They are not published as public URLs and do not expose other campaign images.
DROP POLICY IF EXISTS campaign_house_crests_read ON storage.objects;
CREATE POLICY campaign_house_crests_read ON storage.objects
 FOR SELECT TO authenticated USING (
  bucket_id='campaign-images'
  AND name LIKE 'house-crests/%'
  AND EXISTS (
   SELECT 1 FROM public.noble_house_sheets s
   WHERE s.state #>> '{identity,crestPath}'=objects.name
   AND objects.name LIKE ('house-crests/'||s.house_id||'/%')
   AND (public.is_campaign_admin() OR public.in_campaign_house(s.house_id,false))
  )
 );
COMMIT;
