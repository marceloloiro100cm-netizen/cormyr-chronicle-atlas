-- 0101 · Enviar ordem de espionagem a uma Casa nobre, sem simular o deslocamento.
-- O mapa do Narrador serve como PREVIA, não como autorização de rota. A
-- operação permanece 'planned' até homologação operacional pelo Narrador.
-- Não publica calendário, não registra chegada e não gera resultado/XP.
BEGIN;

CREATE OR REPLACE FUNCTION public.spy_submit_house_mission(
 p_house text,p_agent uuid,p_target text,p_destination text,
 p_expected_agent_version integer,p_expected_calendar_version integer,
 p_request_key uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,pg_temp AS $body$
DECLARE
 v_agent record;v_target record;v_old record;v_calendar record;
 v_origin text;v_destination text;v_operation uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
  OR NOT (public.is_campaign_admin() OR public.in_campaign_house(p_house,true))
 THEN RAISE EXCEPTION 'Envio de missão não autorizado para esta Casa'; END IF;

 IF nullif(btrim(coalesce(p_house,'')),'') IS NULL OR p_agent IS NULL
  OR nullif(btrim(coalesce(p_target,'')),'') IS NULL
  OR nullif(btrim(coalesce(p_destination,'')),'') IS NULL
  OR p_expected_agent_version IS NULL OR p_expected_agent_version<1
  OR p_expected_calendar_version IS NULL OR p_expected_calendar_version<1
  OR p_request_key IS NULL
 THEN RAISE EXCEPTION 'Dados incompletos para registrar a missão'; END IF;

 -- Lock exclusivo por agente: impede missão duplicada e disputas simultâneas.
 PERFORM pg_advisory_xact_lock(hashtextextended('spy-agent:'||p_agent::text,0));
 SELECT a.id,a.owner_house_id,a.status,a.version,a.current_location_id,
        l.region_id,l.approved AS location_approved
 INTO v_agent FROM public.spy_assets a
 LEFT JOIN public.spy_locations l ON l.id=a.current_location_id
 WHERE a.id=p_agent AND a.owner_house_id=p_house FOR UPDATE OF a;
 IF NOT FOUND THEN RAISE EXCEPTION 'Espião não encontrado nesta Casa'; END IF;

 -- Retentativas da mesma solicitação não lançam uma segunda missão.
 SELECT o.id,o.asset_id,o.target_id,o.target_type,o.status,
        o.source_calendar_version INTO v_old
 FROM public.spy_operations o
 WHERE o.owner_house_id=p_house AND o.operation_key=p_request_key;
 IF FOUND THEN
  IF v_old.asset_id<>p_agent OR v_old.target_id<>p_target
   OR v_old.target_type<>'house'
  THEN RAISE EXCEPTION 'Chave de operação já utilizada em outra missão'; END IF;
  RETURN jsonb_build_object(
   'operationId',v_old.id,'agentId',v_old.asset_id,
   'targetHouseId',v_old.target_id,'status',v_old.status,
   'alreadyApplied',true,'calendarVersion',v_old.source_calendar_version);
 END IF;
 IF EXISTS(SELECT 1 FROM public.spy_operation_events e
  WHERE e.request_key=p_request_key)
 THEN RAISE EXCEPTION 'Chave de operação já utilizada'; END IF;

 IF v_agent.status<>'available' OR v_agent.version<>p_expected_agent_version
 THEN RAISE EXCEPTION 'Espião indisponível ou ficha desatualizada'; END IF;
 IF v_agent.region_id IS NULL OR v_agent.location_approved IS DISTINCT FROM true
 THEN RAISE EXCEPTION 'Localização do espião não homologada'; END IF;
 IF EXISTS(SELECT 1 FROM public.spy_operations o
  WHERE o.owner_house_id=p_house AND o.asset_id=p_agent
   AND o.status NOT IN('completed','cancelled'))
 THEN RAISE EXCEPTION 'Espião já possui missão em aberto'; END IF;

 SELECT c.id,c.name,c.region INTO v_target FROM public.house_catalog c
 WHERE c.id=p_target AND c.public_reviewed=true
  AND c.classification IN('noble','major','royal');
 IF NOT FOUND OR v_target.id=p_house
 THEN RAISE EXCEPTION 'Casa-alvo desconhecida ou inválida'; END IF;
 v_origin:=lower(regexp_replace(v_agent.region_id,'[[:space:]]','','g'));
 v_destination:=lower(regexp_replace(v_target.region,'[[:space:]]','','g'));
 IF v_origin='swordmarch' THEN v_origin:='swordmark'; END IF;
 IF v_origin='crownland' THEN v_origin:='crownlands'; END IF;
 IF v_destination='swordmarch' THEN v_destination:='swordmark'; END IF;
 IF v_destination='crownland' THEN v_destination:='crownlands'; END IF;
 IF v_destination<>lower(regexp_replace(p_destination,'[[:space:]]','','g'))
 THEN RAISE EXCEPTION 'A Casa não pertence à região selecionada'; END IF;

 SELECT c.version INTO v_calendar FROM public.campaign_calendar c
 WHERE c.id=true FOR SHARE;
 IF NOT FOUND OR v_calendar.version<>p_expected_calendar_version
 THEN RAISE EXCEPTION 'Calendário atualizado. Recalcule a missão antes de confirmar'; END IF;

 INSERT INTO public.spy_operations(
  owner_house_id,asset_id,operation_key,target_type,target_id,
  mission_kind,requested_fields,status,source_calendar_version,
  rules_version,created_by
 ) VALUES(
  p_house,p_agent,p_request_key,'house',p_target,
  'house_recon',ARRAY['house_overview']::text[],'planned',
  v_calendar.version,'cormyr-agent-tiers-v1',auth.uid()
 ) RETURNING id INTO v_operation;

 UPDATE public.spy_assets
 SET status='assigned',version=version+1
 WHERE id=p_agent AND owner_house_id=p_house;

 INSERT INTO public.spy_operation_events(
  operation_id,request_key,actor,event_type,old_state,new_state,
  reason,calendar_version
 ) VALUES(
  v_operation,p_request_key,auth.uid(),'house_mission_submitted',
  'available','assigned',
  'Ordem para investigar '||v_target.name||' ('||v_destination||
  '), origem real '||v_origin||
  '. A rota e a chegada exigem homologação antes da investigação.',
  v_calendar.version
 );

 RETURN jsonb_build_object(
  'operationId',v_operation,'agentId',p_agent,'targetHouseId',p_target,
  'status','planned','alreadyApplied',false,
  'calendarVersion',v_calendar.version);
END $body$;

REVOKE ALL ON FUNCTION public.spy_submit_house_mission(
 text,uuid,text,text,integer,integer,uuid
) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.spy_submit_house_mission(
 text,uuid,text,text,integer,integer,uuid
) TO authenticated;
COMMIT;
