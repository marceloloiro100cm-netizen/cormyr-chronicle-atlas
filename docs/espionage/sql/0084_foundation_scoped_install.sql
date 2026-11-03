-- CCA-ESP-MVP-001: scoped additive schema installation explicitly requested by Narrator.
-- Bases: audited 0075 core tables + RLS (no submit/release RPC), 0082 region links + guarded review/read RPC, 0083 10-day Harptos RPC.
-- DO NOT pretend this means the entire module is LIVE; missing backup, migration journal reconciliation and player acceptance.
-- No INSERT/UPDATE/DELETE of existing data, no changes to noble_house_sheets, ledger, mail, calendar.
-- Strictly atomic: a failure rolls back all new objects.
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


SET LOCAL lock_timeout='5s';
CREATE TABLE public.spy_region_links(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 from_region text NOT NULL,
 to_region text NOT NULL,
 passage text NOT NULL CHECK(passage IN ('land_neighbor','sea_passage')),
 bidirectional boolean NOT NULL DEFAULT true,
 approved boolean NOT NULL DEFAULT false,
 blocked boolean NOT NULL DEFAULT false,
 visibility text NOT NULL DEFAULT 'public' CHECK(visibility IN ('public','narrator')),
 source text NOT NULL,
 approved_by uuid REFERENCES auth.users(id),
 approval_reason text,
 version integer NOT NULL DEFAULT 1 CHECK(version>0),
 CHECK(from_region<>to_region),
 CHECK(from_region IN ('crownlands','veilstone','shieldmark','helmlands','horselands',
  'dragoncoast','swordmark','ferlin','stonelands','elfhold','volkumburgh')),
 CHECK(to_region IN ('crownlands','veilstone','shieldmark','helmlands','horselands',
  'dragoncoast','swordmark','ferlin','stonelands','elfhold','volkumburgh')),
 CHECK(NOT approved OR (approved_by IS NOT NULL AND length(trim(approval_reason))>=10))
);
CREATE UNIQUE INDEX spy_region_links_direction_unique ON public.spy_region_links(
 from_region,to_region,passage);
ALTER TABLE public.spy_region_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.spy_region_links FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.spy_region_links TO authenticated;
GRANT SELECT,INSERT,UPDATE,DELETE ON public.spy_region_links TO service_role;
CREATE POLICY spy_region_public_links ON public.spy_region_links FOR SELECT TO authenticated
 USING(public.campaign_access_active() AND approved AND NOT blocked AND visibility='public');
-- Contrato autorizado pelo banco, nunca por 'isNarrator' enviado no navegador.
CREATE OR REPLACE FUNCTION public.spy_review_region_link(
 p_id uuid,p_from text,p_to text,p_passage text,p_bidirectional boolean,
 p_approved boolean,p_blocked boolean,p_visibility text,p_source text,
 p_expected_version integer,p_request_key uuid,p_reason text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $spy$
DECLARE old public.spy_region_links; updated public.spy_region_links;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active() OR NOT public.is_campaign_admin()
 THEN RAISE EXCEPTION 'Somente Narrador homologa vizinhança ou rota marítima'; END IF;
 IF p_id IS NULL OR p_request_key IS NULL OR p_expected_version<0 OR
  p_from IS NULL OR p_to IS NULL OR p_from=p_to OR
  p_from NOT IN ('crownlands','veilstone','shieldmark','helmlands','horselands',
   'dragoncoast','swordmark','ferlin','stonelands','elfhold','volkumburgh') OR
  p_to NOT IN ('crownlands','veilstone','shieldmark','helmlands','horselands',
   'dragoncoast','swordmark','ferlin','stonelands','elfhold','volkumburgh') OR
  p_passage NOT IN ('land_neighbor','sea_passage') OR
  p_visibility NOT IN ('public','narrator') OR
  length(trim(coalesce(p_source,'')))<3 OR length(trim(coalesce(p_reason,'')))<10
 THEN RAISE EXCEPTION 'Conexão regional inválida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('spy:region-link:'||p_id::text,0));
 IF EXISTS(SELECT 1 FROM public.spy_operation_events WHERE request_key=p_request_key)
 THEN RAISE EXCEPTION 'Chave de revisão já utilizada'; END IF;
 SELECT * INTO old FROM public.spy_region_links WHERE id=p_id FOR UPDATE;
 IF FOUND THEN
  IF old.version<>p_expected_version THEN RAISE EXCEPTION 'Conexão regional alterada'; END IF;
  UPDATE public.spy_region_links SET from_region=p_from,to_region=p_to,
   passage=p_passage,bidirectional=p_bidirectional,approved=p_approved,
   blocked=p_blocked,visibility=p_visibility,source=p_source,
   approved_by=CASE WHEN p_approved THEN auth.uid() ELSE NULL END,
   approval_reason=CASE WHEN p_approved THEN p_reason ELSE NULL END,version=version+1
   WHERE id=p_id RETURNING * INTO updated;
 ELSE
  IF p_expected_version<>0 THEN RAISE EXCEPTION 'Conexão nova exige versão zero'; END IF;
  INSERT INTO public.spy_region_links(id,from_region,to_region,passage,bidirectional,
   approved,blocked,visibility,source,approved_by,approval_reason)
  VALUES(p_id,p_from,p_to,p_passage,p_bidirectional,p_approved,p_blocked,p_visibility,
   p_source,CASE WHEN p_approved THEN auth.uid() ELSE NULL END,
   CASE WHEN p_approved THEN p_reason ELSE NULL END) RETURNING * INTO updated;
 END IF;
 INSERT INTO public.spy_operation_events(request_key,actor,event_type,reason)
 VALUES(p_request_key,auth.uid(),'region_connection_reviewed',p_reason);
 RETURN jsonb_build_object('id',updated.id,'version',updated.version,'approved',updated.approved);
END $spy$;
REVOKE ALL ON FUNCTION public.spy_review_region_link(uuid,text,text,text,boolean,boolean,boolean,text,text,integer,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.spy_review_region_link(uuid,text,text,text,boolean,boolean,boolean,text,text,integer,uuid,text)
 TO authenticated;

-- O estado posicional é determinado pelo AGENTE (não por sede ou domínio da Casa).
-- Em trânsito, current_region é somente a última chegada confirmada.
CREATE OR REPLACE FUNCTION public.spy_get_regional_strategy(p_house text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $spy$
DECLARE agents jsonb;links jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active() OR
  NOT (public.is_campaign_admin() OR public.in_campaign_house(p_house,false))
 THEN RAISE EXCEPTION 'Consulta estratégica não autorizada para esta Casa'; END IF;
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'id',a.id,'codename',a.codename,'status',a.status,
  'currentRegion',CASE WHEN l.kind='region' THEN l.ref_id ELSE l.region_id END)
  ORDER BY a.created_at,a.id),'[]'::jsonb) INTO agents
 FROM public.spy_assets a LEFT JOIN public.spy_locations l ON l.id=a.current_location_id
 WHERE a.owner_house_id=p_house;
 SELECT COALESCE(jsonb_agg(jsonb_build_object(
  'id',ln.id,'fromRegion',ln.from_region,'toRegion',ln.to_region,
  'passage',ln.passage,'bidirectional',ln.bidirectional,'version',ln.version)
  ORDER BY ln.from_region,ln.to_region,ln.id),'[]'::jsonb) INTO links
 FROM public.spy_region_links ln
 WHERE ln.approved AND NOT ln.blocked AND ln.visibility='public';
 RETURN jsonb_build_object('houseId',p_house,'agents',agents,'links',links);
END $spy$;
REVOKE ALL ON FUNCTION public.spy_get_regional_strategy(text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.spy_get_regional_strategy(text) TO authenticated;


CREATE OR REPLACE FUNCTION public.spy_add_desdias(p_date_key text,p_rounds integer)
RETURNS text LANGUAGE plpgsql IMMUTABLE STRICT SET search_path=public,pg_temp AS $spy$
DECLARE y integer;m integer;d integer;festival text;
 ordinary_idx bigint; next_idx bigint;ny integer;nm integer;nd integer;
BEGIN
 IF p_rounds NOT BETWEEN 0 AND 10000 THEN
  RAISE EXCEPTION 'Quantidade de désdias inválida'; END IF;
 IF p_date_key ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN
  y:=substring(p_date_key,1,4)::integer;
  m:=substring(p_date_key,6,2)::integer;
  d:=substring(p_date_key,9,2)::integer;
  IF y NOT BETWEEN 1 AND 9999 OR m NOT BETWEEN 1 AND 12 OR d NOT BETWEEN 1 AND 30
  THEN RAISE EXCEPTION 'Data ordinária de Harptos inválida'; END IF;
 ELSIF p_date_key ~ '^[0-9]{4}-F-[a-z-]+$' THEN
  y:=substring(p_date_key,1,4)::integer;
  festival:=substring(p_date_key,8);
  m:=CASE festival
   WHEN 'midwinter' THEN 1 WHEN 'greengrass' THEN 4
   WHEN 'midsummer' THEN 7 WHEN 'shieldmeet' THEN 7
   WHEN 'highharvestide' THEN 9 WHEN 'feast-moon' THEN 11
   ELSE NULL END;
  d:=30;
  IF y NOT BETWEEN 1 AND 9999 OR m IS NULL OR
   (festival='shieldmeet' AND y%4<>0)
  THEN RAISE EXCEPTION 'Festival de Harptos inválido neste ano'; END IF;
 ELSE
  RAISE EXCEPTION 'Chave de Harptos inválida'; END IF;
 IF p_rounds=0 THEN RETURN p_date_key; END IF;
 -- Ordinal de dias ORDINÁRIOS: 360 por ano, nenhum festival inserido.
 ordinary_idx:=(y::bigint-1)*360+(m-1)*30+d-1;
 next_idx:=ordinary_idx+p_rounds::bigint*10;
 IF next_idx>=9999::bigint*360 THEN
  RAISE EXCEPTION 'Prazo ultrapassa o limite do calendário de Harptos'; END IF;
 ny:=(next_idx/360)::integer+1;
 nm:=((next_idx%360)/30)::integer+1;
 nd:=(next_idx%30)::integer+1;
 RETURN lpad(ny::text,4,'0')||'-'||lpad(nm::text,2,'0')||'-'||lpad(nd::text,2,'0');
END $spy$;
REVOKE ALL ON FUNCTION public.spy_add_desdias(text,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.spy_add_desdias(text,integer) TO service_role;

COMMIT;
SELECT 
(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'spy_%') AS spy_tables_created,
(SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'spy_%' AND c.relrowsecurity) AS rls_enabled_tables,
to_regprocedure('public.spy_add_desdias(text,integer)') IS NOT NULL AS desdia_installed,
to_regprocedure('public.spy_get_regional_strategy(text)') IS NOT NULL AS regional_strategy_installed,
to_regprocedure('public.spy_review_region_link(uuid,text,text,text,boolean,boolean,boolean,text,text,integer,uuid,text)') IS NOT NULL AS regional_review_installed;
