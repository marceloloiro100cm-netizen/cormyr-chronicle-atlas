DROP POLICY rounds_read ON public.letter_rounds;
CREATE POLICY rounds_read ON public.letter_rounds FOR SELECT TO authenticated USING (public.campaign_access_active());