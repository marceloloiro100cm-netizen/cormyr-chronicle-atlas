-- 0104 | Cormyr · Dossiês de espionagem — lotes 1–3.
-- Pré-requisitos: 0087, 0089, 0093, 0102, 0103; execução na sequência homologada.
-- Não altera o cálculo de deslocamento, a dificuldade ou a rolagem do Narrador.
-- Não expõe segredos por SELECT no navegador. Missões Exército/Posses
-- preservam a capacidade de revelação até a integração do catálogo no lote 4.
BEGIN;
SET LOCAL lock_timeout = '8s';

CREATE TABLE IF NOT EXISTS public.spy_intelligence_dossiers (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_house_id text NOT NULL REFERENCES public.campaign_houses(id),
 target_house_id text NOT NULL REFERENCES public.house_catalog(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT spy_intelligence_pair_unique UNIQUE(owner_house_id,target_house_id),
 CONSTRAINT spy_intelligence_no_self CHECK(owner_house_id<>target_house_id)
);
CREATE INDEX IF NOT EXISTS spy_intelligence_by_target
 ON public.spy_intelligence_dossiers(target_house_id);

CREATE TABLE IF NOT EXISTS public.spy_intelligence_findings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 dossier_id uuid NOT NULL REFERENCES public.spy_intelligence_dossiers(id),
 objective text NOT NULL CHECK(objective IN('house_resources','army','possessions')),
 subject_key text NOT NULL CHECK(length(subject_key) BETWEEN 1 AND 160),
 value_snapshot jsonb NOT NULL CHECK(jsonb_typeof(value_snapshot)='object'),
 discovered_operation_id uuid NOT NULL REFERENCES public.spy_operations(id),
 verified_operation_id uuid NOT NULL REFERENCES public.spy_operations(id),
 discovered_date_key text NOT NULL CHECK(public.valid_campaign_date(discovered_date_key)),
 verified_date_key text NOT NULL CHECK(public.valid_campaign_date(verified_date_key)),
 discovered_at timestamptz NOT NULL DEFAULT now(),
 verified_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT spy_intelligence_finding_unique UNIQUE(dossier_id,objective,subject_key),
 CONSTRAINT spy_intelligence_resource_key CHECK(
  objective<>'house_resources' OR subject_key IN
   ('defense','influence','lands','law','power','population','wealth'))
);
CREATE INDEX IF NOT EXISTS spy_intelligence_findings_dossier
 ON public.spy_intelligence_findings(dossier_id,objective);

-- Uma operação é contabilizada uma única vez, com resultado e data imutáveis.
-- waiting_catalog mantém Exército/Posses preparados para materialização
-- somente após a fonte autoritativa do lote 4 ser conectada.
CREATE TABLE IF NOT EXISTS public.spy_intelligence_mission_awards (
 operation_id uuid PRIMARY KEY REFERENCES public.spy_operations(id),
 dossier_id uuid NOT NULL REFERENCES public.spy_intelligence_dossiers(id),
 objective text NOT NULL CHECK(objective IN('house_resources','army','possessions')),
 success_degrees integer NOT NULL CHECK(success_degrees BETWEEN 0 AND 4),
 reveal_capacity integer NOT NULL CHECK(reveal_capacity BETWEEN 3 AND 7),
 revealed_count integer NOT NULL DEFAULT 0 CHECK(revealed_count BETWEEN 0 AND 7),
 refreshed_count integer NOT NULL DEFAULT 0 CHECK(refreshed_count BETWEEN 0 AND 7),
 processing_state text NOT NULL CHECK(processing_state IN('complete','waiting_catalog')),
 campaign_date_key text NOT NULL CHECK(public.valid_campaign_date(campaign_date_key)),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK(revealed_count+refreshed_count<=reveal_capacity)
);

CREATE TABLE IF NOT EXISTS public.spy_intelligence_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 dossier_id uuid NOT NULL REFERENCES public.spy_intelligence_dossiers(id),
 operation_id uuid NOT NULL REFERENCES public.spy_operations(id),
 objective text NOT NULL CHECK(objective IN('house_resources','army','possessions')),
 subject_key text NOT NULL,
 event_type text NOT NULL CHECK(event_type IN('revealed','refreshed')),
 previous_snapshot jsonb,
 new_snapshot jsonb NOT NULL CHECK(jsonb_typeof(new_snapshot)='object'),
 campaign_date_key text NOT NULL CHECK(public.valid_campaign_date(campaign_date_key)),
 calendar_version integer NOT NULL CHECK(calendar_version>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(operation_id,objective,subject_key,event_type)
);

-- Segurança explícita: nem mesmo contadores reais de unidades/posses
-- ficam consultáveis por usuários. O lote 5 publicará RPC filtrada por Casa.
ALTER TABLE public.spy_intelligence_dossiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spy_intelligence_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spy_intelligence_mission_awards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spy_intelligence_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.spy_intelligence_dossiers FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.spy_intelligence_findings FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.spy_intelligence_mission_awards FROM PUBLIC,anon,authenticated;
REVOKE ALL ON public.spy_intelligence_events FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.spy_intelligence_dossiers TO service_role;
GRANT SELECT ON public.spy_intelligence_findings TO service_role;
GRANT SELECT ON public.spy_intelligence_mission_awards TO service_role;
GRANT SELECT ON public.spy_intelligence_events TO service_role;

-- Novo contrato explícito para cada missão de Casa. Chama a RPC anterior:
-- preserva TODAS as proteções existentes de rota, prazo, posse e idempotência.
CREATE OR REPLACE FUNCTION public.spy_submit_house_mission(
 p_house text,p_agent uuid,p_target text,p_destination text,
 p_expected_agent_version integer,p_expected_calendar_version integer,
 p_request_key uuid,p_objective text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,pg_temp AS $submit$
DECLARE v_result jsonb;v_op uuid;v_fields text[];
BEGIN
 IF p_objective IS NULL OR p_objective NOT IN
  ('house_resources','army','possessions')
 THEN RAISE EXCEPTION 'Objetivo de espionagem inválido'; END IF;
 v_result:=public.spy_submit_house_mission(
  p_house,p_agent,p_target,p_destination,
  p_expected_agent_version,p_expected_calendar_version,p_request_key);
 v_op:=(v_result->>'operationId')::uuid;
 SELECT o.requested_fields INTO v_fields
 FROM public.spy_operations o
 WHERE o.id=v_op AND o.owner_house_id=p_house FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ordem de espionagem ausente'; END IF;
 IF (v_result->>'alreadyApplied')::boolean THEN
  IF v_fields<>ARRAY[p_objective]::text[] AND
   NOT(v_fields=ARRAY['house_overview']::text[] AND p_objective='house_resources')
  THEN RAISE EXCEPTION 'Objetivo diverge da solicitação original'; END IF;
 ELSE
  UPDATE public.spy_operations SET requested_fields=ARRAY[p_objective]::text[]
   WHERE id=v_op AND owner_house_id=p_house
    AND requested_fields=ARRAY['house_overview']::text[];
  IF NOT FOUND THEN RAISE EXCEPTION 'Objetivo não pôde ser registrado'; END IF;
 END IF;
 RETURN v_result||jsonb_build_object('objective',p_objective);
END $submit$;
REVOKE ALL ON FUNCTION public.spy_submit_house_mission(
 text,uuid,text,text,integer,integer,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spy_submit_house_mission(
 text,uuid,text,text,integer,integer,uuid,text) TO authenticated;

-- Cada grau adicional é obtido da margem POSITIVA da mesma rolagem
-- homologada pelo Narrador (um grau a cada 5 acima da dificuldade).
CREATE OR REPLACE FUNCTION public.spy_intelligence_capacity(p_margin integer)
RETURNS integer LANGUAGE sql IMMUTABLE STRICT SET search_path=public,pg_temp AS $capacity$
 SELECT 3+least(4,greatest(0,floor(p_margin::numeric/5)::integer));
$capacity$;

-- O gatilho é executado NO MESMO COMMIT da decisão homologada; não há
-- requisição de jogador capaz de inventar descobertas.
CREATE OR REPLACE FUNCTION public.spy_intelligence_on_decision()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $award$
DECLARE
 v_op record;v_objective text;v_dossier uuid;v_day text;v_calendar integer;
 v_capacity integer;v_degrees integer;v_margin integer;v_stats jsonb;
 v_attr text;v_snapshot jsonb;v_old jsonb;v_new integer:=0;v_refreshed integer:=0;
BEGIN
 IF NEW.resolution<>'success' THEN RETURN NEW; END IF;
 SELECT o.* INTO v_op FROM public.spy_operations o
 WHERE o.id=NEW.operation_id AND o.target_type='house'
  AND o.status='completed';
 IF NOT FOUND THEN RETURN NEW; END IF;
 v_objective:=coalesce(v_op.requested_fields[1],'house_overview');
 IF v_objective='house_overview' THEN v_objective:='house_resources'; END IF;
 IF v_objective NOT IN('house_resources','army','possessions') THEN RETURN NEW; END IF;
 IF NOT (NEW.modifiers ? 'roll') OR NOT (NEW.modifiers ? 'modifier')
 THEN RAISE EXCEPTION 'Resultado da missão sem dados de rolagem'; END IF;
 v_margin:=(NEW.modifiers->>'roll')::integer+
  (NEW.modifiers->>'modifier')::integer-NEW.difficulty;
 IF v_margin<0 THEN RETURN NEW; END IF;
 v_capacity:=public.spy_intelligence_capacity(v_margin);
 v_degrees:=v_capacity-3;
 v_day:=public.spy_official_date_key();
 SELECT version INTO v_calendar FROM public.campaign_calendar WHERE id=true;
 IF NOT public.valid_campaign_date(v_day) OR v_calendar IS NULL
 THEN RAISE EXCEPTION 'Data de campanha inválida para descoberta'; END IF;
 -- A restrição UNIQUE protege dossiês também contra missões concorrentes.
 INSERT INTO public.spy_intelligence_dossiers(owner_house_id,target_house_id)
 VALUES(v_op.owner_house_id,v_op.target_id)
 ON CONFLICT(owner_house_id,target_house_id)
 DO UPDATE SET updated_at=now()
 RETURNING id INTO v_dossier;
 IF EXISTS(SELECT 1 FROM public.spy_intelligence_mission_awards
  WHERE operation_id=NEW.operation_id) THEN RETURN NEW; END IF;

 -- No lote 3, Recursos já se liga à planilha homologada dos 7 atributos.
 -- Na ausência de fonte oficial, não estimar nem inventar valores.
 -- A conexão às fichas operacionais e aos inventários é parte do lote 4.
 IF v_objective='house_resources' THEN
  -- Uma ficha operacional ativa pode conter bônus, missivas e construções
  -- posteriores à planilha; não substituir o valor atual por dado antigo.
  -- A conexão exata com balances(state) será feita no lote 4.
  IF NOT EXISTS(
   SELECT 1 FROM public.noble_house_sheets n
   WHERE n.house_id=v_op.target_id AND n.state IS NOT NULL
  ) THEN
   SELECT to_jsonb(s) INTO v_stats FROM public.spy_noble_house_stats s
    WHERE s.house_id=v_op.target_id;
  END IF;
 END IF;
 IF v_stats IS NULL THEN
  INSERT INTO public.spy_intelligence_mission_awards(
   operation_id,dossier_id,objective,success_degrees,reveal_capacity,
   processing_state,campaign_date_key)
  VALUES(NEW.operation_id,v_dossier,v_objective,v_degrees,v_capacity,
   'waiting_catalog',v_day);
  RETURN NEW;
 END IF;

 -- Primeiro os atributos DESCONHECIDOS, nunca duplicados.
 FOR v_attr IN
  SELECT k.attribute FROM unnest(ARRAY[
   'defense','influence','lands','law','power','population','wealth'
  ]::text[]) AS k(attribute)
  WHERE v_stats ? k.attribute
   AND NOT EXISTS(
    SELECT 1 FROM public.spy_intelligence_findings f
    WHERE f.dossier_id=v_dossier AND f.objective=v_objective
     AND f.subject_key=k.attribute)
  ORDER BY md5(NEW.operation_id::text||':'||k.attribute)
  LIMIT v_capacity
 LOOP
  v_snapshot:=jsonb_build_object('value',(v_stats->>v_attr)::integer,
   'source','official_noble_stats');
  INSERT INTO public.spy_intelligence_findings(
   dossier_id,objective,subject_key,value_snapshot,
   discovered_operation_id,verified_operation_id,
   discovered_date_key,verified_date_key)
  VALUES(v_dossier,v_objective,v_attr,v_snapshot,
   NEW.operation_id,NEW.operation_id,v_day,v_day);
  INSERT INTO public.spy_intelligence_events(
   dossier_id,operation_id,objective,subject_key,event_type,
   new_snapshot,campaign_date_key,calendar_version)
  VALUES(v_dossier,NEW.operation_id,v_objective,v_attr,'revealed',
   v_snapshot,v_day,v_calendar);
  v_new:=v_new+1;
 END LOOP;
 -- Capacidade sobrante serve para revalidar atributos JÁ conhecidos.
 IF v_new<v_capacity THEN
  FOR v_attr,v_old IN
   SELECT f.subject_key,f.value_snapshot
   FROM public.spy_intelligence_findings f
   WHERE f.dossier_id=v_dossier AND f.objective=v_objective
    AND f.discovered_operation_id<>NEW.operation_id
   ORDER BY md5(NEW.operation_id::text||':'||f.subject_key)
   LIMIT (v_capacity-v_new)
  LOOP
   v_snapshot:=jsonb_build_object('value',(v_stats->>v_attr)::integer,
    'source','official_noble_stats');
   UPDATE public.spy_intelligence_findings SET
    value_snapshot=v_snapshot,verified_operation_id=NEW.operation_id,
    verified_date_key=v_day,verified_at=now()
   WHERE dossier_id=v_dossier AND objective=v_objective AND subject_key=v_attr;
   INSERT INTO public.spy_intelligence_events(
    dossier_id,operation_id,objective,subject_key,event_type,
    previous_snapshot,new_snapshot,campaign_date_key,calendar_version)
   VALUES(v_dossier,NEW.operation_id,v_objective,v_attr,'refreshed',
    v_old,v_snapshot,v_day,v_calendar);
   v_refreshed:=v_refreshed+1;
  END LOOP;
 END IF;
 INSERT INTO public.spy_intelligence_mission_awards(
  operation_id,dossier_id,objective,success_degrees,reveal_capacity,
  revealed_count,refreshed_count,processing_state,campaign_date_key)
 VALUES(NEW.operation_id,v_dossier,v_objective,v_degrees,v_capacity,
  v_new,v_refreshed,'complete',v_day);
 RETURN NEW;
END $award$;
DROP TRIGGER IF EXISTS spy_intelligence_decision_award ON public.spy_mission_decisions;
CREATE TRIGGER spy_intelligence_decision_award
 AFTER INSERT ON public.spy_mission_decisions
 FOR EACH ROW EXECUTE FUNCTION public.spy_intelligence_on_decision();
REVOKE ALL ON FUNCTION public.spy_intelligence_capacity(integer) FROM PUBLIC,anon,authenticated;
REVOKE ALL ON FUNCTION public.spy_intelligence_on_decision() FROM PUBLIC,anon,authenticated;
COMMIT;
