-- CCA-ESP-MVP-001 · Lote 10 · SQL CANDIDATO PARA HOMOLOGACAO
-- ARQUIVO DELIBERADAMENTE FORA de drizzle/migrations e do journal.
-- NÃO executar em produção; exige reconciliação Drizzle 0041/0074, backup restaurável
-- e testes com participantes reais/isolados antes da promoção manual.
BEGIN;
SET LOCAL lock_timeout='5s';
CREATE TABLE IF NOT EXISTS public.spy_locations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK(kind IN ('region','house_seat','domain','settlement','waypoint')),
 ref_id text NOT NULL,region_id text,name text NOT NULL,
 approved boolean NOT NULL DEFAULT false,visibility text NOT NULL DEFAULT 'narrator'
  CHECK(visibility IN ('public','narrator')),
 source text NOT NULL,version integer NOT NULL DEFAULT 1 CHECK(version>0),
 UNIQUE(kind,ref_id)
);
CREATE TABLE IF NOT EXISTS public.spy_travel_edges(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 from_location_id uuid NOT NULL REFERENCES public.spy_locations(id),
 to_location_id uuid NOT NULL REFERENCES public.spy_locations(id),
 mode text NOT NULL CHECK(mode IN ('foot','horse','caravan','ship')),
 base_days integer NOT NULL CHECK(base_days BETWEEN 1 AND 3650),
 bidirectional boolean NOT NULL DEFAULT false,blocked boolean NOT NULL DEFAULT false,
 approved boolean NOT NULL DEFAULT false,approved_by uuid REFERENCES auth.users(id),
 approval_reason text,source text NOT NULL,version integer NOT NULL DEFAULT 1,
 CHECK(from_location_id<>to_location_id),
 CHECK(NOT approved OR (approved_by IS NOT NULL AND length(trim(approval_reason))>=10))
);
CREATE TABLE IF NOT EXISTS public.spy_assets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_house_id text NOT NULL REFERENCES public.campaign_houses(id),
 kind text NOT NULL CHECK(kind IN ('network_cell','contractor','local_contact')),
 codename text NOT NULL,
 source_holding_id text,source_ref text NOT NULL,
 current_location_id uuid REFERENCES public.spy_locations(id),
 status text NOT NULL DEFAULT 'pending_review' CHECK(status IN (
  'available','assigned','traveling','operating','returning','missing',
  'captured','retired','lost','pending_review')),
 rules_version text NOT NULL,version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_house_id,source_ref),UNIQUE(id,owner_house_id)
);
CREATE TABLE IF NOT EXISTS public.spy_operations(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_house_id text NOT NULL REFERENCES public.campaign_houses(id),
 asset_id uuid NOT NULL,
 operation_key uuid NOT NULL,
 target_type text NOT NULL CHECK(target_type IN ('house','region','person')),
 target_id text NOT NULL,
 mission_kind text NOT NULL CHECK(mission_kind IN (
  'regional_recon','house_recon','economy','military','family','law','rumors','dossier_refresh')),
 requested_fields text[] NOT NULL CHECK(cardinality(requested_fields) BETWEEN 1 AND 30),
 status text NOT NULL DEFAULT 'planned' CHECK(status IN (
  'draft','planned','traveling','operating','pending_narrator_review',
  'returning','completed','cancelled')),
 source_calendar_version integer NOT NULL CHECK(source_calendar_version>0),
 rules_version text NOT NULL,version integer NOT NULL DEFAULT 1 CHECK(version>0),
 created_by uuid NOT NULL REFERENCES auth.users(id),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(asset_id,owner_house_id) REFERENCES public.spy_assets(id,owner_house_id),
 UNIQUE(owner_house_id,operation_key),UNIQUE(id,owner_house_id)
);
CREATE INDEX IF NOT EXISTS spy_operations_owner_status_idx ON public.spy_operations(owner_house_id,status);
CREATE TABLE IF NOT EXISTS public.spy_operation_segments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 operation_id uuid NOT NULL REFERENCES public.spy_operations(id),
 edge_id uuid NOT NULL REFERENCES public.spy_travel_edges(id),
 ordinal integer NOT NULL CHECK(ordinal>=0),
 from_location_id uuid NOT NULL REFERENCES public.spy_locations(id),
 to_location_id uuid NOT NULL REFERENCES public.spy_locations(id),
 departure_key text NOT NULL CHECK(public.valid_campaign_date(departure_key)),
 arrival_key text NOT NULL CHECK(public.valid_campaign_date(arrival_key)),
 duration_days integer NOT NULL CHECK(duration_days>0),
 edge_version integer NOT NULL CHECK(edge_version>0),
 status text NOT NULL DEFAULT 'planned' CHECK(status IN ('planned','traveling','arrived','cancelled','pending_review')),
 UNIQUE(operation_id,ordinal)
);
CREATE INDEX IF NOT EXISTS spy_segments_due_idx ON public.spy_operation_segments(status,arrival_key);
CREATE TABLE IF NOT EXISTS public.spy_mission_decisions(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 operation_id uuid NOT NULL REFERENCES public.spy_operations(id),
 target_law integer,law_source text,law_source_version integer,
 difficulty integer,rule_version text,modifiers jsonb NOT NULL DEFAULT '{}'::jsonb,
 resolution text NOT NULL DEFAULT 'pending_narrator_review'
  CHECK(resolution IN ('pending_narrator_review','success','partial','failure','compromised','captured')),
 reviewer uuid REFERENCES auth.users(id),
 rationale text,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.spy_intel_reports(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 operation_id uuid NOT NULL REFERENCES public.spy_operations(id),
 owner_house_id text NOT NULL REFERENCES public.campaign_houses(id),
 code text NOT NULL,observed_date_key text NOT NULL CHECK(public.valid_campaign_date(observed_date_key)),
 release_date_key text CHECK(release_date_key IS NULL OR public.valid_campaign_date(release_date_key)),
 asset_codename text NOT NULL,location_label text NOT NULL,
 requested_fields text[] NOT NULL,
 facts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK(jsonb_typeof(facts)='array'),
 status text NOT NULL DEFAULT 'sealed' CHECK(status IN ('sealed','released','archived')),
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 release_reason text,release_by uuid REFERENCES auth.users(id),release_key uuid UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(operation_id,owner_house_id) REFERENCES public.spy_operations(id,owner_house_id),
 CHECK(status='sealed' OR (release_by IS NOT NULL AND release_date_key IS NOT NULL AND length(trim(release_reason))>=10))
);
CREATE INDEX IF NOT EXISTS spy_reports_owner_status_idx ON public.spy_intel_reports(owner_house_id,status);
CREATE TABLE IF NOT EXISTS public.spy_dossiers(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 owner_house_id text NOT NULL REFERENCES public.campaign_houses(id),
 target_type text NOT NULL CHECK(target_type IN ('house','region','person')),
 target_id text NOT NULL,version integer NOT NULL DEFAULT 1 CHECK(version>0),
 UNIQUE(owner_house_id,target_type,target_id),UNIQUE(id,owner_house_id)
);
CREATE TABLE IF NOT EXISTS public.spy_dossier_facts(
 id uuid PRIMARY KEY,
 dossier_id uuid NOT NULL,
 owner_house_id text NOT NULL,
 report_id uuid NOT NULL REFERENCES public.spy_intel_reports(id),
 field_code text NOT NULL,
 disclosed_value jsonb NOT NULL,
 confidence text NOT NULL CHECK(confidence IN ('rumor','partial','confirmed','disputed')),
 observed_date_key text NOT NULL CHECK(public.valid_campaign_date(observed_date_key)),
 stale_at_key text CHECK(stale_at_key IS NULL OR public.valid_campaign_date(stale_at_key)),
 approved boolean NOT NULL DEFAULT false,
 FOREIGN KEY(dossier_id,owner_house_id) REFERENCES public.spy_dossiers(id,owner_house_id)
);
CREATE TABLE IF NOT EXISTS public.spy_rule_sets(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 code text NOT NULL,version integer NOT NULL CHECK(version>0),
 definition jsonb NOT NULL CHECK(jsonb_typeof(definition)='object'),
 approved_by uuid NOT NULL REFERENCES auth.users(id),
 reason text NOT NULL CHECK(length(trim(reason))>=10),
 UNIQUE(code,version)
);
CREATE TABLE IF NOT EXISTS public.spy_operation_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 operation_id uuid REFERENCES public.spy_operations(id),
 request_key uuid NOT NULL UNIQUE,
 actor uuid REFERENCES auth.users(id),
 event_type text NOT NULL,old_state text,new_state text,
 reason text NOT NULL,calendar_version integer,
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.spy_temporal_deliveries(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 segment_id uuid NOT NULL REFERENCES public.spy_operation_segments(id),
 calendar_version integer NOT NULL CHECK(calendar_version>0),
 transition text NOT NULL CHECK(transition IN ('arrived','pending_review')),
 first_processed_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(segment_id,transition)
);
CREATE TABLE IF NOT EXISTS public.spy_contract_receipts(
 holding_id text PRIMARY KEY,
 owner_house_id text NOT NULL REFERENCES public.campaign_houses(id),
 operation_key uuid NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(owner_house_id,operation_key),
 FOREIGN KEY(owner_house_id,operation_key)
  REFERENCES public.noble_house_ledger(house_id,operation_key)
);
-- Nenhuma segunda reserva de Riqueza: recibos apontam para compras na contabilidade canônica.
-- 1. RLS negando tudo por padrão. 2. SELECT somente owner/admin e apenas relatórios liberados.
-- 3. Nenhum INSERT/UPDATE/DELETE direto permitido a jogadores.
DO $guard$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['spy_locations','spy_travel_edges','spy_assets','spy_operations',
  'spy_operation_segments','spy_mission_decisions','spy_intel_reports','spy_dossiers',
  'spy_dossier_facts','spy_rule_sets','spy_operation_events','spy_temporal_deliveries',
  'spy_contract_receipts'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC,anon,authenticated',t);
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON public.%I TO service_role',t);
 END LOOP;
END $guard$;
GRANT SELECT ON public.spy_locations,public.spy_travel_edges,public.spy_assets,
 public.spy_operations,public.spy_operation_segments,public.spy_intel_reports,
 public.spy_dossiers,public.spy_dossier_facts TO authenticated;
CREATE POLICY spy_location_reader ON public.spy_locations FOR SELECT TO authenticated
 USING(public.is_campaign_admin() OR (public.campaign_access_active() AND approved AND visibility='public'));
CREATE POLICY spy_edge_reader ON public.spy_travel_edges FOR SELECT TO authenticated
 USING(public.is_campaign_admin() OR (public.campaign_access_active() AND approved AND NOT blocked
   AND EXISTS(SELECT 1 FROM public.spy_locations l WHERE l.id=from_location_id AND l.approved AND l.visibility='public')
   AND EXISTS(SELECT 1 FROM public.spy_locations l WHERE l.id=to_location_id AND l.approved AND l.visibility='public')));
CREATE POLICY spy_assets_owner ON public.spy_assets FOR SELECT TO authenticated
 USING(public.is_campaign_admin() OR public.in_campaign_house(owner_house_id,false));
CREATE POLICY spy_ops_owner ON public.spy_operations FOR SELECT TO authenticated
 USING(public.is_campaign_admin() OR public.in_campaign_house(owner_house_id,false));
CREATE POLICY spy_segments_owner ON public.spy_operation_segments FOR SELECT TO authenticated
 USING(public.is_campaign_admin() OR EXISTS(SELECT 1 FROM public.spy_operations op
  WHERE op.id=operation_id AND public.in_campaign_house(op.owner_house_id,false)));
CREATE POLICY spy_reports_released ON public.spy_intel_reports FOR SELECT TO authenticated
 USING(public.is_campaign_admin() OR (status IN ('released','archived')
   AND public.in_campaign_house(owner_house_id,false)));
CREATE POLICY spy_dossiers_owner ON public.spy_dossiers FOR SELECT TO authenticated
 USING(public.is_campaign_admin() OR public.in_campaign_house(owner_house_id,false));
CREATE POLICY spy_facts_owner ON public.spy_dossier_facts FOR SELECT TO authenticated
 USING(approved AND EXISTS(SELECT 1 FROM public.spy_intel_reports rep
  WHERE rep.id=report_id AND rep.status IN ('released','archived'))
  AND (public.is_campaign_admin() OR public.in_campaign_house(owner_house_id,false)));
-- Decisions, internal rules, events, receipts and delivery checkpoints: no SELECT to authenticated.
CREATE OR REPLACE FUNCTION public.spy_submit_mission(
 p_house text,p_asset uuid,p_key uuid,p_target_type text,p_target text,
 p_kind text,p_fields text[],p_calendar_version integer,p_rules_version text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $spy$
DECLARE a public.spy_assets; o public.spy_operations; official integer;
 fields_allow text[]:=ARRAY[
 'house_name','house_region','house_lord','house_resources','house_army','house_law',
 'noble_family','regional_roads','regional_rumors','regional_communities','regional_risks',
 'house_trade','house_fortifications','house_troop_movements','house_family_succession',
 'house_rumors','house_legal_environment','dossier_update'];
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active() OR
  NOT (public.is_campaign_admin() OR public.in_campaign_house(p_house,true)) THEN
   RAISE EXCEPTION 'Casa não autorizada para missão';
 END IF;
 IF p_key IS NULL OR p_asset IS NULL OR length(coalesce(p_target,''))<1 OR
  p_target_type NOT IN ('house','region','person') OR
  p_kind NOT IN ('regional_recon','house_recon','economy','military','family','law','rumors','dossier_refresh') OR
  coalesce(cardinality(p_fields),0)<1 OR coalesce(cardinality(p_fields),0)>30 OR
  EXISTS(SELECT 1 FROM unnest(p_fields) f WHERE NOT f=ANY(fields_allow)) OR
  (SELECT count(DISTINCT f) FROM unnest(p_fields) f)<>cardinality(p_fields)
  THEN RAISE EXCEPTION 'Pedido de missão inválido';
 END IF;
 SELECT version INTO official FROM public.campaign_calendar WHERE id=true;
 IF official IS NULL OR official<>p_calendar_version THEN RAISE EXCEPTION 'Calendário publicado mudou'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('spy:'||p_house||':'||p_asset::text,0));
 SELECT * INTO o FROM public.spy_operations WHERE owner_house_id=p_house AND operation_key=p_key;
 IF FOUND THEN
  IF o.asset_id<>p_asset OR o.target_type<>p_target_type OR o.target_id<>p_target
   OR o.mission_kind<>p_kind OR o.requested_fields<>p_fields THEN
   RAISE EXCEPTION 'Chave idempotente reutilizada com parâmetros distintos'; END IF;
  RETURN jsonb_build_object('id',o.id,'duplicate',true,'status',o.status);
 END IF;
 SELECT * INTO a FROM public.spy_assets WHERE id=p_asset AND owner_house_id=p_house FOR UPDATE;
 IF NOT FOUND OR a.status<>'available' OR a.current_location_id IS NULL THEN
  RAISE EXCEPTION 'Agente indisponível'; END IF;
 IF EXISTS(SELECT 1 FROM public.spy_operations op WHERE op.asset_id=p_asset AND
  op.status IN ('planned','traveling','operating','pending_narrator_review','returning'))
  THEN RAISE EXCEPTION 'Agente já designado'; END IF;
 INSERT INTO public.spy_operations(owner_house_id,asset_id,operation_key,target_type,target_id,
  mission_kind,requested_fields,status,source_calendar_version,rules_version,created_by)
 VALUES(p_house,p_asset,p_key,p_target_type,p_target,p_kind,p_fields,'planned',official,
  p_rules_version,auth.uid()) RETURNING * INTO o;
 UPDATE public.spy_assets SET status='assigned',version=version+1 WHERE id=a.id;
 INSERT INTO public.spy_operation_events(operation_id,request_key,actor,event_type,new_state,reason,calendar_version)
 VALUES(o.id,p_key,auth.uid(),'operation_created','planned','Operação cadastrada pelo titular autorizado',official);
 RETURN jsonb_build_object('id',o.id,'duplicate',false,'status',o.status);
END $spy$;
REVOKE ALL ON FUNCTION public.spy_submit_mission(text,uuid,uuid,text,text,text,text[],integer,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.spy_submit_mission(text,uuid,uuid,text,text,text,text[],integer,text)
 TO authenticated;
-- Relatório selado nasce apenas com decisão do Narrador por outro canal auditado.
-- A liberação publica APENAS o snapshot aprovado; não consulta o estado do alvo.
CREATE OR REPLACE FUNCTION public.spy_release_report(
 p_report uuid,p_key uuid,p_date text,p_reason text,p_delivery text)
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $spy$
DECLARE rep public.spy_intel_reports; d public.spy_dossiers; fact jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.is_campaign_admin() OR
  NOT public.campaign_access_active() THEN RAISE EXCEPTION 'Narrador obrigatório'; END IF;
 IF NOT public.valid_campaign_date(p_date) OR length(trim(p_reason))<10 OR
  p_delivery NOT IN ('returned','explicit_communication') THEN
  RAISE EXCEPTION 'Justificativa, data ou entrega inválida'; END IF;
 SELECT * INTO rep FROM public.spy_intel_reports WHERE id=p_report FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Relatório indisponível'; END IF;
 IF rep.status IN ('released','archived') AND rep.release_key=p_key
  THEN RETURN jsonb_build_object('id',rep.id,'duplicate',true); END IF;
 IF rep.status<>'sealed' THEN RAISE EXCEPTION 'Relatório já divulgado'; END IF;
 IF public.harptos_calendar_ordinal(p_date)<public.harptos_calendar_ordinal(rep.observed_date_key)
  THEN RAISE EXCEPTION 'Data anterior à descoberta'; END IF;
 UPDATE public.spy_intel_reports SET status='released',release_key=p_key,release_date_key=p_date,
  release_reason=p_reason,release_by=auth.uid(),version=version+1 WHERE id=rep.id;
 SELECT * INTO d FROM public.spy_dossiers
  WHERE owner_house_id=rep.owner_house_id AND target_type=(
   SELECT target_type FROM public.spy_operations WHERE id=rep.operation_id)
   AND target_id=(SELECT target_id FROM public.spy_operations WHERE id=rep.operation_id) FOR UPDATE;
 IF NOT FOUND THEN
  INSERT INTO public.spy_dossiers(owner_house_id,target_type,target_id)
  SELECT rep.owner_house_id,op.target_type,op.target_id
   FROM public.spy_operations op WHERE op.id=rep.operation_id RETURNING * INTO d;
 END IF;
 FOR fact IN SELECT value FROM jsonb_array_elements(rep.facts) LOOP
  IF coalesce(fact->>'approvedByNarrator','false')<>'true' OR
   NOT (fact->>'fieldCode'=ANY(rep.requested_fields)) OR
   NOT (fact->>'fieldCode'=ANY(ARRAY[
    'house_name','house_region','house_lord','house_resources','house_army','house_law',
    'noble_family','regional_roads','regional_rumors','regional_communities','regional_risks',
    'house_trade','house_fortifications','house_troop_movements','house_family_succession',
    'house_rumors','house_legal_environment','dossier_update'])) THEN
   RAISE EXCEPTION 'Fato sem autorização narratorial ou fora do escopo';
  END IF;
  INSERT INTO public.spy_dossier_facts(id,dossier_id,owner_house_id,report_id,
   field_code,disclosed_value,confidence,observed_date_key,stale_at_key,approved)
  VALUES((fact->>'id')::uuid,d.id,rep.owner_house_id,rep.id,fact->>'fieldCode',
   fact->'disclosedValue',fact->>'confidence',fact->>'observedDateKey',
   fact->>'staleAtDateKey',true) ON CONFLICT(id) DO NOTHING;
 END LOOP;
 INSERT INTO public.spy_operation_events(operation_id,request_key,actor,event_type,
   new_state,reason) VALUES(rep.operation_id,p_key,auth.uid(),'report_released',
   'released',p_reason);
 RETURN jsonb_build_object('id',rep.id,'duplicate',false,'status','released');
END $spy$;
REVOKE ALL ON FUNCTION public.spy_release_report(uuid,uuid,text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.spy_release_report(uuid,uuid,text,text,text) TO authenticated;
COMMIT;
