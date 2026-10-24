CREATE OR REPLACE FUNCTION public.can_read_reply(r letter_replies)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT public.is_campaign_admin()
    OR (public.campaign_access_active() AND (
      r.author_user_id = auth.uid()
      OR (r.publication_state = 'delivered' AND (
        (r.recipient_user_id = auth.uid() AND EXISTS(
          SELECT 1 FROM public.campaign_letters l WHERE l.id = r.letter_id AND public.can_read_letter(l)
        ))
        OR (r.house_id IS NOT NULL AND public.in_campaign_house(r.house_id, false))
      ))
    ))
$$;