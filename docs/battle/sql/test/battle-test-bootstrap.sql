-- Minimal isolated PostgreSQL scaffold for testing the battle migration.
-- Never connect this file to production schemas or data.
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN BYPASSRLS;
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE public.user_roles(user_id uuid NOT NULL,role text NOT NULL);
INSERT INTO public.user_roles(user_id,role) VALUES
 ('11111111-1111-4111-8111-111111111111','admin'),
 ('22222222-2222-4222-8222-222222222222','player');
CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
CREATE FUNCTION public.campaign_access_active() RETURNS boolean LANGUAGE sql STABLE AS $$
 SELECT auth.uid() IS NOT NULL
  AND current_setting('app.campaign_active',true)='on'
$$;
CREATE FUNCTION public.is_campaign_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS (SELECT 1 FROM public.user_roles
 WHERE user_id=auth.uid() AND role='admin')
$$;
GRANT USAGE ON SCHEMA public,auth TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.campaign_access_active(),public.is_campaign_admin()
 TO anon,authenticated,service_role;
