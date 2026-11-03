-- CCA-ESP-MVP-001 / Marco C · Narrator adjudication and sealed reports.
-- REVIEW ONLY. Apply only in disposable PostgreSQL or audited staging, after 0075-0079.
-- Never query a target House in a player-facing RPC; only approved materialized facts.
BEGIN;
SET LOCAL lock_timeout='5s';

-- Server-side mission field policy (UI restrictions are not authorization).
CREATE OR REPLACE FUNCTION public.spy_validate_mission_scope()
RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $spy$
DECLARE allowed text[]; f text;
BEGIN
 allowed:=CASE NEW.mission_kind
 WHEN 'regional_recon' THEN ARRAY['regional_roads','regional_communities','regional_rumors','regional_risks']
 WHEN 'house_recon' THEN ARRAY['house_name','house_region','house_lord','house_fortifications']
 WHEN 'economy' THEN ARRAY['house_resources','house_trade']
 WHEN 'military' THEN ARRAY['house_army','house_troop_movements','house_fortifications']
 WHEN 'family' THEN ARRAY['noble_family','house_family_succession','house_lord']
 WHEN 'law' THEN ARRAY['house_legal_environment','house_law']
 WHEN 'rumors' THEN CASE NEW.target_type
  WHEN 'region' THEN ARRAY['regional_rumors'] WHEN 'house' THEN ARRAY['house_rumors']
  ELSE ARRAY[]::text[] END
 WHEN 'dossier_refresh' THEN CASE NEW.target_type
  WHEN 'region' THEN ARRAY['regional_roads','regional_rumors','regional_communities','regional_risks']
  WHEN 'house' THEN ARRAY['house_name','house_region','house_lord','house_resources','house_army',
   'house_law','house_trade','house_fortifications','house_troop_movements',
   'house_family_succession','house_rumors','house_legal_environment','dossier_update']
  WHEN 'person' THEN ARRAY['noble_family','house_family_succession','house_lord']
  ELSE ARRAY[]::text[] END
 ELSE ARRAY[]::text[] END;
 IF NEW.target_type NOT IN ('house','region','person') OR
  NOT (CASE NEW.mission_kind
   WHEN 'regional_recon' THEN NEW.target_type='region'
   WHEN 'house_recon' THEN NEW.target_type='house'
   WHEN 'economy' THEN NEW.target_type='house'
   WHEN 'military' THEN NEW.target_type='house'
   WHEN 'family' THEN NEW.target_type IN ('house','person')
   WHEN 'law' THEN NEW.target_type='house'
   WHEN 'rumors' THEN NEW.target_type IN ('house','region')
   WHEN 'dossier_refresh' THEN NEW.target_type IN ('house','region','person')
   ELSE false END) OR
  coalesce(cardinality(NEW.requested_fields),0)<1 OR
  coalesce(cardinality(NEW.requested_fields),0)>18 OR
  (SELECT count(DISTINCT x) FROM unnest(NEW.requested_fields) x)<>cardinality(NEW.requested_fields)
  THEN RAISE EXCEPTION 'Escopo incompatível com o tipo de missão'; END IF;
 FOREACH f IN ARRAY NEW.requested_fields LOOP
  IF f IS NULL OR NOT f=ANY(allowed) THEN
   RAISE EXCEPTION 'Campo fora do escopo desta missão'; END IF;
 END LOOP;
 RETURN NEW;
END $spy$;
REVOKE ALL ON FUNCTION public.spy_validate_mission_scope() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS spy_mission_scope_guard ON public.spy_operations;
CREATE TRIGGER spy_mission_scope_guard BEFORE INSERT OR UPDATE OF target_type,mission_kind,requested_fields
 ON public.spy_operations FOR EACH ROW EXECUTE FUNCTION public.spy_validate_mission_scope();

-- Narrator alone records the result. We do not invent target Law, a difficulty
-- score, a success percentage or automatic capture. Those require vetted rules.
CREATE OR REPLACE FUNCTION public.spy_resolve_mission(
 p_operation uuid,p_key uuid,p_outcome text,p_reason text,p_expected_version integer
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $spy$
DECLARE op public.spy_operations; affected integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active() OR NOT public.is_campaign_admin()
  THEN RAISE EXCEPTION 'Somente o Narrador resolve espionagem'; END IF;
 IF p_operation IS NULL OR p_key IS NULL OR p_expected_version<1 OR
  p_outcome NOT IN ('success','partial','failure','compromised','captured') OR
  length(trim(coalesce(p_reason,'')))<10 THEN RAISE EXCEPTION 'Decisão narratorial inválida'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('spy:decision:'||p_operation::text,0));
 IF EXISTS(SELECT 1 FROM public.spy_operation_events WHERE request_key=p_key
  AND event_type='mission_resolved' AND operation_id=p_operation)
 THEN RETURN jsonb_build_object('operation_id',p_operation,'duplicate',true); END IF;
 IF EXISTS(SELECT 1 FROM public.spy_operation_events WHERE request_key=p_key)
  THEN RAISE EXCEPTION 'Chave idempotente já utilizada'; END IF;
 SELECT * INTO op FROM public.spy_operations WHERE id=p_operation FOR UPDATE;
 IF NOT FOUND OR op.version<>p_expected_version OR op.status NOT IN ('traveling','operating')
  THEN RAISE EXCEPTION 'Operação não apta ou versão vencida'; END IF;
 SELECT count(*) INTO affected FROM public.spy_operation_segments WHERE operation_id=op.id;
 IF affected=0 OR EXISTS(SELECT 1 FROM public.spy_operation_segments
  WHERE operation_id=op.id AND status NOT IN ('arrived','cancelled'))
 THEN RAISE EXCEPTION 'Deslocamento ainda não foi confirmado'; END IF;
 IF EXISTS(SELECT 1 FROM public.spy_mission_decisions WHERE operation_id=op.id)
  THEN RAISE EXCEPTION 'Esta operação já recebeu decisão'; END IF;
 INSERT INTO public.spy_mission_decisions(operation_id,resolution,reviewer,rationale,
  target_law,difficulty,law_source,law_source_version,rule_version)
 VALUES(op.id,p_outcome,auth.uid(),p_reason,NULL,NULL,NULL,NULL,NULL);
 UPDATE public.spy_operations SET status='pending_narrator_review',version=version+1
  WHERE id=op.id;
 -- Captured only on an explicit narrator decision; detection is not capture.
 IF p_outcome='captured' THEN
  UPDATE public.spy_assets SET status='captured',version=version+1 WHERE id=op.asset_id;
 ELSE
  UPDATE public.spy_assets SET status='operating',version=version+1 WHERE id=op.asset_id;
 END IF;
 INSERT INTO public.spy_operation_events(operation_id,request_key,actor,event_type,
  old_state,new_state,reason)
 VALUES(op.id,p_key,auth.uid(),'mission_resolved',op.status,p_outcome,p_reason);
 RETURN jsonb_build_object('operation_id',op.id,'duplicate',false,
  'status','pending_narrator_review','outcome_recorded',true,
  'difficulty','awaiting_approved_rules');
END $spy$;
REVOKE ALL ON FUNCTION public.spy_resolve_mission(uuid,uuid,text,text,integer)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.spy_resolve_mission(uuid,uuid,text,text,integer)
 TO authenticated;

-- Produces a sealed snapshot only. This never returns facts to players and
-- never joins against target noble_house_sheets.
CREATE OR REPLACE FUNCTION public.spy_seal_intel_report(
 p_operation uuid,p_report uuid,p_key uuid,p_code text,p_location_label text,
 p_observed_date text,p_facts jsonb,p_reason text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $spy$
DECLARE op public.spy_operations; a public.spy_assets; cal public.campaign_calendar;
 f jsonb; clean_facts jsonb:='[]'::jsonb; field_code text; date_key text; conf text;
 disclosed jsonb; fact_id uuid; seen_ids uuid[]:=ARRAY[]::uuid[]; n integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active() OR NOT public.is_campaign_admin()
  THEN RAISE EXCEPTION 'Narrador obrigatório para selar relatório'; END IF;
 IF p_report IS NULL OR p_operation IS NULL OR p_key IS NULL OR
  length(trim(coalesce(p_code,''))) NOT BETWEEN 1 AND 64 OR
  length(trim(coalesce(p_location_label,''))) NOT BETWEEN 1 AND 180 OR
  length(trim(coalesce(p_reason,'')))<10 OR
  jsonb_typeof(p_facts) IS DISTINCT FROM 'array' OR
  jsonb_array_length(p_facts)>100 OR NOT public.valid_campaign_date(p_observed_date)
  THEN RAISE EXCEPTION 'Relatório narratorial inválido'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('spy:report:'||p_operation::text,0));
 IF EXISTS(SELECT 1 FROM public.spy_operation_events WHERE request_key=p_key
  AND event_type='report_sealed' AND operation_id=p_operation) THEN
  RETURN jsonb_build_object('report_id',p_report,'duplicate',true); END IF;
 IF EXISTS(SELECT 1 FROM public.spy_operation_events WHERE request_key=p_key)
  THEN RAISE EXCEPTION 'Chave já utilizada'; END IF;
 SELECT * INTO op FROM public.spy_operations WHERE id=p_operation FOR SHARE;
 IF NOT FOUND OR op.status<>'pending_narrator_review' OR
  NOT EXISTS(SELECT 1 FROM public.spy_mission_decisions
   WHERE operation_id=op.id AND resolution IN ('success','partial','failure','compromised'))
  THEN RAISE EXCEPTION 'Operação sem decisão narratorial elegível'; END IF;
 IF EXISTS(SELECT 1 FROM public.spy_intel_reports WHERE operation_id=op.id AND status IN ('sealed','released','archived'))
  THEN RAISE EXCEPTION 'Já existe carta para esta operação'; END IF;
 SELECT * INTO cal FROM public.campaign_calendar WHERE id=true;
 IF NOT FOUND OR public.harptos_calendar_ordinal(p_observed_date)>
  public.harptos_calendar_ordinal(public.harptos_time_key(cal.year,cal.month,cal.day,cal.festival))
  THEN RAISE EXCEPTION 'Data de observação posterior ao calendário oficial'; END IF;
 SELECT * INTO a FROM public.spy_assets WHERE id=op.asset_id AND owner_house_id=op.owner_house_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'Agente indisponível'; END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(p_facts) LOOP
  IF jsonb_typeof(f) IS DISTINCT FROM 'object' OR
   f->>'approvedByNarrator' IS DISTINCT FROM 'true' OR
   f->>'sourceOperationId' IS DISTINCT FROM op.id::text OR
   NOT (f ?& ARRAY['id','fieldCode','disclosedValue','confidence','observedDateKey'])
   THEN RAISE EXCEPTION 'Fato não verificado pelo Narrador'; END IF;
  fact_id:=(f->>'id')::uuid;field_code:=f->>'fieldCode';conf:=f->>'confidence';
  date_key:=f->>'observedDateKey';disclosed:=f->'disclosedValue';
  IF fact_id IS NULL OR fact_id=ANY(seen_ids) OR NOT field_code=ANY(op.requested_fields) OR
   conf NOT IN ('rumor','partial','confirmed','disputed') OR
   NOT public.valid_campaign_date(date_key) OR
   public.harptos_calendar_ordinal(date_key)>public.harptos_calendar_ordinal(p_observed_date) OR
   jsonb_typeof(disclosed) NOT IN ('string','number','boolean','null') THEN
   RAISE EXCEPTION 'Fato duplicado, fora de escopo ou com data inválida'; END IF;
  seen_ids:=array_append(seen_ids,fact_id);
  clean_facts:=clean_facts||jsonb_build_array(jsonb_build_object(
   'id',fact_id,'fieldCode',field_code,'disclosedValue',disclosed,
   'confidence',conf,'observedDateKey',date_key,'approvedByNarrator',true,
   'sourceOperationId',op.id));
 END LOOP;
 INSERT INTO public.spy_intel_reports(id,operation_id,owner_house_id,code,
  observed_date_key,asset_codename,location_label,requested_fields,facts,status)
 VALUES(p_report,op.id,op.owner_house_id,trim(p_code),p_observed_date,a.codename,
  trim(p_location_label),op.requested_fields,clean_facts,'sealed');
 INSERT INTO public.spy_operation_events(operation_id,request_key,actor,event_type,
  new_state,reason)
 VALUES(op.id,p_key,auth.uid(),'report_sealed','sealed',p_reason);
 RETURN jsonb_build_object('report_id',p_report,'duplicate',false,'state','sealed',
  'authorized_fact_count',jsonb_array_length(clean_facts));
END $spy$;
REVOKE ALL ON FUNCTION public.spy_seal_intel_report(uuid,uuid,uuid,text,text,text,jsonb,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.spy_seal_intel_report(uuid,uuid,uuid,text,text,text,jsonb,text)
 TO authenticated;

-- Replace original release RPC with a stricter delivery/return check, pre-validating
-- every approved fact before any projection. All writes are in one DB transaction.
CREATE OR REPLACE FUNCTION public.spy_release_report(
 p_report uuid,p_key uuid,p_date text,p_reason text,p_delivery text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $spy$
DECLARE rep public.spy_intel_reports; op public.spy_operations; agent public.spy_assets;
 cal public.campaign_calendar; d public.spy_dossiers; f jsonb; fact_id uuid;
 origin_id uuid; final_id uuid; total_segments integer; inserted_count integer:=0;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active() OR NOT public.is_campaign_admin()
 THEN RAISE EXCEPTION 'Narrador obrigatório'; END IF;
 IF p_report IS NULL OR p_key IS NULL OR NOT public.valid_campaign_date(p_date) OR
  length(trim(coalesce(p_reason,'')))<10 OR
  p_delivery NOT IN ('returned','explicit_communication')
 THEN RAISE EXCEPTION 'Liberação exige data, canal e justificativa'; END IF;
 SELECT * INTO rep FROM public.spy_intel_reports WHERE id=p_report FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Relatório indisponível'; END IF;
 IF rep.status IN ('released','archived') AND rep.release_key=p_key
 THEN RETURN jsonb_build_object('id',p_report,'duplicate',true); END IF;
 IF rep.status<>'sealed' THEN RAISE EXCEPTION 'Relatório já publicado'; END IF;
 SELECT * INTO op FROM public.spy_operations WHERE id=rep.operation_id FOR UPDATE;
 SELECT * INTO agent FROM public.spy_assets WHERE id=op.asset_id FOR UPDATE;
 IF NOT FOUND OR agent.owner_house_id<>rep.owner_house_id OR
  NOT EXISTS(SELECT 1 FROM public.spy_mission_decisions
   WHERE operation_id=op.id AND resolution IN ('success','partial','failure','compromised'))
  THEN RAISE EXCEPTION 'Sem decisão autorizada da missão'; END IF;
 SELECT * INTO cal FROM public.campaign_calendar WHERE id=true FOR SHARE;
 IF NOT FOUND OR public.harptos_calendar_ordinal(p_date)>
  public.harptos_calendar_ordinal(public.harptos_time_key(cal.year,cal.month,cal.day,cal.festival)) OR
  public.harptos_calendar_ordinal(p_date)<public.harptos_calendar_ordinal(rep.observed_date_key)
 THEN RAISE EXCEPTION 'Data de publicação fora do calendário oficial'; END IF;
 IF p_delivery='returned' THEN
  SELECT count(*) INTO total_segments FROM public.spy_operation_segments
   WHERE operation_id=op.id;
  SELECT from_location_id INTO origin_id FROM public.spy_operation_segments
   WHERE operation_id=op.id ORDER BY ordinal ASC LIMIT 1;
  SELECT to_location_id INTO final_id FROM public.spy_operation_segments
   WHERE operation_id=op.id ORDER BY ordinal DESC LIMIT 1;
  IF total_segments<2 OR EXISTS(SELECT 1 FROM public.spy_operation_segments
   WHERE operation_id=op.id AND status<>'arrived') OR
   origin_id IS DISTINCT FROM final_id OR agent.current_location_id IS DISTINCT FROM origin_id
   THEN RAISE EXCEPTION 'Retorno físico ainda não comprovado'; END IF;
 END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(rep.facts) LOOP
  IF jsonb_typeof(f)<>'object' OR f->>'approvedByNarrator' IS DISTINCT FROM 'true' OR
   f->>'sourceOperationId' IS DISTINCT FROM op.id::text OR
   NOT (f->>'fieldCode'=ANY(rep.requested_fields)) OR
   f->>'confidence' NOT IN ('rumor','partial','confirmed','disputed') OR
   NOT public.valid_campaign_date(f->>'observedDateKey') OR
   public.harptos_calendar_ordinal(f->>'observedDateKey')>
    public.harptos_calendar_ordinal(rep.observed_date_key) OR
   jsonb_typeof(f->'disclosedValue') NOT IN ('null','string','number','boolean') OR
   EXISTS(SELECT 1 FROM public.spy_dossier_facts WHERE id=(f->>'id')::uuid)
  THEN RAISE EXCEPTION 'Fato não autorizado ou identificador repetido'; END IF;
 END LOOP;
 SELECT * INTO d FROM public.spy_dossiers WHERE owner_house_id=rep.owner_house_id
  AND target_type=op.target_type AND target_id=op.target_id FOR UPDATE;
 IF NOT FOUND THEN
  INSERT INTO public.spy_dossiers(owner_house_id,target_type,target_id)
  VALUES(rep.owner_house_id,op.target_type,op.target_id) RETURNING * INTO d;
 END IF;
 FOR f IN SELECT value FROM jsonb_array_elements(rep.facts) LOOP
  INSERT INTO public.spy_dossier_facts(id,dossier_id,owner_house_id,report_id,
   field_code,disclosed_value,confidence,observed_date_key,stale_at_key,approved)
  VALUES((f->>'id')::uuid,d.id,rep.owner_house_id,rep.id,f->>'fieldCode',
   f->'disclosedValue',f->>'confidence',f->>'observedDateKey',NULL,true);
  inserted_count:=inserted_count+1;
 END LOOP;
 UPDATE public.spy_dossiers SET version=version+1 WHERE id=d.id;
 UPDATE public.spy_intel_reports SET status='released',release_key=p_key,
  release_date_key=p_date,release_reason=p_reason,release_by=auth.uid(),version=version+1
  WHERE id=rep.id;
 IF p_delivery='returned' THEN
  UPDATE public.spy_operations SET status='completed',version=version+1 WHERE id=op.id;
  UPDATE public.spy_assets SET status='available',version=version+1 WHERE id=agent.id;
 END IF;
 INSERT INTO public.spy_operation_events(operation_id,request_key,actor,event_type,
  old_state,new_state,reason,calendar_version)
 VALUES(op.id,p_key,auth.uid(),'report_released','sealed','released',p_reason,cal.version);
 RETURN jsonb_build_object('id',rep.id,'duplicate',false,'status','released',
  'authorized_fact_count',inserted_count,'delivery',p_delivery);
END $spy$;
REVOKE ALL ON FUNCTION public.spy_release_report(uuid,uuid,text,text,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.spy_release_report(uuid,uuid,text,text,text)
 TO authenticated;
COMMIT;
