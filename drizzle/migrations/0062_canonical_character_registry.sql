-- Hub Temporal Lote 6 — REGISTRO CANÔNICO E CONCILIAÇÃO (sem aging engine).
-- Never migrate/overwrite authorial records based on matching names.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='45000ms';

CREATE TABLE public.campaign_characters(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 display_name text NOT NULL CHECK(length(btrim(display_name)) BETWEEN 1 AND 180),
 aliases text[] NOT NULL DEFAULT ARRAY[]::text[],
 house_id text REFERENCES public.campaign_houses(id),
 noble_roles text[] NOT NULL DEFAULT ARRAY[]::text[],
 race text,
 is_noble boolean NOT NULL DEFAULT true,
 birth_year integer CHECK(birth_year BETWEEN 1 AND 9999),
 birth_date text CHECK(birth_date IS NULL OR public.valid_campaign_date(birth_date)),
 baseline_age integer CHECK(baseline_age BETWEEN 0 AND 9999),
 baseline_year integer CHECK(baseline_year BETWEEN 1 AND 9999),
 age_policy text NOT NULL DEFAULT 'year_turn'
  CHECK(age_policy IN ('year_turn','manual_exception')),
 age_exception_note text,
 apparent_age text,
 alive_status text NOT NULL DEFAULT 'unknown'
  CHECK(alive_status IN ('alive','deceased','unknown')),
 death_year integer CHECK(death_year BETWEEN 1 AND 9999),
 death_date text CHECK(death_date IS NULL OR public.valid_campaign_date(death_date)),
 visibility text NOT NULL DEFAULT 'gm'
  CHECK(visibility IN ('gm','house','player')),
 owner_user_id uuid REFERENCES auth.users(id),
 confidence text NOT NULL DEFAULT 'unverified'
  CHECK(confidence IN ('unverified','supported','confirmed')),
 review_status text NOT NULL DEFAULT 'pending'
  CHECK(review_status IN ('pending','reviewed','conflict')),
 review_note text NOT NULL DEFAULT '',
 version integer NOT NULL DEFAULT 1 CHECK(version>=1),
 created_by uuid NOT NULL REFERENCES auth.users(id),
 updated_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK((baseline_age IS NULL)=(baseline_year IS NULL)),
 CHECK(birth_date IS NULL OR birth_year=substring(birth_date,1,4)::integer),
 CHECK(death_date IS NULL OR death_year=substring(death_date,1,4)::integer),
 CHECK(death_year IS NULL OR birth_year IS NULL OR death_year>=birth_year),
 CHECK(visibility<>'house' OR house_id IS NOT NULL),
 CHECK(visibility<>'player' OR owner_user_id IS NOT NULL),
 CHECK(age_policy<>'manual_exception' OR length(btrim(coalesce(age_exception_note,'')))>=10)
);
CREATE INDEX campaign_characters_house_idx ON public.campaign_characters(house_id);
CREATE INDEX campaign_characters_review_idx ON public.campaign_characters(review_status,alive_status);
ALTER TABLE public.campaign_characters ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_characters FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.campaign_characters TO authenticated;
CREATE POLICY campaign_characters_read ON public.campaign_characters FOR SELECT TO authenticated
 USING(public.is_campaign_admin() OR
  (visibility='house' AND public.in_campaign_house(house_id,false)) OR
  (visibility='player' AND owner_user_id=auth.uid()));

CREATE TABLE public.character_source_links(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 character_id uuid NOT NULL REFERENCES public.campaign_characters(id) ON DELETE RESTRICT,
 source_kind text NOT NULL CHECK(source_kind IN
  ('campaign_record','campaign_house','campaign_player_roster','house_court',
   'house_catalog','archive_history','legacy_sheet','other')),
 source_key text NOT NULL CHECK(length(btrim(source_key)) BETWEEN 1 AND 512),
 source_visibility text NOT NULL DEFAULT 'gm' CHECK(source_visibility IN ('gm','house','player','public')),
 source_reference jsonb NOT NULL DEFAULT '{}'::jsonb,
 confirmed_by uuid NOT NULL REFERENCES auth.users(id),
 confirmed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_kind,source_key)
);
CREATE INDEX character_source_links_character_idx ON public.character_source_links(character_id);
ALTER TABLE public.character_source_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.character_source_links FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.character_source_links TO authenticated;
CREATE POLICY character_source_links_admin_read ON public.character_source_links FOR SELECT
 TO authenticated USING(public.is_campaign_admin());

CREATE TABLE public.character_review_queue(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 source_kind text NOT NULL CHECK(source_kind IN
  ('campaign_record','campaign_house','campaign_player_roster','house_court',
   'house_catalog','archive_history','legacy_sheet','other')),
 source_key text NOT NULL CHECK(length(btrim(source_key)) BETWEEN 1 AND 512),
 proposed_name text NOT NULL CHECK(length(btrim(proposed_name)) BETWEEN 1 AND 180),
 house_id text REFERENCES public.campaign_houses(id),
 claimed_birth_year integer CHECK(claimed_birth_year BETWEEN 1 AND 9999),
 claimed_age integer CHECK(claimed_age BETWEEN 0 AND 9999),
 claimed_age_year integer CHECK(claimed_age_year BETWEEN 1 AND 9999),
 evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
 source_visibility text NOT NULL DEFAULT 'gm' CHECK(source_visibility IN ('gm','house','player','public')),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','linked','ignored','conflict')),
 character_id uuid REFERENCES public.campaign_characters(id) ON DELETE RESTRICT,
 review_note text NOT NULL DEFAULT '',
 reviewed_by uuid REFERENCES auth.users(id),
 reviewed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(source_kind,source_key),
 CHECK(status<>'linked' OR character_id IS NOT NULL)
);
CREATE INDEX character_review_queue_status_idx ON public.character_review_queue(status,created_at);
ALTER TABLE public.character_review_queue ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.character_review_queue FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.character_review_queue TO authenticated;
CREATE POLICY character_review_queue_admin_read ON public.character_review_queue FOR SELECT
 TO authenticated USING(public.is_campaign_admin());

CREATE TABLE public.character_relations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 from_character uuid NOT NULL REFERENCES public.campaign_characters(id) ON DELETE RESTRICT,
 to_character uuid NOT NULL REFERENCES public.campaign_characters(id) ON DELETE RESTRICT,
 relation text NOT NULL CHECK(relation IN ('parent','spouse','sibling','guardian','other')),
 note text NOT NULL DEFAULT '',
 approved_by uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(from_character,to_character,relation),
 CHECK(from_character<>to_character)
);
ALTER TABLE public.character_relations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.character_relations FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.character_relations TO authenticated;
CREATE POLICY character_relations_admin_read ON public.character_relations FOR SELECT
 TO authenticated USING(public.is_campaign_admin());

CREATE TABLE public.character_registry_audit(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 actor uuid NOT NULL REFERENCES auth.users(id),
 action text NOT NULL,
 character_id uuid REFERENCES public.campaign_characters(id),
 source_kind text,
 source_key text,
 before_state jsonb,
 after_state jsonb,
 reason text NOT NULL CHECK(length(btrim(reason))>=10),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.character_registry_audit ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.character_registry_audit FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.character_registry_audit TO authenticated;
CREATE POLICY character_registry_audit_admin_read ON public.character_registry_audit FOR SELECT
 TO authenticated USING(public.is_campaign_admin());

-- All source imports are read-only with respect to existing content.
-- Never infer that two people with the same normalized name are the same.
CREATE OR REPLACE FUNCTION public.stage_campaign_character_sources()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE added_houses integer;added_records integer;added_roster integer;
BEGIN
 IF NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Apenas Narrador pode importar candidatos'; END IF;
 INSERT INTO public.character_review_queue(source_kind,source_key,proposed_name,house_id,evidence)
 SELECT 'campaign_house',h.id,btrim(h.lord_name),h.id,
  jsonb_build_object('house_name',h.name,'field','lord_name','source','campaign_houses')
 FROM public.campaign_houses h
 WHERE nullif(btrim(coalesce(h.lord_name,'')),'') IS NOT NULL
 ON CONFLICT(source_kind,source_key) DO NOTHING;
 GET DIAGNOSTICS added_houses=ROW_COUNT;

 INSERT INTO public.character_review_queue(
  source_kind,source_key,proposed_name,house_id,evidence,source_visibility)
 SELECT 'campaign_record',r.id::text,
  left(btrim(regexp_replace(r.title,'^Ficha (do|de) (Personagem|Lorde)\s*[—–-]\s*','','i')),180),
  r.house_id,
  jsonb_build_object('record_title',left(r.title,240),'field','title','kind',r.kind,
    'source','campaign_records','visibility',r.visibility),
  CASE WHEN r.visibility IN ('house','player','gm') THEN r.visibility ELSE 'gm' END
 FROM public.campaign_records r
 WHERE r.kind='character' AND r.house_id IS NOT NULL AND
   nullif(btrim(r.title),'') IS NOT NULL
 ON CONFLICT(source_kind,source_key) DO NOTHING;
 GET DIAGNOSTICS added_records=ROW_COUNT;

 INSERT INTO public.character_review_queue(
  source_kind,source_key,proposed_name,house_id,evidence)
 SELECT 'campaign_player_roster',p.id::text,btrim(p.lord_name),p.roster_house_id,
  jsonb_build_object('field','lord_name','source','campaign_players')
 FROM public.campaign_players p
 WHERE p.roster_house_id IS NOT NULL AND nullif(btrim(coalesce(p.lord_name,'')),'') IS NOT NULL
 ON CONFLICT(source_kind,source_key) DO NOTHING;
 GET DIAGNOSTICS added_roster=ROW_COUNT;
 RETURN jsonb_build_object('houses_staged',added_houses,'records_staged',added_records,
  'roster_staged',added_roster);
END $$;
REVOKE ALL ON FUNCTION public.stage_campaign_character_sources() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.stage_campaign_character_sources() TO authenticated;

-- Imports a reviewed *manifest* from the repository/Atlas, never creates people.
-- The caller cannot overwrite an already-reviewed/linked source.
CREATE OR REPLACE FUNCTION public.import_character_source_candidates(p_candidates jsonb)
RETURNS integer LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE item jsonb; inserted integer:=0; source_id text;kind text;name text;house text;
BEGIN
 IF NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Apenas Narrador pode importar candidatos'; END IF;
 IF jsonb_typeof(p_candidates)<>'array' OR jsonb_array_length(p_candidates)>500 THEN
  RAISE EXCEPTION 'Envie uma lista de até 500 fontes'; END IF;
 FOR item IN SELECT value FROM jsonb_array_elements(p_candidates) LOOP
  kind:=item->>'source_kind';source_id:=btrim(coalesce(item->>'source_key',''));
  name:=btrim(coalesce(item->>'proposed_name',''));
  house:=nullif(btrim(coalesce(item->>'house_id','')),'');
  IF kind NOT IN ('house_catalog','archive_history','legacy_sheet','other') OR
     length(source_id) NOT BETWEEN 1 AND 512 OR length(name) NOT BETWEEN 1 AND 180 THEN
   RAISE EXCEPTION 'Fonte de importação inválida'; END IF;
  IF house IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.campaign_houses WHERE id=house) THEN
   RAISE EXCEPTION 'Casa oficial não encontrada: %',house; END IF;
  INSERT INTO public.character_review_queue(
    source_kind,source_key,proposed_name,house_id,
    claimed_birth_year,claimed_age,claimed_age_year,evidence,source_visibility)
  VALUES(kind,source_id,name,house,
   (item->>'claimed_birth_year')::integer,(item->>'claimed_age')::integer,
   (item->>'claimed_age_year')::integer,
   coalesce(item->'evidence','{}'::jsonb),'public')
  ON CONFLICT(source_kind,source_key) DO NOTHING;
  inserted:=inserted+CASE WHEN FOUND THEN 1 ELSE 0 END;
 END LOOP;
 RETURN inserted;
END $$;
REVOKE ALL ON FUNCTION public.import_character_source_candidates(jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.import_character_source_candidates(jsonb) TO authenticated;

-- Review never merges candidates by name. Explicit source_kind + source_key
-- unique mapping is required, under a single transaction and actor.
CREATE OR REPLACE FUNCTION public.review_character_source(
 p_queue_id uuid,p_action text,p_character_id uuid DEFAULT NULL,
 p_reason text DEFAULT ''
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE q public.character_review_queue; c public.campaign_characters; actor_id uuid; existing uuid;
BEGIN
 IF NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Revisão restrita ao Narrador'; END IF;
 actor_id:=auth.uid();
 IF p_action NOT IN ('link','ignore','conflict','reopen') OR length(btrim(p_reason))<10 THEN
  RAISE EXCEPTION 'Escolha a ação e informe justificativa de pelo menos dez caracteres'; END IF;
 SELECT * INTO q FROM public.character_review_queue WHERE id=p_queue_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Fonte candidata não localizada'; END IF;
 IF q.status='linked' AND p_action<>'link' THEN
  RAISE EXCEPTION 'Fonte já vinculada: use uma correção auditada de identidade'; END IF;
 IF p_action='link' THEN
  IF p_character_id IS NULL THEN RAISE EXCEPTION 'Selecione pessoa canônica'; END IF;
  SELECT * INTO c FROM public.campaign_characters WHERE id=p_character_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pessoa canônica não localizada'; END IF;
  IF q.house_id IS NOT NULL AND c.house_id IS NOT NULL AND q.house_id<>c.house_id THEN
   RAISE EXCEPTION 'Casa divergente: revisão manual antes do vínculo'; END IF;
  SELECT character_id INTO existing FROM public.character_source_links
  WHERE source_kind=q.source_kind AND source_key=q.source_key;
  IF existing IS NOT NULL AND existing<>p_character_id THEN
   RAISE EXCEPTION 'Fonte já pertence a outra pessoa; conciliação obrigatória'; END IF;
  INSERT INTO public.character_source_links(
   character_id,source_kind,source_key,source_visibility,source_reference,confirmed_by)
  VALUES(p_character_id,q.source_kind,q.source_key,q.source_visibility,q.evidence,actor_id)
  ON CONFLICT(source_kind,source_key) DO NOTHING;
 ELSIF p_character_id IS NOT NULL THEN
  RAISE EXCEPTION 'Somente a ação link aceita identidade canônica'; END IF;
 UPDATE public.character_review_queue SET status=CASE p_action
  WHEN 'link' THEN 'linked' WHEN 'ignore' THEN 'ignored'
  WHEN 'conflict' THEN 'conflict' ELSE 'pending' END,
  character_id=CASE WHEN p_action='link' THEN p_character_id ELSE NULL END,
  review_note=btrim(p_reason),reviewed_by=actor_id,reviewed_at=now(),updated_at=now()
 WHERE id=p_queue_id;
 INSERT INTO public.character_registry_audit(actor,action,character_id,source_kind,source_key,
  before_state,after_state,reason)
 VALUES(actor_id,'source_'||p_action,p_character_id,q.source_kind,q.source_key,
  to_jsonb(q),
  (SELECT to_jsonb(x) FROM public.character_review_queue x WHERE x.id=p_queue_id),p_reason);
 RETURN jsonb_build_object('source_kind',q.source_kind,'source_key',q.source_key,
  'status',CASE p_action WHEN 'link' THEN 'linked' WHEN 'ignore' THEN 'ignored'
   WHEN 'conflict' THEN 'conflict' ELSE 'pending' END,'character_id',p_character_id);
END $$;
REVOKE ALL ON FUNCTION public.review_character_source(uuid,text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.review_character_source(uuid,text,uuid,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.save_campaign_character(
 p_id uuid,p_version integer,p_payload jsonb,p_reason text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public AS $$
DECLARE actor_id uuid; old public.campaign_characters; saved public.campaign_characters;
 name text; house text; birth integer; base_age integer; base_year integer;
 death integer; age_policy_value text; note text; visibility_value text; owner_id uuid;
 status text; born_date text; dead_date text; previous_status text;
BEGIN
 IF NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Cadastro canônico exclusivo do Narrador'; END IF;
 actor_id:=auth.uid();
 IF jsonb_typeof(p_payload)<>'object' OR length(btrim(coalesce(p_reason,'')))<10 THEN
  RAISE EXCEPTION 'Cadastro e justificativa de pelo menos dez caracteres obrigatórios'; END IF;
 name:=btrim(coalesce(p_payload->>'display_name',''));
 IF length(name) NOT BETWEEN 1 AND 180 THEN RAISE EXCEPTION 'Nome canônico inválido'; END IF;
 house:=nullif(p_payload->>'house_id','');
 IF house IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.campaign_houses WHERE id=house) THEN
  RAISE EXCEPTION 'Casa oficial inexistente'; END IF;
 birth:=(p_payload->>'birth_year')::integer;
 base_age:=(p_payload->>'baseline_age')::integer;
 base_year:=(p_payload->>'baseline_year')::integer;
 death:=(p_payload->>'death_year')::integer;
 born_date:=nullif(p_payload->>'birth_date','');
 dead_date:=nullif(p_payload->>'death_date','');
 age_policy_value:=coalesce(p_payload->>'age_policy','year_turn');
 visibility_value:=coalesce(p_payload->>'visibility','gm');
 owner_id:=(p_payload->>'owner_user_id')::uuid;
 note:=coalesce(p_payload->>'review_note','');
 IF p_id IS NOT NULL THEN
  SELECT * INTO old FROM public.campaign_characters WHERE id=p_id FOR UPDATE;
  IF NOT FOUND OR p_version IS DISTINCT FROM old.version THEN
   RAISE EXCEPTION 'Pessoa alterada em outra sessão; atualize antes de gravar'; END IF;
 ELSE
  IF p_version IS NOT NULL THEN RAISE EXCEPTION 'Cadastro novo não deve ter versão'; END IF;
 END IF;
 -- Conflicting birth and baseline are NOT resolved by guessing; mark for review.
 status:=coalesce(p_payload->>'review_status','pending');
 IF birth IS NOT NULL AND base_age IS NOT NULL AND base_year IS NOT NULL AND
    base_age<>base_year-birth THEN
  status:='conflict';
  note:=concat_ws(' ',note,'Inconsistência entre nascimento e idade de referência.');
 END IF;
 IF age_policy_value='manual_exception' AND length(btrim(coalesce(p_payload->>'age_exception_note','')))<10 THEN
  RAISE EXCEPTION 'Exceção etária exige justificativa específica'; END IF;
 IF p_id IS NULL THEN
  INSERT INTO public.campaign_characters(
   display_name,aliases,house_id,noble_roles,race,is_noble,birth_year,birth_date,
   baseline_age,baseline_year,age_policy,age_exception_note,apparent_age,
   alive_status,death_year,death_date,visibility,owner_user_id,confidence,review_status,
   review_note,created_by,updated_by)
  VALUES(name,ARRAY(SELECT jsonb_array_elements_text(coalesce(p_payload->'aliases','[]'::jsonb))),
   house,ARRAY(SELECT jsonb_array_elements_text(coalesce(p_payload->'noble_roles','[]'::jsonb))),
   nullif(p_payload->>'race',''),coalesce((p_payload->>'is_noble')::boolean,true),
   birth,born_date,base_age,base_year,age_policy_value,nullif(p_payload->>'age_exception_note',''),
   nullif(p_payload->>'apparent_age',''),
   coalesce(p_payload->>'alive_status','unknown'),death,dead_date,
   visibility_value,owner_id,coalesce(p_payload->>'confidence','unverified'),status,
   note,actor_id,actor_id) RETURNING * INTO saved;
 ELSE
  UPDATE public.campaign_characters SET
   display_name=name,
   aliases=ARRAY(SELECT jsonb_array_elements_text(coalesce(p_payload->'aliases','[]'::jsonb))),
   house_id=house,
   noble_roles=ARRAY(SELECT jsonb_array_elements_text(coalesce(p_payload->'noble_roles','[]'::jsonb))),
   race=nullif(p_payload->>'race',''),
   is_noble=coalesce((p_payload->>'is_noble')::boolean,true),
   birth_year=birth,birth_date=born_date,baseline_age=base_age,baseline_year=base_year,
   age_policy=age_policy_value,age_exception_note=nullif(p_payload->>'age_exception_note',''),
   apparent_age=nullif(p_payload->>'apparent_age',''),
   alive_status=coalesce(p_payload->>'alive_status','unknown'),death_year=death,death_date=dead_date,
   visibility=visibility_value,owner_user_id=owner_id,
   confidence=coalesce(p_payload->>'confidence','unverified'),review_status=status,
   review_note=note,version=version+1,updated_by=actor_id,updated_at=now()
  WHERE id=p_id RETURNING * INTO saved;
 END IF;
 INSERT INTO public.character_registry_audit(actor,action,character_id,before_state,after_state,reason)
 VALUES(actor_id,CASE WHEN old.id IS NULL THEN 'create' ELSE 'update' END,saved.id,
  CASE WHEN old.id IS NULL THEN NULL ELSE to_jsonb(old) END,to_jsonb(saved),p_reason);
 RETURN jsonb_build_object('id',saved.id,'version',saved.version,'review_status',saved.review_status);
END $$;
REVOKE ALL ON FUNCTION public.save_campaign_character(uuid,integer,jsonb,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.save_campaign_character(uuid,integer,jsonb,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_character_registry_hub(p_limit integer DEFAULT 150)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE people jsonb;queue jsonb;pending_total bigint;
BEGIN
 IF NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Registro canônico restrito ao Narrador'; END IF;
 IF p_limit NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Limite inválido'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(c) ORDER BY display_name),'[]'::jsonb) INTO people
 FROM (SELECT * FROM public.campaign_characters ORDER BY display_name LIMIT p_limit) c;
 SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY created_at,source_key),'[]'::jsonb) INTO queue
 FROM (SELECT * FROM public.character_review_queue WHERE status IN ('pending','conflict')
 ORDER BY created_at,source_key LIMIT p_limit) q;
 SELECT count(*) INTO pending_total FROM public.character_review_queue
  WHERE status IN ('pending','conflict');
 RETURN jsonb_build_object('characters',people,'pending',queue,'pending_total',pending_total,
  'count',(SELECT count(*) FROM public.campaign_characters));
END $$;
REVOKE ALL ON FUNCTION public.get_character_registry_hub(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_character_registry_hub(integer) TO authenticated;

COMMIT;
