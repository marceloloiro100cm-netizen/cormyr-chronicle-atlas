-- Isolamento V3.4: executar SOMENTE em PostgreSQL descartável do CI.
CREATE TABLE IF NOT EXISTS auth.users(id uuid PRIMARY KEY);
INSERT INTO auth.users(id) VALUES
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222'),
 ('33333333-3333-4333-8333-333333333333'),
 ('44444444-4444-4444-8444-444444444444');
CREATE TABLE public.campaign_houses(
 id text PRIMARY KEY,name text NOT NULL,active boolean NOT NULL DEFAULT true,
 season integer NOT NULL DEFAULT 2);
INSERT INTO public.campaign_houses(id,name) VALUES
 ('house-v34-a','Evenhand - teste'),('house-v34-b','Ashkar - teste'),
 ('house-v34-c','Externo - teste');
CREATE TABLE public.battle_v34_test_members(
 actor_id uuid NOT NULL REFERENCES auth.users(id),house_id text NOT NULL
 REFERENCES public.campaign_houses(id),active boolean NOT NULL DEFAULT true,
 PRIMARY KEY(actor_id,house_id));
INSERT INTO public.battle_v34_test_members(actor_id,house_id) VALUES
 ('22222222-2222-4222-8222-222222222222','house-v34-a'),
 ('33333333-3333-4333-8333-333333333333','house-v34-b'),
 ('44444444-4444-4444-8444-444444444444','house-v34-c');
CREATE FUNCTION public.in_campaign_house(p_house text,p_allow_admin boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $v34$
 SELECT auth.uid() IS NOT NULL AND
 (EXISTS(SELECT 1 FROM public.battle_v34_test_members m
   WHERE m.actor_id=auth.uid() AND m.house_id=p_house AND m.active)
  OR (p_allow_admin AND public.is_campaign_admin()))
$v34$;
GRANT EXECUTE ON FUNCTION public.in_campaign_house(text,boolean) TO authenticated,service_role;
