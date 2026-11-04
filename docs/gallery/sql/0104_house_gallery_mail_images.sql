-- Galeria privada por Casa: apenas anexos de missivas entregues
-- explicitamente ligadas à Casa selecionada. Não devolve texto de missivas.
-- Acesso confirmado no servidor e RLS lógico de cartas/respostas.
BEGIN;
CREATE OR REPLACE FUNCTION public.house_gallery_mail_images(p_house text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $body$
DECLARE v_images jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
   OR NOT (public.is_campaign_admin() OR public.in_campaign_house(p_house,false))
 THEN RAISE EXCEPTION 'Galeria não autorizada para esta Casa'; END IF;

 WITH visible_letters AS (
  SELECT l.id,l.subject,l.created_at,l.content,l.origin_house_id,
   l.recipient_house_id,
   CASE WHEN l.origin_house_id=p_house
     OR (l.origin_house_id IS NULL AND EXISTS (
       SELECT 1 FROM public.campaign_players p
       WHERE p.id=l.sender_player_id AND p.roster_house_id=p_house))
    THEN 'sent' ELSE 'received' END AS direction
  FROM public.campaign_letters l
  WHERE l.deleted_at IS NULL AND l.publication_state='delivered'
   AND public.can_read_letter_as(l,auth.uid())
   AND (
    l.origin_house_id=p_house OR l.recipient_house_id=p_house
    OR (l.origin_house_id IS NULL AND EXISTS(
      SELECT 1 FROM public.campaign_players p
      WHERE p.id=l.sender_player_id AND p.roster_house_id=p_house))
    OR (l.recipient_house_id IS NULL AND EXISTS(
      SELECT 1 FROM public.campaign_players p
      WHERE p.id=l.recipient_player_id AND p.roster_house_id=p_house))
   )
 ),
 found_images AS (
  SELECT l.id::text AS source_id,'letter'::text AS source_kind,
   l.subject AS subject,l.created_at AS occurred_at,l.direction,
   (img.parts)[1] AS path,(img.parts)[2] AS caption
  FROM visible_letters l
  CROSS JOIN LATERAL regexp_matches(l.content,
   '\[cormyr-image:([A-Za-z0-9_./-]+)\|([^]\n]*)\]','g') AS img(parts)
  UNION ALL
  SELECT r.id::text AS source_id,'reply'::text AS source_kind,
   l.subject AS subject,r.created_at AS occurred_at,
   CASE WHEN EXISTS(
    SELECT 1 FROM public.campaign_players p
    WHERE p.user_id=r.author_user_id AND p.roster_house_id=p_house
   ) THEN 'sent' ELSE 'received' END AS direction,
   (img.parts)[1] AS path,(img.parts)[2] AS caption
  FROM visible_letters l
  JOIN public.letter_replies r ON r.letter_id=l.id
    AND r.deleted_at IS NULL AND r.publication_state='delivered'
    AND public.can_read_reply_as(r,auth.uid())
  CROSS JOIN LATERAL regexp_matches(r.content,
   '\[cormyr-image:([A-Za-z0-9_./-]+)\|([^]\n]*)\]','g') AS img(parts)
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',g.source_kind||':'||g.source_id||':'||g.path,
  'path',g.path,'caption',g.caption,'subject',g.subject,
  'sourceKind',g.source_kind,'direction',g.direction,
  'occurredAt',g.occurred_at
 ) ORDER BY g.occurred_at DESC,g.source_id,g.path),'[]'::jsonb)
 INTO v_images
 FROM (SELECT * FROM found_images ORDER BY occurred_at DESC,source_id,path LIMIT 500) g;
 RETURN coalesce(v_images,'[]'::jsonb);
END $body$;

REVOKE ALL ON FUNCTION public.house_gallery_mail_images(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.house_gallery_mail_images(text) TO authenticated;
COMMIT;
