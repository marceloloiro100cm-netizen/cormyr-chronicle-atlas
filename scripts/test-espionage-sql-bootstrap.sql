-- Banco DESCARTÁVEL do GitHub Actions, nunca produção.
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE anon NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE SCHEMA auth;
CREATE TABLE auth.users(id uuid PRIMARY KEY);
CREATE TABLE public.campaign_houses(id text PRIMARY KEY);
CREATE TABLE public.campaign_calendar(
 id boolean PRIMARY KEY DEFAULT true,year int,month int,day int,festival text,version int);
CREATE TABLE public.noble_house_ledger(
 house_id text NOT NULL,operation_key uuid NOT NULL,
 PRIMARY KEY(house_id,operation_key));
CREATE TABLE public.test_roles(user_id uuid PRIMARY KEY,is_admin boolean NOT NULL DEFAULT false);
CREATE TABLE public.test_memberships(user_id uuid,house_id text,can_edit boolean NOT NULL,PRIMARY KEY(user_id,house_id));
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
 SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
CREATE OR REPLACE FUNCTION public.is_campaign_admin() RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.test_roles WHERE user_id=auth.uid() AND is_admin)
$$;
CREATE OR REPLACE FUNCTION public.campaign_access_active() RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT auth.uid() IS NOT NULL
$$;
CREATE OR REPLACE FUNCTION public.in_campaign_house(p_house text,p_edit_required boolean)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM public.test_memberships
  WHERE user_id=auth.uid() AND house_id=p_house AND (NOT p_edit_required OR can_edit))
$$;
CREATE OR REPLACE FUNCTION public.valid_campaign_date(p text) RETURNS boolean
 LANGUAGE sql IMMUTABLE AS $$
 SELECT p~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
$$;
CREATE OR REPLACE FUNCTION public.harptos_calendar_ordinal(p text) RETURNS integer
 LANGUAGE sql IMMUTABLE AS $$
 SELECT substring(p,1,4)::int*365+substring(p,6,2)::int*30+substring(p,9,2)::int
$$;
CREATE OR REPLACE FUNCTION public.harptos_time_key(y int,m int,d int,f text)
 RETURNS text LANGUAGE sql IMMUTABLE AS $$
 SELECT lpad(y::text,4,'0')||'-'||lpad((m+1)::text,2,'0')||'-'||lpad(d::text,2,'0')
$$;
CREATE TABLE public.campaign_time_operations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),after_state jsonb NOT NULL);
CREATE TABLE public.campaign_temporal_consumers(
 code text PRIMARY KEY,title text NOT NULL,description text NOT NULL,
 boundary text NOT NULL,mode text NOT NULL,enabled boolean DEFAULT true);
CREATE OR REPLACE FUNCTION public.spy_test_assert(ok boolean,label text)
 RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Espionagem SQL gate: %',label; END IF; END $$;
GRANT USAGE ON SCHEMA auth TO authenticated;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_campaign_admin() TO authenticated;
GRANT EXECUTE ON FUNCTION public.campaign_access_active() TO authenticated;
GRANT EXECUTE ON FUNCTION public.in_campaign_house(text,boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.spy_test_assert(boolean,text) TO authenticated;
INSERT INTO auth.users VALUES
 ('11111111-1111-4111-8111-111111111111'),
 ('22222222-2222-4222-8222-222222222222'),
 ('33333333-3333-4333-8333-333333333333');
INSERT INTO campaign_houses VALUES ('house-a'),('house-b');
INSERT INTO test_roles VALUES
 ('11111111-1111-4111-8111-111111111111',false),
 ('22222222-2222-4222-8222-222222222222',false),
 ('33333333-3333-4333-8333-333333333333',true);
INSERT INTO test_memberships VALUES
 ('11111111-1111-4111-8111-111111111111','house-a',true),
 ('22222222-2222-4222-8222-222222222222','house-b',true);
INSERT INTO campaign_calendar VALUES(true,1524,0,20,NULL,4);
INSERT INTO campaign_time_operations(after_state) VALUES('{"version":4}');
