-- Mediator's inbox is a filtered view of the same house-to-house record, never a duplicate.
BEGIN;
CREATE OR REPLACE FUNCTION public.mail_page(p_filters jsonb DEFAULT '{}'::jsonb, p_page integer DEFAULT 0, p_size integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE result jsonb;
BEGIN
 IF NOT public.campaign_access_active() THEN RAISE EXCEPTION 'Jogador não autorizado'; END IF;
 IF p_page IS NULL OR p_size IS NULL OR p_page<0 OR p_size<1 OR p_size>50 THEN RAISE EXCEPTION 'Página inválida'; END IF;
 WITH visible AS (
 SELECT l.*, latest.author_user_id AS last_author_user_id FROM campaign_letters l
 LEFT JOIN LATERAL (
   SELECT entry.author_user_id FROM (
     SELECT l.sender_user_id AS author_user_id,coalesce(l.delivered_at,l.created_at) AS occurred_at,0 AS sort_rank,l.id AS turn_id
     WHERE l.publication_state='delivered'
     UNION ALL
     SELECT r.author_user_id,coalesce(r.delivered_at,r.created_at),1,r.id
     FROM letter_replies r WHERE r.letter_id=l.id AND r.publication_state='delivered'
   ) entry ORDER BY entry.occurred_at DESC,entry.sort_rank DESC,entry.turn_id DESC LIMIT 1
 ) latest ON TRUE
 WHERE CASE WHEN p_filters->>'box'='excluidas' THEN l.deleted_at IS NOT NULL ELSE l.deleted_at IS NULL END
 AND (coalesce(p_filters->>'box','') NOT IN ('recebidas','enviadas') OR (p_filters->>'box'='recebidas' AND l.sender_user_id<>auth.uid()) OR (p_filters->>'box'='enviadas' AND l.sender_user_id=auth.uid()))
 AND (coalesce(p_filters->>'box','') NOT IN ('rascunhos','programadas','historico') OR
 l.publication_state=CASE p_filters->>'box' WHEN 'rascunhos' THEN 'draft' WHEN 'programadas' THEN 'scheduled' ELSE 'delivered' END
 OR EXISTS(SELECT 1 FROM letter_replies r WHERE r.letter_id=l.id AND r.publication_state=CASE p_filters->>'box' WHEN 'rascunhos' THEN 'draft' WHEN 'programadas' THEN 'scheduled' ELSE 'delivered' END))
 AND (coalesce(p_filters->>'number','')='' OR coalesce(l.delivery_week,l.letter_number)::text=p_filters->>'number'
   OR EXISTS(SELECT 1 FROM letter_replies r WHERE r.letter_id=l.id
      AND (coalesce(p_filters->>'box','')<>'historico' OR r.publication_state='delivered')
      AND coalesce(r.delivery_week,r.creation_week)::text=p_filters->>'number'))
 AND (coalesce(p_filters->>'kind','')='' OR l.letter_kind=p_filters->>'kind')
 AND (coalesce(p_filters->>'origin','')='' OR (p_filters->>'origin'='none' AND l.origin_house_id IS NULL) OR l.origin_house_id=p_filters->>'origin')
 AND (coalesce(p_filters->>'house','')='' OR l.recipient_house_id=p_filters->>'house'
   OR l.origin_house_id=p_filters->>'house'
   OR EXISTS (
     SELECT 1 FROM campaign_players p
     WHERE (p.id=l.sender_player_id OR p.id=l.recipient_player_id OR p.user_id=l.sender_user_id)
       AND (p.roster_house_id=p_filters->>'house'
         OR EXISTS(SELECT 1 FROM house_memberships m WHERE m.player_id=p.id AND m.house_id=p_filters->>'house'))
   ))
 AND (coalesce(p_filters->>'court','')='' OR (p_filters->>'court'='none' AND l.court_member_id IS NULL) OR l.origin_house_id||':'||l.court_member_id=p_filters->>'court')
 AND (coalesce(p_filters->>'unit','')='' OR (p_filters->>'unit'='none' AND l.military_unit_id IS NULL) OR l.origin_house_id||':'||l.military_unit_id=p_filters->>'unit')
 AND (
   coalesce(p_filters->>'answered','')='' OR
   CASE p_filters->>'answered'
     WHEN 'yes' THEN EXISTS(SELECT 1 FROM letter_replies r WHERE r.letter_id=l.id AND r.publication_state='delivered' AND r.author_user_id<>l.sender_user_id)
     WHEN 'no' THEN NOT EXISTS(SELECT 1 FROM letter_replies r WHERE r.letter_id=l.id AND r.publication_state='delivered' AND r.author_user_id<>l.sender_user_id)
     WHEN 'no-delivered' THEN public.is_campaign_admin() AND NOT EXISTS(SELECT 1 FROM letter_replies r WHERE r.letter_id=l.id AND r.publication_state='delivered')
     WHEN 'awaiting-house' THEN public.is_campaign_admin() AND latest.author_user_id=auth.uid()
     WHEN 'awaiting-narrator' THEN public.is_campaign_admin() AND latest.author_user_id<>auth.uid()
       AND (l.sender_user_id=auth.uid()
         OR (l.recipient_house_id IS NULL AND l.recipient_player_id IS NULL)
         OR EXISTS(SELECT 1 FROM letter_replies r WHERE r.letter_id=l.id AND r.publication_state='delivered' AND r.author_user_id=auth.uid()))
     WHEN 'pending-outgoing' THEN public.is_campaign_admin()
       AND ((l.sender_user_id=auth.uid() AND l.publication_state IN ('draft','scheduled'))
         OR EXISTS(SELECT 1 FROM letter_replies r WHERE r.letter_id=l.id
              AND (r.publication_state='scheduled' OR (r.publication_state='draft' AND r.author_user_id=auth.uid()))))
     ELSE FALSE
   END
 )
 AND (coalesce(p_filters->>'read','')='' OR (CASE WHEN EXISTS(SELECT 1 FROM letter_receipts rr WHERE rr.letter_id=l.id AND rr.user_id=auth.uid() AND NOT EXISTS(SELECT 1 FROM letter_replies r WHERE r.letter_id=l.id AND r.publication_state='delivered' AND r.author_user_id<>auth.uid() AND coalesce(r.delivered_at,r.created_at)>rr.read_at)) THEN 'yes' ELSE 'no' END)=p_filters->>'read')
 AND (
   NOT (p_filters ? 'group_house_ids')
   OR EXISTS (
     SELECT 1 FROM jsonb_array_elements_text(p_filters->'group_house_ids') AS g(house_id)
     WHERE g.house_id=l.origin_house_id OR g.house_id=l.recipient_house_id
       OR EXISTS (SELECT 1 FROM campaign_players member_player
         WHERE (member_player.id=l.sender_player_id OR member_player.id=l.recipient_player_id
           OR member_player.user_id=l.sender_user_id)
           AND (member_player.roster_house_id=g.house_id OR EXISTS(
             SELECT 1 FROM house_memberships membership
             WHERE membership.player_id=member_player.id AND membership.house_id=g.house_id)))
   )
 )
 AND (NOT public.is_campaign_admin() OR coalesce(p_filters->>'box','')<>'recebidas'
      OR (l.recipient_house_id IS NULL AND l.recipient_player_id IS NULL))
 AND (coalesce(p_filters->>'box','')<>'copias'
      OR (public.is_campaign_admin() AND l.sender_player_id IS NOT NULL
          AND l.recipient_house_id IS NOT NULL AND l.publication_state='delivered'))
 AND (coalesce(p_filters->>'text','')=''
   OR strpos(lower(concat_ws(' ',l.subject,l.content,l.sender_name)),lower(p_filters->>'text'))>0
   OR EXISTS(SELECT 1 FROM letter_replies r WHERE r.letter_id=l.id
     AND strpos(lower(concat_ws(' ',r.content,r.author_name)),lower(p_filters->>'text'))>0)
   OR EXISTS(SELECT 1 FROM campaign_houses h WHERE h.id IN (l.recipient_house_id,l.origin_house_id)
     AND strpos(lower(h.name),lower(p_filters->>'text'))>0)
   OR EXISTS(SELECT 1 FROM campaign_players p JOIN campaign_houses h
      ON h.id=p.roster_house_id OR EXISTS(SELECT 1 FROM house_memberships m WHERE m.player_id=p.id AND m.house_id=h.id)
      WHERE (p.id=l.recipient_player_id OR p.id=l.sender_player_id OR p.user_id=l.sender_user_id)
        AND strpos(lower(h.name),lower(p_filters->>'text'))>0))
 ), stats AS (
 SELECT
   count(*) FILTER(WHERE v.publication_state='delivered') AS delivered,
   count(*) FILTER(WHERE v.publication_state='delivered' AND v.last_author_user_id=auth.uid()) AS awaiting_house,
   count(*) FILTER(WHERE v.publication_state='delivered' AND v.last_author_user_id<>auth.uid()
       AND (v.sender_user_id=auth.uid()
         OR (v.recipient_house_id IS NULL AND v.recipient_player_id IS NULL)
         OR EXISTS(SELECT 1 FROM letter_replies r WHERE r.letter_id=v.id
           AND r.publication_state='delivered' AND r.author_user_id=auth.uid()))) AS awaiting_narrator,
   count(*) FILTER(WHERE v.publication_state='draft' AND v.sender_user_id=auth.uid())
     + (SELECT count(*) FROM letter_replies r JOIN visible v2 ON v2.id=r.letter_id
        WHERE r.publication_state='draft' AND r.author_user_id=auth.uid()) AS drafts,
   (SELECT count(*) FROM letter_replies r JOIN visible v3 ON v3.id=r.letter_id
      WHERE r.publication_state='scheduled' AND r.delivery_week=(
        coalesce((SELECT max(number) FROM letter_rounds WHERE status='open'),
                 (SELECT max(number) FROM letter_rounds WHERE status='closed'),0)+1)
       AND r.author_user_id=auth.uid()) AS scheduled_replies_next
 FROM visible v
 ), page_rows AS (
 SELECT v.* FROM visible v
 ORDER BY greatest(
   v.created_at,
   coalesce((
     SELECT max(coalesce(r.delivered_at,r.created_at)) FROM public.letter_replies r
     WHERE r.letter_id=v.id AND r.deleted_at IS NULL
       AND (r.publication_state='delivered'
            OR (r.author_user_id=auth.uid() AND r.publication_state IN ('scheduled','draft')))
   ),v.created_at)
 ) DESC,v.id DESC
 LIMIT p_size OFFSET p_page*p_size
)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM visible),
 'kpis',(SELECT jsonb_build_object('delivered',delivered,'awaiting_house',awaiting_house,
   'awaiting_narrator',awaiting_narrator,'scheduled_replies_next',scheduled_replies_next,'drafts',drafts) FROM stats),
 'letters',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('recipient_read',public.mail_recipient_read(p.id)) ORDER BY p.created_at DESC,p.id DESC) FROM page_rows p),'[]'::jsonb),
 'replies',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at,r.id) FROM letter_replies r WHERE r.letter_id IN (SELECT id FROM page_rows)),'[]'::jsonb)) INTO result;
 RETURN result;
END $function$;
COMMIT;
