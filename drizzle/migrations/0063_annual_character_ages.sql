-- Lote 7: idade cronológica derivada do ano de Harptos.
-- Nenhuma coluna "idade atual" é gravada nem incrementada em campaign_characters.
BEGIN;
SET LOCAL lock_timeout='5s';

-- Motor interno recebe somente a linha canônica passada por funções autorizadas.
-- Revogado de PostgREST; não faz SELECT de pessoas por identidade.
CREATE OR REPLACE FUNCTION public.character_age_state(
 p_character public.campaign_characters,p_year integer
) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=public AS $$
DECLARE b integer; age_value integer; event_year integer; status text; source_count integer;
BEGIN
 IF p_year NOT BETWEEN 1 AND 9999 THEN RAISE EXCEPTION 'Ano de consulta inválido'; END IF;
 IF p_character.id IS NULL THEN RAISE EXCEPTION 'Pessoa canônica obrigatória'; END IF;
 SELECT count(*) INTO source_count FROM public.character_source_links
  WHERE character_id=p_character.id;
 IF p_character.review_status='conflict' THEN status:='conflict';
 ELSIF p_character.review_status<>'reviewed' THEN status:='pending_review';
 ELSIF p_character.confidence NOT IN ('supported','confirmed') THEN status:='unverified';
 ELSIF source_count=0 THEN status:='pending_source';
 ELSIF p_character.age_policy='manual_exception' THEN status:='manual_exception';
 ELSIF p_character.birth_year IS NULL AND p_character.baseline_age IS NULL THEN status:='unknown_birth';
 ELSIF p_character.birth_year IS NOT NULL AND p_character.baseline_age IS NOT NULL
   AND p_character.baseline_age<>(p_character.baseline_year-p_character.birth_year) THEN status:='conflict';
 ELSIF p_character.alive_status='unknown' THEN status:='unknown_life';
 ELSIF p_character.alive_status='deceased' AND p_character.death_year IS NULL THEN status:='unknown_death';
 ELSIF p_character.alive_status='alive' AND p_character.death_year IS NOT NULL THEN status:='conflict';
 ELSIF p_character.death_year IS NOT NULL AND p_character.birth_year IS NOT NULL
   AND p_character.death_year<p_character.birth_year THEN status:='conflict';
 ELSE status:='ok'; END IF;
 b:=coalesce(p_character.birth_year,p_character.baseline_year-p_character.baseline_age);
 IF b IS NOT NULL AND b<1 THEN status:='conflict'; END IF;
 IF status<>'ok' THEN
  RETURN jsonb_build_object('status',status,'age',NULL,'as_of_year',p_year,
   'life',p_character.alive_status,'reason','Registro requer validação do Narrador');
 END IF;
 IF p_year<b THEN
  RETURN jsonb_build_object('status','not_born','age',NULL,'as_of_year',p_year,
   'life',p_character.alive_status,'reason','Nascimento posterior ao ano consultado');
 END IF;
 event_year:=CASE WHEN p_character.alive_status='deceased'
  THEN least(p_year,p_character.death_year) ELSE p_year END;
 age_value:=event_year-b;
 IF age_value<0 THEN
  RETURN jsonb_build_object('status','not_born','age',NULL,'as_of_year',p_year,
   'life',p_character.alive_status,'reason','Pessoa ainda não nascida');
 END IF;
 RETURN jsonb_build_object(
  'status',CASE WHEN p_character.alive_status='deceased'
   AND p_year>=p_character.death_year THEN 'deceased' ELSE 'ok' END,
  'age',age_value,'as_of_year',p_year,'birth_year',b,
  'life',CASE WHEN p_character.alive_status='deceased' AND p_year<p_character.death_year
   THEN 'alive' ELSE p_character.alive_status END,'death_year',p_character.death_year,
  'reason',CASE WHEN p_character.alive_status='deceased'
   AND p_year>=p_character.death_year THEN 'Idade conservada no falecimento'
   ELSE 'Idade cronológica calculada por ano de Harptos' END);
END $$;
REVOKE ALL ON FUNCTION public.character_age_state(public.campaign_characters,integer)
 FROM PUBLIC,anon,authenticated;

-- Projeção privada de prévia para o Narrador, sem limite falso para contagens.
CREATE OR REPLACE FUNCTION public.get_character_age_dashboard(
 p_year integer DEFAULT NULL,p_target_year integer DEFAULT NULL,p_limit integer DEFAULT 300
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE year_now integer; year_target integer; rows_json jsonb; totals jsonb;
BEGIN
 IF NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Idades e genealogias restritas ao Narrador'; END IF;
 SELECT year INTO year_now FROM public.campaign_calendar WHERE id=true;
 year_now:=coalesce(p_year,year_now);
 year_target:=coalesce(p_target_year,least(year_now+1,9999));
 IF year_now NOT BETWEEN 1 AND 9999 OR year_target NOT BETWEEN 1 AND 9999
  OR p_limit NOT BETWEEN 1 AND 2000 THEN
  RAISE EXCEPTION 'Ano ou limite de prévia inválido'; END IF;
 WITH ages AS MATERIALIZED (
  SELECT c.id,c.display_name,c.house_id,c.noble_roles,c.race,c.is_noble,
   c.visibility,c.alive_status,c.confidence,c.review_status,c.birth_year,
   c.death_year,c.age_policy,
   public.character_age_state(c,year_now) AS before_age,
   public.character_age_state(c,year_target) AS after_age
  FROM public.campaign_characters c
 ), summary AS (
  SELECT count(*)::integer total,
   count(*) FILTER(WHERE is_noble)::integer nobles,
   count(*) FILTER(WHERE alive_status='alive')::integer alive,
   count(*) FILTER(WHERE alive_status='deceased')::integer deceased,
   count(*) FILTER(WHERE before_age->>'status'='conflict'
     OR after_age->>'status'='conflict')::integer conflicts,
   count(*) FILTER(WHERE before_age->>'status' NOT IN ('ok','deceased','not_born')
     OR after_age->>'status' NOT IN ('ok','deceased','not_born'))::integer pending,
   count(*) FILTER(WHERE before_age->>'status'='not_born'
     OR after_age->>'status'='not_born')::integer not_born,
   count(*) FILTER(WHERE ((before_age->>'age') IS NULL
       AND before_age->>'status'<>'not_born')
     OR ((after_age->>'age') IS NULL
       AND after_age->>'status'<>'not_born'))::integer unknown,
   count(*) FILTER(WHERE is_noble AND alive_status='alive'
     AND before_age->>'status'='ok' AND after_age->>'status'='ok'
     AND (after_age->>'age')::integer>(before_age->>'age')::integer)::integer aged_nobles
  FROM ages
 )
 SELECT to_jsonb(summary) INTO totals FROM summary;
 WITH ages AS (
  SELECT c.id,c.display_name,c.house_id,c.noble_roles,c.race,c.is_noble,
   c.visibility,c.alive_status,c.confidence,c.review_status,c.birth_year,c.death_year,
   public.character_age_state(c,year_now) AS before_age,
   public.character_age_state(c,year_target) AS after_age
  FROM public.campaign_characters c ORDER BY c.display_name,c.id LIMIT p_limit
 )
 SELECT coalesce(jsonb_agg(to_jsonb(ages) ORDER BY display_name,id),'[]'::jsonb)
 INTO rows_json FROM ages;
 RETURN jsonb_build_object('current_year',year_now,'target_year',year_target,
  'totals',totals,'characters',rows_json,'truncated',(totals->>'total')::integer>p_limit);
END $$;
REVOKE ALL ON FUNCTION public.get_character_age_dashboard(integer,integer,integer)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_character_age_dashboard(integer,integer,integer)
 TO authenticated;

-- Leitura privada por fonte explicitamente vinculada à ficha do personagem.
-- Só expõe idade da pessoa vinculada quando o próprio registro da ficha é
-- visível à Casa; um vínculo gm ou player não se torna público.
CREATE OR REPLACE FUNCTION public.get_house_character_ages(p_house text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE current_year integer; result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active() THEN
  RAISE EXCEPTION 'Sessão da campanha necessária'; END IF;
 IF NOT public.is_campaign_admin() AND NOT public.in_campaign_house(p_house,false) THEN
  RAISE EXCEPTION 'Pessoa não autorizada a consultar esta Casa'; END IF;
 SELECT year INTO current_year FROM public.campaign_calendar WHERE id=true;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'record_id',r.id,'character_id',c.id,'as_of_year',current_year,
  'status',public.character_age_state(c,current_year)->>'status',
  'age',public.character_age_state(c,current_year)->'age',
  'death_year',c.death_year) ORDER BY r.id),'[]'::jsonb)
 INTO result
 FROM public.character_source_links l
 JOIN public.campaign_characters c ON c.id=l.character_id
 JOIN public.campaign_records r ON l.source_kind='campaign_record' AND l.source_key=r.id::text
 WHERE r.house_id=p_house AND r.kind='character'
 AND (public.is_campaign_admin()
  OR (r.visibility='house' AND l.source_visibility='house'
    AND c.visibility='house' AND public.in_campaign_house(r.house_id,false))
  OR (r.visibility='player' AND l.source_visibility='player'
    AND c.visibility='player' AND c.owner_user_id=auth.uid()
    AND EXISTS(SELECT 1 FROM public.campaign_players cp
     WHERE cp.id=r.player_id AND cp.user_id=auth.uid())));
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_house_character_ages(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_house_character_ages(text) TO authenticated;

-- Idade é derivada, mas a passagem anual gera um evento AUDITÁVEL,
-- exatamente uma vez por fronteira de ano, por versão da publicação.
CREATE TABLE public.character_year_transitions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 calendar_version integer NOT NULL CHECK(calendar_version>=1),
 from_year integer NOT NULL CHECK(from_year BETWEEN 1 AND 9999),
 to_year integer NOT NULL CHECK(to_year BETWEEN 1 AND 9999),
 actor uuid NOT NULL REFERENCES auth.users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(abs(to_year-from_year)=1),
 UNIQUE(calendar_version,from_year,to_year)
);
ALTER TABLE public.character_year_transitions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.character_year_transitions FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.character_year_transitions TO authenticated;
CREATE POLICY character_year_transitions_admin_read
 ON public.character_year_transitions FOR SELECT TO authenticated
 USING(public.is_campaign_admin());

CREATE OR REPLACE FUNCTION public.audit_character_year_transition()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i integer; delta integer;
BEGIN
 IF NEW.year=OLD.year THEN RETURN NEW; END IF;
 IF auth.uid() IS NULL OR NOT public.is_campaign_admin() THEN
  RAISE EXCEPTION 'Mudança anual exige Narrador autorizado'; END IF;
 delta:=CASE WHEN NEW.year>OLD.year THEN 1 ELSE -1 END;
 FOR i IN SELECT generate_series(OLD.year,NEW.year-delta,delta) LOOP
  INSERT INTO public.character_year_transitions(calendar_version,from_year,to_year,actor)
  VALUES(NEW.version,i,i+delta,auth.uid())
  ON CONFLICT(calendar_version,from_year,to_year) DO NOTHING;
 END LOOP;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.audit_character_year_transition() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS audit_character_year_transition ON public.campaign_calendar;
CREATE TRIGGER audit_character_year_transition
 AFTER UPDATE OF year ON public.campaign_calendar
 FOR EACH ROW WHEN (OLD.year IS DISTINCT FROM NEW.year)
 EXECUTE FUNCTION public.audit_character_year_transition();

CREATE OR REPLACE FUNCTION public.get_character_year_transitions(p_limit integer DEFAULT 30)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE result jsonb;
BEGIN
 IF NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Auditoria anual exclusiva do Narrador'; END IF;
 IF p_limit NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'Limite inválido'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC,t.id DESC),'[]'::jsonb)
 INTO result FROM (
  SELECT * FROM public.character_year_transitions
  ORDER BY created_at DESC,id DESC LIMIT p_limit
 ) t;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.get_character_year_transitions(integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.get_character_year_transitions(integer) TO authenticated;
COMMIT;
