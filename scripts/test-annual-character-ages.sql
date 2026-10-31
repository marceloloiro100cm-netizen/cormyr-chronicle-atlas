-- Lote 7 · motor anual testado em banco efêmero com rollback.
BEGIN;
CREATE FUNCTION pg_temp.assert(ok boolean,label text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF ok IS DISTINCT FROM true THEN RAISE EXCEPTION 'Assertion failed: %',label;END IF;END $;
-- Wrapper exists only in this rolled-back test transaction, never in production.
CREATE FUNCTION pg_temp.age_check(p_id uuid,p_year integer)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $
 SELECT public.character_age_state(c,p_year) FROM public.campaign_characters c
 WHERE c.id=p_id
$;

INSERT INTO auth.users(id) VALUES
 ('30000000-0000-0000-0000-000000000271'),
 ('30000000-0000-0000-0000-000000000272'),
 ('30000000-0000-0000-0000-000000000273');
INSERT INTO public.user_roles(user_id,role) VALUES
 ('30000000-0000-0000-0000-000000000271','admin');
INSERT INTO public.campaign_houses(id,name) VALUES
 ('age-a','Casa A do Tempo'),('age-b','Casa B do Tempo');
INSERT INTO public.campaign_players(id,user_id,name)
 VALUES('30000000-0000-0000-0000-000000000274',
 '30000000-0000-0000-0000-000000000272','Pessoa jogadora A'),
 ('30000000-0000-0000-0000-000000000275',
 '30000000-0000-0000-0000-000000000273','Pessoa jogadora B');
INSERT INTO public.house_memberships(player_id,house_id,authorized_by)
 VALUES('30000000-0000-0000-0000-000000000274','age-a',
 '30000000-0000-0000-0000-000000000271'),
 ('30000000-0000-0000-0000-000000000275','age-b',
 '30000000-0000-0000-0000-000000000271');
INSERT INTO public.campaign_records
 (id,house_id,visibility,kind,title,content,created_by,updated_by)
 VALUES
 ('30000000-0000-0000-0000-000000000276','age-a','house',
  'character','Percival','Ficha de Percival',
  '30000000-0000-0000-0000-000000000272','30000000-0000-0000-0000-000000000272'),
 ('30000000-0000-0000-0000-000000000277','age-a','gm',
  'character','Segredo da Casa','Biografia secreta',
  '30000000-0000-0000-0000-000000000271','30000000-0000-0000-0000-000000000271');

INSERT INTO public.campaign_characters(id,display_name,house_id,
 birth_year,baseline_age,baseline_year,age_policy,age_exception_note,
 alive_status,death_year,confidence,review_status,visibility,is_noble,
 created_by,updated_by)
 VALUES
 ('30000000-0000-0000-0000-000000000281','Percival Evenhand','age-a',
  1492,NULL,NULL,'year_turn',NULL,'alive',NULL,'confirmed','reviewed','house',true,
  '30000000-0000-0000-0000-000000000271','30000000-0000-0000-0000-000000000271'),
 ('30000000-0000-0000-0000-000000000282','Planchar Stonecastle',NULL,
  1447,NULL,NULL,'year_turn',NULL,'deceased',1521,'confirmed','reviewed','gm',true,
  '30000000-0000-0000-0000-000000000271','30000000-0000-0000-0000-000000000271'),
 ('30000000-0000-0000-0000-000000000283','Bebê Evenhand','age-a',
  1524,NULL,NULL,'year_turn',NULL,'alive',NULL,'supported','reviewed','gm',true,
  '30000000-0000-0000-0000-000000000271','30000000-0000-0000-0000-000000000271'),
 ('30000000-0000-0000-0000-000000000284','Tomenn Staghunt',NULL,
  1443,64,1522,'year_turn',NULL,'unknown',NULL,'unverified','conflict','gm',true,
  '30000000-0000-0000-0000-000000000271','30000000-0000-0000-0000-000000000271'),
 ('30000000-0000-0000-0000-000000000285','Idade de referência',NULL,
  NULL,30,1522,'year_turn',NULL,'alive',NULL,'confirmed','reviewed','gm',true,
  '30000000-0000-0000-0000-000000000271','30000000-0000-0000-0000-000000000271'),
 ('30000000-0000-0000-0000-000000000286','Elfo em estase',NULL,
  1200,NULL,NULL,'manual_exception','Estase aprovada pelo Narrador','alive',NULL,
  'confirmed','reviewed','gm',true,
  '30000000-0000-0000-0000-000000000271','30000000-0000-0000-0000-000000000271'),
 ('30000000-0000-0000-0000-000000000287','Sem qualquer fonte',NULL,
  1510,NULL,NULL,'year_turn',NULL,'alive',NULL,'confirmed','reviewed','gm',true,
  '30000000-0000-0000-0000-000000000271','30000000-0000-0000-0000-000000000271'),
 ('30000000-0000-0000-0000-000000000288','Segredo da Corte','age-a',
  1500,NULL,NULL,'year_turn',NULL,'alive',NULL,'confirmed','reviewed','gm',true,
  '30000000-0000-0000-0000-000000000271','30000000-0000-0000-0000-000000000271');
INSERT INTO public.character_source_links
 (character_id,source_kind,source_key,source_visibility,confirmed_by)
 VALUES
 ('30000000-0000-0000-0000-000000000281','campaign_record',
  '30000000-0000-0000-0000-000000000276','house','30000000-0000-0000-0000-000000000271'),
 ('30000000-0000-0000-0000-000000000281','archive_history',
  'evenhand-test','public','30000000-0000-0000-0000-000000000271'),
 ('30000000-0000-0000-0000-000000000282','archive_history',
  'stonecastle-test','public','30000000-0000-0000-0000-000000000271'),
 ('30000000-0000-0000-0000-000000000283','archive_history',
  'baby-test','gm','30000000-0000-0000-0000-000000000271'),
 ('30000000-0000-0000-0000-000000000284','archive_history',
  'staghunt-test','public','30000000-0000-0000-0000-000000000271'),
 ('30000000-0000-0000-0000-000000000285','other',
  'baseline-test','gm','30000000-0000-0000-0000-000000000271'),
 ('30000000-0000-0000-0000-000000000286','other',
  'stasis-test','gm','30000000-0000-0000-0000-000000000271'),
 ('30000000-0000-0000-0000-000000000288','campaign_record',
  '30000000-0000-0000-0000-000000000277','gm','30000000-0000-0000-0000-000000000271');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000271',true);
SELECT pg_temp.assert(
 (public.get_character_age_dashboard(1522,1523,100)->'totals'->>'total')::int=8,
 'dashboard counts unique canonical people instead of source rows');
SELECT pg_temp.assert(
 (public.get_character_age_dashboard(1522,1523,100)->'totals'->>'aged_nobles')::int=3,
 'exactly Percival, baseline and secret living noble age in one year');
SELECT pg_temp.assert(
 (SELECT pg_temp.age_check(c.id,1522)->>'age'='30'
  FROM public.campaign_characters c WHERE c.display_name='Percival Evenhand'),
 'Percival born 1492 is 30 in year 1522');
SELECT pg_temp.assert(
 (SELECT pg_temp.age_check(c.id,1523)->>'age'='31'
  FROM public.campaign_characters c WHERE c.display_name='Percival Evenhand'),
 'Percival advances exactly one year');
SELECT pg_temp.assert(
 (SELECT pg_temp.age_check(c.id,1525)->>'age'='33'
  FROM public.campaign_characters c WHERE c.display_name='Percival Evenhand'),
 'multi-year leap calculates three years, not two or four');
SELECT pg_temp.assert(
 (SELECT pg_temp.age_check(c.id,1525)->>'age'='74'
  FROM public.campaign_characters c WHERE c.display_name='Planchar Stonecastle'),
 'deceased character freezes at age on death year');
SELECT pg_temp.assert(
 (SELECT pg_temp.age_check(c.id,1523)->>'status'='not_born'
  FROM public.campaign_characters c WHERE c.display_name='Bebê Evenhand'),
 'unborn person is excluded before 1524');
SELECT pg_temp.assert(
 (SELECT pg_temp.age_check(c.id,1524)->>'age'='0'
  FROM public.campaign_characters c WHERE c.display_name='Bebê Evenhand'),
 'newborn age zero in birth year');
SELECT pg_temp.assert(
 (SELECT pg_temp.age_check(c.id,1525)->>'age'='1'
  FROM public.campaign_characters c WHERE c.display_name='Bebê Evenhand'),
 'newborn ages on next Harptos year transition');
SELECT pg_temp.assert(
 (SELECT pg_temp.age_check(c.id,1523)->>'age'='31'
  FROM public.campaign_characters c WHERE c.display_name='Idade de referência'),
 'baseline-age-only fallback uses confirmed reference year');
SELECT pg_temp.assert(
 (SELECT pg_temp.age_check(c.id,1523)->>'status'='conflict'
  FROM public.campaign_characters c WHERE c.display_name='Tomenn Staghunt'),
 'unreconciled birth/baseline conflict never invents a corrected age');
SELECT pg_temp.assert(
 (SELECT pg_temp.age_check(c.id,1523)->>'status'='manual_exception'
  FROM public.campaign_characters c WHERE c.display_name='Elfo em estase'),
 'approved exceptional age policy never guesses a special mechanic');
SELECT pg_temp.assert(
 (SELECT pg_temp.age_check(c.id,1523)->>'status'='pending_source'
  FROM public.campaign_characters c WHERE c.display_name='Sem qualquer fonte'),
 'source-free record is blocked from claimed age');

SELECT pg_temp.assert(
 jsonb_array_length(public.get_character_year_transitions(30))=0,
 'no annual transition before clock changes');
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::int,
 '30000000-0000-4000-8000-000000000291','set','1522-12-21',0,'Preparar virada anual',false);
SELECT pg_temp.assert(
 jsonb_array_length(public.get_character_year_transitions(30))=0,
 'within-year date move causes no aging event');
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::int,
 '30000000-0000-4000-8000-000000000292','advance',NULL,1,'Avanço de virada anual',false);
SELECT pg_temp.assert(
 (public.get_campaign_calendar()->>'year')::int=1523,'annual boundary crossed');
SELECT pg_temp.assert(
 jsonb_array_length(public.get_character_year_transitions(30))=1,
 'one annual audit event for one boundary');
SELECT pg_temp.assert(
 (SELECT from_year=1522 AND to_year=1523 FROM public.character_year_transitions),
 'year change event records exact 1522 to 1523');
SELECT public.publish_campaign_time_change(
 2,'30000000-0000-4000-8000-000000000292','advance',NULL,1,'Avanço de virada anual',false);
SELECT pg_temp.assert(
 jsonb_array_length(public.get_character_year_transitions(30))=1,
 'replay of same operation cannot age twice or duplicate the event');
SELECT pg_temp.assert(
 (SELECT count(*)=8 FROM public.campaign_characters WHERE version=1),
 'year change does not mutate any canonical birth or age baseline');
SELECT pg_temp.assert(
 (public.get_character_age_dashboard(NULL,NULL,100)->>'current_year')::int=1523,
 'year preview follows actual published campaign clock');
SELECT pg_temp.assert(
 (public.get_character_age_dashboard(1523,1525,100)->'totals'->>'aged_nobles')::int=3,
 'large jump calculates exactly two elapsed years');
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::int,
 '30000000-0000-4000-8000-000000000293','set','1525-01-01',0,'Salto de dois anos',false);
SELECT pg_temp.assert(
 jsonb_array_length(public.get_character_year_transitions(30))=3,
 'two-year jump records both crossed year boundaries exactly once');
SELECT public.publish_campaign_time_change(
 (public.get_campaign_calendar()->>'version')::int,
 '30000000-0000-4000-8000-000000000294','set','1524-01-01',0,
 'Correção histórica excepcional e autorizada',true);
SELECT pg_temp.assert(
 jsonb_array_length(public.get_character_year_transitions(30))=4,
 'backdating records compensating direction without undoing original years');
SELECT pg_temp.assert(
 (SELECT count(*)=8 FROM public.campaign_characters WHERE version=1),
 'backdating does not rewrite genealogy or persisted ages');

-- House permission: only explicitly linked visible character records, never
-- anonymous people or secret court members.
SELECT pg_temp.assert(
 jsonb_array_length(public.get_house_character_ages('age-a'))=2,
 'narrator can see house and gm records with confirmed source links');
SELECT set_config('request.jwt.claim.sub','30000000-0000-0000-0000-000000000272',true);
SELECT pg_temp.assert(
 jsonb_array_length(public.get_house_character_ages('age-a'))=1,
 'house A player sees only public-to-house linked age');
SELECT pg_temp.assert(
 (public.get_house_character_ages('age-a')->0->>'age')='32',
 'house age follows corrected official year 1524');
SELECT pg_temp.assert((SELECT count(*)=0 FROM public.character_year_transitions),
 'player never reads private year-change event table');
DO $t$ BEGIN
 BEGIN
  PERFORM public.get_character_age_dashboard(1524,1525,10);
  RAISE EXCEPTION 'player accessed narrator age dashboard';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='player accessed narrator age dashboard'
   OR SQLERRM NOT LIKE 'Idades e genealogias restritas%' THEN RAISE; END IF;
 END;
 BEGIN PERFORM public.get_character_year_transitions(30);
  RAISE EXCEPTION 'player accessed annual audit';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='player accessed annual audit'
   OR SQLERRM NOT LIKE 'Auditoria anual exclusiva%' THEN RAISE; END IF;
 END;
 BEGIN PERFORM public.get_house_character_ages('age-b');
  RAISE EXCEPTION 'player accessed another house';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='player accessed another house'
   OR SQLERRM NOT LIKE 'Pessoa não autorizada%' THEN RAISE; END IF;
 END;
END $t$;
RESET ROLE;
SET LOCAL ROLE anon;
SELECT pg_temp.assert(NOT has_function_privilege('anon',
 'public.get_house_character_ages(text)','EXECUTE'),
 'anonymous visitors have no age query');
SELECT pg_temp.assert(NOT has_function_privilege('anon',
 'public.get_character_age_dashboard(integer,integer,integer)','EXECUTE'),
 'anonymous visitors have no bulk aging dashboard');
SELECT pg_temp.assert(NOT has_table_privilege('anon',
 'public.character_year_transitions','SELECT'),
 'anonymous visitors cannot read annual audit');
RESET ROLE;
ROLLBACK;
