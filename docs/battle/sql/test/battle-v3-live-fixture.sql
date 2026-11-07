-- Banco descartável do CI, nunca Supabase real.
CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY);
INSERT INTO auth.users(id) VALUES
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222'),
 ('33333333-3333-4333-8333-333333333333'),
 ('44444444-4444-4444-8444-444444444444')
 ON CONFLICT DO NOTHING;
CREATE TABLE public.campaign_houses (
 id text PRIMARY KEY,active boolean NOT NULL DEFAULT true,season integer NOT NULL DEFAULT 2
);
INSERT INTO public.campaign_houses(id) VALUES ('test-ashkar'),('test-evenhand'),('test-outsider');
CREATE TABLE public.house_memberships (
 user_id uuid NOT NULL,house_id text NOT NULL REFERENCES public.campaign_houses(id),
 can_edit boolean NOT NULL DEFAULT true,active boolean NOT NULL DEFAULT true
);
INSERT INTO public.house_memberships VALUES
 ('22222222-2222-4222-8222-222222222222','test-evenhand',true,true),
 ('33333333-3333-4333-8333-333333333333','test-ashkar',true,true),
 ('44444444-4444-4444-8444-444444444444','test-outsider',true,true);
CREATE FUNCTION public.in_campaign_house(h text,edit_required boolean DEFAULT false)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM public.house_memberships
  WHERE user_id=auth.uid() AND house_id=h AND active
    AND (NOT edit_required OR can_edit))
$$;
GRANT EXECUTE ON FUNCTION public.in_campaign_house(text,boolean) TO authenticated;
