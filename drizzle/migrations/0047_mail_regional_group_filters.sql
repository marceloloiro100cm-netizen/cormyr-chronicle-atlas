-- Server-side grouping before LIMIT/OFFSET keeps pages, metrics and filters consistent.
-- House is relevant as sender OR recipient; selecting both groups is a union, not a duplication.
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
 SELECT l.* FROM campaign_letters l
 WHERE CASE WHEN p_filters->>'box'='excluidas' THEN l.deleted_at IS NOT NULL ELSE l.deleted_at IS NULL END
 AND (coalesce(p_filters->>'box','') NOT IN ('recebidas','enviadas') OR (p_filters->>'box'='recebidas' AND l.sender_user_id<>auth.uid()) OR (p_filters->>'box'='enviadas' AND l.sender_user_id=auth.uid()))
 AND (coalesce(p_filters->>'box','') NOT IN ('rascunhos','programadas','historico') OR
 l.publication_state=CASE p_filters->>'box' WHEN 'rascunhos' THEN 'draft' WHEN 'programadas' THEN 'scheduled' ELSE 'delivered' END
 OR EXISTS(SELECT 1 FROM letter_replies r WHERE r.letter_id=l.id AND r.publication_state=CASE p_filters->>'box' WHEN 'rascunhos' THEN 'draft' WHEN 'programadas' THEN 'scheduled' ELSE 'delivered' END))
 AND (coalesce(p_filters->>'number','')='' OR l.delivery_week::text=p_filters->>'number' OR EXISTS(SELECT 1 FROM letter_replies r WHERE r.letter_id=l.id AND (coalesce(p_filters->>'box','')<>'historico' OR r.publication_state='delivered') AND r.delivery_week::text=p_filters->>'number'))
 AND (coalesce(p_filters->>'kind','')='' OR l.letter_kind=p_filters->>'kind')
 AND (coalesce(p_filters->>'origin','')='' OR (p_filters->>'origin'='none' AND l.origin_house_id IS NULL) OR l.origin_house_id=p_filters->>'origin')
 AND (coalesce(p_filters->>'house','')='' OR l.recipient_house_id=p_filters->>'house' OR (l.recipient_house_id IS NULL AND EXISTS(SELECT 1 FROM campaign_players p WHERE p.id=l.sender_player_id AND p.roster_house_id=p_filters->>'house')))
 AND (coalesce(p_filters->>'court','')='' OR (p_filters->>'court'='none' AND l.court_member_id IS NULL) OR l.origin_house_id||':'||l.court_member_id=p_filters->>'court')
 AND (coalesce(p_filters->>'unit','')='' OR (p_filters->>'unit'='none' AND l.military_unit_id IS NULL) OR l.origin_house_id||':'||l.military_unit_id=p_filters->>'unit')
 AND (coalesce(p_filters->>'answered','')='' OR (CASE WHEN EXISTS(SELECT 1 FROM letter_replies r WHERE r.letter_id=l.id AND r.publication_state='delivered' AND r.author_user_id<>l.sender_user_id) THEN 'yes' ELSE 'no' END)=p_filters->>'answered')
 AND (coalesce(p_filters->>'read','')='' OR (CASE WHEN EXISTS(SELECT 1 FROM letter_receipts rr WHERE rr.letter_id=l.id AND rr.user_id=auth.uid() AND NOT EXISTS(SELECT 1 FROM letter_replies r WHERE r.letter_id=l.id AND r.publication_state='delivered' AND r.author_user_id<>auth.uid() AND coalesce(r.delivered_at,r.created_at)>rr.read_at)) THEN 'yes' ELSE 'no' END)=p_filters->>'read')
 AND (
   NOT (p_filters ? 'group_house_ids')
   OR EXISTS (
     SELECT 1 FROM jsonb_array_elements_text(p_filters->'group_house_ids') AS g(house_id)
     WHERE g.house_id=l.origin_house_id OR g.house_id=l.recipient_house_id
       OR EXISTS (SELECT 1 FROM campaign_players sender
         WHERE sender.id=l.sender_player_id AND sender.roster_house_id=g.house_id)
       OR EXISTS (SELECT 1 FROM campaign_players target
         WHERE target.id=l.recipient_player_id AND target.roster_house_id=g.house_id)
   )
 )
 AND (NOT public.is_campaign_admin() OR coalesce(p_filters->>'box','')<>'recebidas'
      OR (l.recipient_house_id IS NULL AND l.recipient_player_id IS NULL))
 AND (coalesce(p_filters->>'text','')='' OR strpos(lower(l.subject||' '||l.content||' '||l.sender_name),lower(p_filters->>'text'))>0 OR EXISTS(SELECT 1 FROM letter_replies r WHERE r.letter_id=l.id AND strpos(lower(r.content),lower(p_filters->>'text'))>0))
 ), page_rows AS (SELECT * FROM visible ORDER BY created_at DESC,id DESC LIMIT p_size OFFSET p_page*p_size)
 SELECT jsonb_build_object('total',(SELECT count(*) FROM visible),'letters',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object('recipient_read',public.mail_recipient_read(p.id)) ORDER BY p.created_at DESC,p.id DESC) FROM page_rows p),'[]'::jsonb),
 'replies',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY r.created_at,r.id) FROM letter_replies r WHERE r.letter_id IN (SELECT id FROM page_rows)),'[]'::jsonb)) INTO result;
 RETURN result;
END $function$;
CREATE OR REPLACE FUNCTION public.mail_overview_grouped(p_house_ids text[])
RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT jsonb_build_object(
 'total',count(*),
 'scheduled',count(*) FILTER (WHERE publication_state='scheduled'),
 'drafts',count(*) FILTER (WHERE publication_state='draft'),
 'delivered',count(*) FILTER (WHERE publication_state='delivered'))
 FROM campaign_letters l
 WHERE public.is_campaign_admin() AND l.deleted_at IS NULL
 AND EXISTS (SELECT 1 FROM unnest(p_house_ids) AS x(house_id)
   WHERE x.house_id=l.origin_house_id OR x.house_id=l.recipient_house_id
     OR EXISTS(SELECT 1 FROM campaign_players p WHERE p.id=l.sender_player_id AND p.roster_house_id=x.house_id)
     OR EXISTS(SELECT 1 FROM campaign_players p WHERE p.id=l.recipient_player_id AND p.roster_house_id=x.house_id))
$$;
REVOKE ALL ON FUNCTION public.mail_overview_grouped(text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mail_overview_grouped(text[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.mail_insights_grouped(p_house_ids text[])
RETURNS jsonb LANGUAGE sql STABLE SET search_path=public AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]'::jsonb) FROM (
 SELECT l.origin_house_id,l.court_member_id,l.court_assignment,l.military_unit_id,
 count(DISTINCT coalesce(l.batch_key,l.id)) AS messages,count(*) AS deliveries,
 count(*) FILTER(WHERE l.publication_state='delivered') AS delivered,
 count(*) FILTER(WHERE l.publication_state='delivered' AND EXISTS(
 SELECT 1 FROM letter_replies r WHERE r.letter_id=l.id AND r.publication_state='delivered'
 AND r.author_user_id<>l.sender_user_id)) AS answered
 FROM campaign_letters l WHERE l.deleted_at IS NULL AND public.is_campaign_admin()
 AND EXISTS (SELECT 1 FROM unnest(p_house_ids) AS x(house_id)
   WHERE x.house_id=l.origin_house_id OR x.house_id=l.recipient_house_id
     OR EXISTS(SELECT 1 FROM campaign_players p WHERE p.id=l.sender_player_id AND p.roster_house_id=x.house_id)
     OR EXISTS(SELECT 1 FROM campaign_players p WHERE p.id=l.recipient_player_id AND p.roster_house_id=x.house_id))
 GROUP BY l.origin_house_id,l.court_member_id,l.court_assignment,l.military_unit_id
 ORDER BY l.origin_house_id,l.court_member_id,l.military_unit_id
 ) t;
$$;
REVOKE ALL ON FUNCTION public.mail_insights_grouped(text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mail_insights_grouped(text[]) TO authenticated;
