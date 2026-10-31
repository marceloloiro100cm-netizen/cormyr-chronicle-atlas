-- Lote 5: projeção pública não deve contornar os dados privados.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label; END IF; END $$;
INSERT INTO auth.users(id) VALUES ('30000000-0000-0000-0000-000000000091');
INSERT INTO public.user_roles(user_id,role) VALUES
 ('30000000-0000-0000-0000-000000000091','admin');

SET LOCAL ROLE anon;
SELECT pg_temp.assert(public.get_public_campaign_time() IS NOT NULL,
 'visitor can read the published date without login');
SELECT pg_temp.assert((SELECT public.get_public_campaign_time()->>'year')='1522',
 'public current year comes from the published calendar');
SELECT pg_temp.assert((SELECT count(*)=5 FROM jsonb_object_keys(public.get_public_campaign_time())),
 'projection contains exactly year, month, day, festival, version');
SELECT pg_temp.assert(NOT has_table_privilege('anon','public.campaign_calendar','SELECT'),
 'public users cannot select protected calendar row');
SELECT pg_temp.assert(NOT has_table_privilege('anon','public.campaign_time_operations','SELECT'),
 'public users cannot select temporal history');
SELECT pg_temp.assert(NOT has_function_privilege('anon',
 'public.get_campaign_time_history(integer)','EXECUTE'),
 'public users cannot execute private history RPC');
SELECT pg_temp.assert(NOT has_function_privilege('anon',
 'public.preview_campaign_time_change(integer,text,text,integer,boolean)','EXECUTE'),
 'public users cannot read private preview');
SELECT pg_temp.assert(NOT has_function_privilege('anon',
 'public.publish_campaign_time_change(integer,uuid,text,text,integer,text,boolean)','EXECUTE'),
 'public users cannot alter date');
SELECT pg_temp.assert(NOT has_table_privilege('anon','public.campaign_schedule_events','SELECT'),
 'public users cannot select narrator drafts');

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000091',true);
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::integer,
 '30000000-0000-4000-8000-000000000191','set','1524-F-shieldmeet',0,
 'Calendário público bissexto',false
);
SELECT pg_temp.assert((public.get_public_campaign_time()->>'festival')='shieldmeet',
 'festival from protected calendar becomes visible only as current date');
SELECT pg_temp.assert((public.get_public_campaign_time()->>'version')=
 (public.get_campaign_calendar()->>'version'),
 'public projection follows the authoritative version');

RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.assert((public.get_public_campaign_time()->>'year')='1524',
 'visitor sees updated year after narrator publication');
SELECT pg_temp.assert((public.get_public_campaign_time()->>'festival')='shieldmeet',
 'visitor sees intercalary festival, not a fictitious fourth tenday');
SELECT pg_temp.assert((SELECT count(*)=5 FROM jsonb_object_keys(public.get_public_campaign_time())),
 'no private columns leaked after a publication');
RESET ROLE;
ROLLBACK;
