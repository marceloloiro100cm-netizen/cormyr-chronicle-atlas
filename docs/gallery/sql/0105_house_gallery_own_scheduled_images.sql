-- 0105 · Galeria: anexos de missivas entregues e de envios PROGRAMADOS
-- da própria Casa (incluindo respostas como a da Silversky).
-- Nunca mostrar ao destinatário imagens antes da entrega.
-- Preserva auth, RLS lógico, segregação por Casa e privacidade do conteúdo.
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
  SELECT l.id,l.subject,l.created_at,l.content,l.publication_state,l.origin_house_id,
   l.recipient_house_id,
   CASE WHEN l.origin_house_id=p_house
     OR (l.origin_house_id IS NULL AND EXISTS (
       SELECT 1 FROM public.campaign_players p
       WHERE p.id=l.sender_player_id AND p.roster_house_id=p_house))
    THEN 'sent' ELSE 'received' END AS direction
  FROM public.campaign_letters l
  WHERE l.deleted_at IS NULL
   AND (
     l.publication_state='delivered'
     OR (l.publication_state='scheduled'
       -- Only the sending House (and its author or Narrator) can preview
       -- a scheduled letter; the recipient must wait for delivery.
       AND (l.sender_user_id=auth.uid() OR public.is_campaign_admin())
       AND (l.origin_house_id=p_house OR
         (l.origin_house_id IS NULL AND EXISTS(
           SELECT 1 FROM public.campaign_players author_player
           WHERE author_player.id=l.sender_player_id
             AND author_player.roster_house_id=p_house)))
     )
   )
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
   l.publication_state AS publication_state,
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
   r.publication_state AS publication_state,
   (img.parts)[1] AS path,(img.parts)[2] AS caption
  FROM visible_letters l
  JOIN public.letter_replies r ON r.letter_id=l.id
    AND r.deleted_at IS NULL
    AND (
      r.publication_state='delivered'
      OR (r.publication_state='scheduled'
        AND r.house_id=p_house
        -- Scheduled replies are visible only to their author or Narrator
        -- while viewing the author's own House.
        AND (r.author_user_id=auth.uid() OR public.is_campaign_admin())
        AND EXISTS (
          SELECT 1 FROM public.campaign_players author_player
          WHERE author_player.user_id=r.author_user_id
            AND author_player.active AND NOT author_player.require_password_change
            AND (author_player.roster_house_id=p_house
              OR EXISTS (
                SELECT 1 FROM public.house_memberships hm
                WHERE hm.player_id=author_player.id AND hm.house_id=p_house))
        ))
    )
    AND public.can_read_reply_as(r,auth.uid())
  CROSS JOIN LATERAL regexp_matches(r.content,
   '\[cormyr-image:([A-Za-z0-9_./-]+)\|([^]\n]*)\]','g') AS img(parts)
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',g.source_kind||':'||g.source_id||':'||g.path,
  'path',g.path,'caption',g.caption,'subject',g.subject,
  'sourceKind',g.source_kind,'direction',g.direction,
  'publicationState',g.publication_state,
  'occurredAt',g.occurred_at
 ) ORDER BY g.occurred_at DESC,g.source_id,g.path),'[]'::jsonb)
 INTO v_images
 FROM (SELECT * FROM found_images ORDER BY occurred_at DESC,source_id,path LIMIT 500) g;
 RETURN coalesce(v_images,'[]'::jsonb);
END $body$;

REVOKE ALL ON FUNCTION public.house_gallery_mail_images(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.house_gallery_mail_images(text) TO authenticated;
COMMIT;
