-- CCA-ESP-MVP-001 · Marco C continuation · REVIEW ONLY, NOT Drizzle migration.
-- Uses real noble_house_sheets and canonical house-ledger; never re-debits Wealth.
-- Run only in disposable PG or audited empty staging after 0075 and 0076.
BEGIN;
SET LOCAL lock_timeout='5s';

CREATE OR REPLACE FUNCTION public.spy_upsert_location(
 p_id uuid,p_kind text,p_ref text,p_region text,p_name text,p_source text,
 p_visibility text,p_approved boolean,p_expected_version integer,p_key uuid,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $spy$
DECLARE previous public.spy_locations; v integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active() OR NOT public.is_campaign_admin()
  THEN RAISE EXCEPTION 'Narrador obrigatório'; END IF;
 IF p_id IS NULL OR p_key IS NULL OR p_expected_version<0 OR
  p_kind NOT IN ('region','house_seat','domain','settlement','waypoint') OR
  p_visibility NOT IN ('public','narrator') OR
  length(trim(coalesce(p_ref,''))) NOT BETWEEN 1 AND 180 OR
  length(trim(coalesce(p_name,''))) NOT BETWEEN 1 AND 180 OR
  length(trim(coalesce(p_source,'')))<3 OR length(trim(coalesce(p_reason,'')))<10
 THEN RAISE EXCEPTION 'Cadastro de localidade inválido'; END IF;
 IF EXISTS(SELECT 1 FROM public.spy_operation_events WHERE request_key=p_key)
  THEN RAISE EXCEPTION 'Chave já utilizada para outra ação'; END IF;
 SELECT * INTO previous FROM public.spy_locations WHERE id=p_id FOR UPDATE;
 IF FOUND THEN
  IF previous.version<>p_expected_version THEN RAISE EXCEPTION 'Localidade mudou de versão'; END IF;
  UPDATE public.spy_locations SET kind=p_kind,ref_id=p_ref,region_id=p_region,
   name=p_name,source=p_source,visibility=p_visibility,approved=p_approved,version=version+1
   WHERE id=p_id RETURNING version INTO v;
 ELSE
  IF p_expected_version<>0 THEN RAISE EXCEPTION 'Nova localidade exige versão zero'; END IF;
  INSERT INTO public.spy_locations(id,kind,ref_id,region_id,name,source,visibility,approved)
   VALUES(p_id,p_kind,p_ref,p_region,p_name,p_source,p_visibility,p_approved)
   RETURNING version INTO v;
 END IF;
 INSERT INTO public.spy_operation_events(request_key,actor,event_type,reason)
 VALUES(p_key,auth.uid(),'location_approved',p_reason);
 RETURN jsonb_build_object('id',p_id,'version',v,'approved',p_approved);
END $spy$;
REVOKE ALL ON FUNCTION public.spy_upsert_location(uuid,text,text,text,text,text,text,boolean,integer,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.spy_upsert_location(uuid,text,text,text,text,text,text,boolean,integer,uuid,text)
 TO authenticated;

CREATE OR REPLACE FUNCTION public.spy_upsert_edge(
 p_id uuid,p_from uuid,p_to uuid,p_mode text,p_base_days integer,
 p_bidirectional boolean,p_approved boolean,p_blocked boolean,
 p_source text,p_expected_version integer,p_key uuid,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $spy$
DECLARE previous public.spy_travel_edges; v integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active() OR NOT public.is_campaign_admin()
  THEN RAISE EXCEPTION 'Narrador obrigatório'; END IF;
 IF p_id IS NULL OR p_from IS NULL OR p_to IS NULL OR p_from=p_to OR
  p_key IS NULL OR p_expected_version<0 OR
  p_mode NOT IN ('foot','horse','caravan','ship') OR
  p_base_days NOT BETWEEN 1 AND 3650 OR
  length(trim(coalesce(p_source,'')))<3 OR length(trim(coalesce(p_reason,'')))<10
 THEN RAISE EXCEPTION 'Trecho inválido'; END IF;
 IF EXISTS(SELECT 1 FROM public.spy_operation_events WHERE request_key=p_key)
  THEN RAISE EXCEPTION 'Chave já utilizada'; END IF;
 IF p_approved AND (SELECT count(*) FROM public.spy_locations WHERE id IN (p_from,p_to) AND approved)=2
 THEN NULL;
 ELSIF p_approved THEN RAISE EXCEPTION 'As duas localidades devem estar homologadas';
 END IF;
 SELECT * INTO previous FROM public.spy_travel_edges WHERE id=p_id FOR UPDATE;
 IF FOUND THEN
  IF previous.version<>p_expected_version THEN RAISE EXCEPTION 'Trecho mudou de versão'; END IF;
  UPDATE public.spy_travel_edges SET from_location_id=p_from,to_location_id=p_to,
   mode=p_mode,base_days=p_base_days,bidirectional=p_bidirectional,
   approved=p_approved,blocked=p_blocked,source=p_source,
   approved_by=CASE WHEN p_approved THEN auth.uid() ELSE NULL END,
   approval_reason=CASE WHEN p_approved THEN p_reason ELSE NULL END,
   version=version+1 WHERE id=p_id RETURNING version INTO v;
 ELSE
  IF p_expected_version<>0 THEN RAISE EXCEPTION 'Novo trecho exige versão zero'; END IF;
  INSERT INTO public.spy_travel_edges(id,from_location_id,to_location_id,
   mode,base_days,bidirectional,approved,blocked,source,approved_by,approval_reason)
  VALUES(p_id,p_from,p_to,p_mode,p_base_days,p_bidirectional,p_approved,p_blocked,
   p_source,CASE WHEN p_approved THEN auth.uid() ELSE NULL END,
   CASE WHEN p_approved THEN p_reason ELSE NULL END)
   RETURNING version INTO v;
 END IF;
 INSERT INTO public.spy_operation_events(request_key,actor,event_type,reason)
 VALUES(p_key,auth.uid(),'route_edge_reviewed',p_reason);
 RETURN jsonb_build_object('id',p_id,'version',v,'approved',p_approved,'blocked',p_blocked);
END $spy$;
REVOKE ALL ON FUNCTION public.spy_upsert_edge(uuid,uuid,uuid,text,integer,boolean,boolean,boolean,text,integer,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.spy_upsert_edge(uuid,uuid,uuid,text,integer,boolean,boolean,boolean,text,integer,uuid,text)
 TO authenticated;

-- This is a reconcile, not a purchase and not a user-admin flag. All holdings
-- come from the database, not arguments. Historical text IDs remain unchanged.
CREATE OR REPLACE FUNCTION public.spy_reconcile_house_agents(
 p_house text,p_key uuid,p_reason text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $spy$
DECLARE sheet public.noble_house_sheets; holding jsonb; domain jsonb;
 current_ref text; source_ref text; kind text; loc_id uuid;
 item text; purchase_proven boolean; parent_valid boolean;
 n integer:=0; pending integer:=0; slot integer; slots integer;
 official_version integer;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active() OR NOT public.is_campaign_admin()
  THEN RAISE EXCEPTION 'Narrador obrigatório'; END IF;
 IF p_house IS NULL OR length(trim(p_house))=0 OR p_key IS NULL OR
  length(trim(coalesce(p_reason,'')))<10 THEN RAISE EXCEPTION 'Casa e justificativa obrigatórias'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('spy:reconcile:'||p_house,0));
 IF EXISTS(SELECT 1 FROM public.spy_operation_events
  WHERE request_key=p_key AND event_type='agents_reconciled') THEN
  RETURN jsonb_build_object('duplicate',true,'created',0);
 END IF;
 IF EXISTS(SELECT 1 FROM public.spy_operation_events WHERE request_key=p_key)
  THEN RAISE EXCEPTION 'Chave reaproveitada'; END IF;
 SELECT * INTO sheet FROM public.noble_house_sheets WHERE house_id=p_house FOR SHARE;
 IF NOT FOUND OR sheet.state->>'houseId' IS DISTINCT FROM p_house OR
  sheet.state->>'phase'<>'active' OR jsonb_typeof(sheet.state->'holdings')<>'array' OR
  jsonb_typeof(sheet.state->'domains')<>'array'
 THEN RAISE EXCEPTION 'Ficha de Casa ativa não conciliada'; END IF;
 SELECT version INTO official_version FROM public.campaign_calendar WHERE id=true;
 IF official_version IS NULL THEN RAISE EXCEPTION 'Hub Temporal indisponível'; END IF;
 FOR holding IN SELECT value FROM jsonb_array_elements(sheet.state->'holdings') LOOP
  IF holding->>'status'<>'active' THEN CONTINUE; END IF;
  item:=holding->>'itemId';
  IF item NOT IN ('pros-spy-network','pros-spy-network--expanded-network','pros-spy-contract-batch')
   THEN CONTINUE; END IF;
  current_ref:=holding->>'id';
  IF length(trim(coalesce(current_ref,''))) NOT BETWEEN 1 AND 155
  THEN RAISE EXCEPTION 'Posse sem identificador estável'; END IF;
  IF item='pros-spy-network--expanded-network' THEN
   SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(sheet.state->'holdings') parent
     WHERE parent->>'id'=holding->>'parentId' AND parent->>'itemId'='pros-spy-network'
      AND parent->>'status'='active') INTO parent_valid;
   IF NOT parent_valid THEN CONTINUE; END IF;
  END IF;
  IF item='pros-spy-contract-batch' THEN
   -- Verify canonical ledger purchase: the same holding was absent BEFORE and
   -- appears AFTER a purchase, with approved 5-Wealth allocation.
   SELECT EXISTS(
    SELECT 1 FROM public.noble_house_ledger ledger
    WHERE ledger.house_id=p_house AND ledger.action='purchase'
      AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(ledger.after_state->'holdings','[]'::jsonb)) a
       WHERE a->>'id'=current_ref AND a->>'itemId'='pros-spy-contract-batch'
       AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(a->'costs','[]'::jsonb)) c
        WHERE c->>'resource'='wealth' AND c->>'mode'='allocation'
        AND c->>'amount'='5'))
      AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(ledger.before_state->'holdings','[]'::jsonb)) before_h
       WHERE before_h->>'id'=current_ref)
   ) INTO purchase_proven;
   IF NOT purchase_proven THEN pending:=pending+2; CONTINUE; END IF;
  END IF;
  SELECT l.id INTO loc_id FROM public.spy_locations l
   WHERE l.kind='domain' AND l.ref_id=holding->>'domainId' AND l.approved
   ORDER BY l.id LIMIT 1;
  slots:=CASE WHEN item='pros-spy-network' THEN 1 ELSE 2 END;
  IF loc_id IS NULL THEN pending:=pending+slots; CONTINUE; END IF;
  kind:=CASE WHEN item='pros-spy-contract-batch' THEN 'contractor' ELSE 'network_cell' END;
  FOR slot IN 0..slots-1 LOOP
   source_ref:=(CASE item WHEN 'pros-spy-network' THEN 'base:'
    WHEN 'pros-spy-network--expanded-network' THEN 'expanded:' ELSE 'contractor:' END)
     ||current_ref||':'||slot::text;
   INSERT INTO public.spy_assets(owner_house_id,kind,codename,source_holding_id,
    source_ref,current_location_id,status,rules_version)
    VALUES(p_house,kind,'Agente '||(slot+1)::text,current_ref,
      source_ref,loc_id,'available','CCA-ESP-MVP-001:2026-11-02')
    ON CONFLICT(owner_house_id,source_ref) DO NOTHING;
   IF FOUND THEN n:=n+1; END IF;
  END LOOP;
  loc_id:=NULL;
 END LOOP;
 INSERT INTO public.spy_operation_events(request_key,actor,event_type,reason,calendar_version)
 VALUES(p_key,auth.uid(),'agents_reconciled',p_reason,official_version);
 RETURN jsonb_build_object('duplicate',false,'created',n,'pending',pending,'house',p_house);
END $spy$;
REVOKE ALL ON FUNCTION public.spy_reconcile_house_agents(text,uuid,text)
 FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.spy_reconcile_house_agents(text,uuid,text) TO authenticated;
COMMIT;
