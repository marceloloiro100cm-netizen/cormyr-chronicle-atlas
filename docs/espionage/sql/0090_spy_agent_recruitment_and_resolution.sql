-- CCA · Escritas transacionais por JWT; nunca executar resolução pela UI do jogador.
-- Missão existente + revisão do Narrador são pré-requisitos. Dados de jogador
-- não podem criar resultados fictícios. Toda mudança tem evento + chave idempotente.
BEGIN;

CREATE OR REPLACE FUNCTION public.spy_recruit_agent(
 p_house text,p_source_holding text,p_codename text,p_request_key uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,pg_temp AS $body$
DECLARE
 v_state jsonb;v_h jsonb;v_capacity integer;v_used integer;
 v_location uuid;v_region text;v_agent uuid;v_calendar record;v_day text;
 v_old record;v_name text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active() OR NOT
  (public.is_campaign_admin() OR public.in_campaign_house(p_house,true))
 THEN RAISE EXCEPTION 'Recrutamento não autorizado'; END IF;
 v_name:=btrim(p_codename);
 IF p_request_key IS NULL OR v_name IS NULL OR char_length(v_name)<2
  OR char_length(v_name)>80 OR v_name ~ '[[:cntrl:]]'
 THEN RAISE EXCEPTION 'Nome ou solicitação inválida'; END IF;
 SELECT n.state INTO v_state FROM public.noble_house_sheets n
  WHERE n.house_id=p_house FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Ficha operacional da Casa necessária para recrutar'; END IF;

 SELECT h.agent_id,h.owner_house_id INTO v_old FROM public.spy_agent_history h
 WHERE h.request_key=p_request_key;
 IF FOUND THEN
  IF v_old.owner_house_id<>p_house THEN RAISE EXCEPTION 'Chave já utilizada por outra Casa'; END IF;
  RETURN (SELECT jsonb_build_object('id',a.id,'codename',a.codename,
     'status',a.status,'rank','Verde','cunning',3,'missionSuccesses',0)
   FROM public.spy_assets a WHERE a.id=v_old.agent_id);
 END IF;

 SELECT h INTO v_h FROM jsonb_array_elements(
  CASE WHEN jsonb_typeof(v_state->'holdings')='array' THEN v_state->'holdings'
   ELSE '[]'::jsonb END) h WHERE h->>'id'=p_source_holding
   AND h->>'status'='active'
   AND h->>'itemId' IN('pros-spy-network','pros-spy-network--expanded-network')
   AND (nullif(h->>'parentId','') IS NULL OR EXISTS(
     SELECT 1 FROM jsonb_array_elements(v_state->'holdings') parent
     WHERE parent->>'id'=h->>'parentId' AND parent->>'status'='active'))
 LIMIT 1;
 IF v_h IS NULL THEN RAISE EXCEPTION 'Fonte ativa da Rede de Espiões não encontrada'; END IF;
 v_capacity:=CASE v_h->>'itemId'
   WHEN 'pros-spy-network' THEN 1 ELSE 2 END;
 SELECT count(*)::integer INTO v_used
 FROM public.spy_assets a WHERE a.owner_house_id=p_house
   AND a.source_holding_id=p_source_holding
   AND a.status NOT IN('captured','dead','lost','retired');
 IF v_used>=v_capacity THEN RAISE EXCEPTION 'Rede sem vaga livre para recrutamento'; END IF;
 SELECT l.id INTO v_location FROM public.spy_locations l
 WHERE l.kind='domain' AND l.ref_id=v_h->>'domainId';
 IF v_location IS NULL THEN
  RAISE EXCEPTION 'Domínio de recrutamento sem localização homologada';
 END IF;

 SELECT c.year,c.month,c.day,c.festival,c.version INTO v_calendar
 FROM public.campaign_calendar c WHERE c.id=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'Hub Temporal indisponível'; END IF;
 v_day:=lpad(v_calendar.year::text,4,'0')||'-'||
  CASE WHEN v_calendar.festival IS NOT NULL
    THEN 'F-'||v_calendar.festival ELSE
    lpad((v_calendar.month+1)::text,2,'0')||'-'||lpad(v_calendar.day::text,2,'0') END;
 IF NOT public.valid_campaign_date(v_day) THEN RAISE EXCEPTION 'Data de campanha inválida'; END IF;
 SELECT l.region_id INTO v_region FROM public.spy_locations l WHERE l.id=v_location;

 INSERT INTO public.spy_assets(
  owner_house_id,kind,codename,source_holding_id,source_ref,current_location_id,
  status,rules_version,mission_successes
 ) VALUES(
  p_house,'network_cell',v_name,p_source_holding,
  'replacement:'||p_source_holding||':'||p_request_key::text,
  v_location,'available','cormyr-agent-tiers-v1',0
 ) RETURNING id INTO v_agent;

 INSERT INTO public.spy_agent_history(
  owner_house_id,agent_id,event_type,event_date_key,calendar_version,
  target_name,target_region,agent_rank,cunning,total_successes,
  detail,request_key,actor
 ) VALUES(
  p_house,v_agent,'recruited',v_day,v_calendar.version,
  v_name,v_region,'Verde',3,0,
  'Novo agente Verde recrutado em vaga livre da Rede de Espiões.',
  p_request_key,auth.uid()
 );
 RETURN jsonb_build_object('id',v_agent,'codename',v_name,
  'status','available','rank','Verde','cunning',3,'missionSuccesses',0);
END $body$;

CREATE OR REPLACE FUNCTION public.spy_resolve_agent_mission(
 p_operation uuid,p_roll integer,p_modifier integer,
 p_discovered boolean,p_guard_override boolean,p_prison_override boolean,
 p_expected_version integer,p_request_key uuid,p_reason text
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,pg_temp AS $body$
DECLARE
 v_op record;v_agent record;v_target record;v_state jsonb;v_holdings jsonb;
 v_law integer;v_defense integer;v_dc integer;v_total integer;
 v_degrees integer:=0;v_outcome text;v_new_status text;v_new_successes integer;
 v_new_rank integer;v_old_rank integer;v_guard boolean;v_prison boolean;
 v_region text;v_region_law integer;v_source text;v_calendar record;
 v_day text;v_old_event record;v_num integer;v_cunning integer;v_detail text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active() OR
    NOT public.is_campaign_admin()
 THEN RAISE EXCEPTION 'Somente o Narrador pode resolver missões e mortes'; END IF;
 IF p_operation IS NULL OR p_request_key IS NULL OR
    p_roll IS NULL OR p_modifier IS NULL OR p_modifier NOT BETWEEN -9 AND 9 OR
    p_discovered IS NULL OR p_expected_version IS NULL OR
    char_length(coalesce(p_reason,''))>1200
 THEN RAISE EXCEPTION 'Resolução incompleta ou inválida'; END IF;

 -- Lock the operation then its assigned agent. All counters and records are atomic.
 SELECT o.* INTO v_op FROM public.spy_operations o WHERE o.id=p_operation FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Missão não cadastrada'; END IF;
 SELECT a.* INTO v_agent FROM public.spy_assets a
 WHERE a.id=v_op.asset_id AND a.owner_house_id=v_op.owner_house_id FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Agente não pertence à missão'; END IF;

 SELECT h.agent_id,h.operation_id,h.event_type INTO v_old_event
 FROM public.spy_agent_history h WHERE h.request_key=p_request_key;
 IF FOUND THEN
  IF v_old_event.agent_id<>v_agent.id OR v_old_event.operation_id<>p_operation
  THEN RAISE EXCEPTION 'Chave já utilizada por outro resultado'; END IF;
  RETURN jsonb_build_object('operationId',p_operation,'agentId',v_agent.id,
   'alreadyApplied',true,'status',v_agent.status,
   'missionSuccesses',v_agent.mission_successes,
   'rank',CASE least(3,v_agent.mission_successes/3)
    WHEN 0 THEN 'Verde' WHEN 1 THEN 'Treinada'
    WHEN 2 THEN 'Veterana' ELSE 'Elite' END,
   'cunning',3+least(3,v_agent.mission_successes/3));
 END IF;
 IF v_op.status<>'pending_narrator_review' OR v_op.target_type<>'house'
 THEN RAISE EXCEPTION 'Apenas missões de Casa aguardando revisão podem ser resolvidas'; END IF;
 IF EXISTS(SELECT 1 FROM public.spy_operation_segments os
  WHERE os.operation_id=p_operation AND os.status<>'arrived')
 THEN RAISE EXCEPTION 'Viagem ainda não homologada como concluída'; END IF;
 IF v_agent.status IN('captured','dead','lost','retired') OR
    v_agent.version<>p_expected_version
 THEN RAISE EXCEPTION 'Agente indisponível ou modificado: atualize a ficha'; END IF;

 v_cunning:=3+least(3,v_agent.mission_successes/3);
 IF p_roll NOT BETWEEN v_cunning AND v_cunning*6
 THEN RAISE EXCEPTION 'Rolagem incompatível com a Astúcia do agente'; END IF;

 SELECT c.name,c.region,n.state,s.law AS imported_law,s.region_id
 INTO v_target FROM public.house_catalog c
 LEFT JOIN public.noble_house_sheets n ON n.house_id=c.id
 LEFT JOIN public.spy_noble_house_stats s ON s.house_id=c.id
 WHERE c.id=v_op.target_id AND c.public_reviewed IS TRUE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Casa-alvo oficial não encontrada'; END IF;

 v_region:=lower(replace(coalesce(v_target.region_id,v_target.region),' ',''));
 IF v_region='crownland' THEN v_region:='crownlands'; END IF;
 IF v_region='swordmarch' THEN v_region:='swordmark'; END IF;
 v_region_law:=CASE v_region
  WHEN 'crownlands' THEN 20 WHEN 'veilstone' THEN 5
  WHEN 'shieldmark' THEN 10 WHEN 'helmlands' THEN 10
  WHEN 'horselands' THEN 5 WHEN 'dragoncoast' THEN 0
  WHEN 'swordmark' THEN 10 WHEN 'ferlin' THEN 10
  WHEN 'stonelands' THEN 0 WHEN 'elfhold' THEN 15
  WHEN 'volkumburgh' THEN 5 ELSE NULL END;
 IF v_region_law IS NULL THEN RAISE EXCEPTION 'Região do alvo inválida'; END IF;

 IF v_target.state IS NOT NULL THEN
  v_state:=v_target.state;
  IF NOT (v_state->'base' ? 'law') OR
     NOT (v_state->'permanent' ? 'law') THEN
   RAISE EXCEPTION 'Ficha do alvo está incompleta: requer revisão'; END IF;
  v_law:=(v_state#>>'{base,law}')::integer+(v_state#>>'{permanent,law}')::integer;
  IF v_state->>'regionalApplied'='true' AND v_state->>'method'<>'import'
  THEN v_law:=v_law+v_region_law; END IF;
  SELECT v_law+coalesce(sum(greatest(0,(m->'changes'->>'law')::integer)),0)::integer
   INTO v_law FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(v_state->'mailConsequences')='array'
      THEN v_state->'mailConsequences' ELSE '[]'::jsonb END) m
   WHERE m->>'active'='true';
  v_holdings:=CASE WHEN jsonb_typeof(v_state->'holdings')='array'
    THEN v_state->'holdings' ELSE '[]'::jsonb END;
  SELECT
   EXISTS(SELECT 1 FROM jsonb_array_elements(v_holdings) h
    WHERE h->>'status'='active'
      AND h->>'itemId' IN('pros-bailiffs','pros-secret-police',
      'pros-bailiffs--military-training')),
   EXISTS(SELECT 1 FROM jsonb_array_elements(v_holdings) h
    WHERE h->>'status'='active' AND h->>'itemId'='pros-gaol')
  INTO v_guard,v_prison;
  -- A active guard detachment or garrison also counts as protection.
  IF NOT v_guard THEN
   SELECT EXISTS(
    SELECT 1 FROM jsonb_array_elements(CASE
      WHEN jsonb_typeof(v_state->'units')='array'
      THEN v_state->'units' ELSE '[]'::jsonb END) u
    WHERE coalesce(u->>'destroyed','false')='false'
      AND (lower(coalesce(u->>'name','')) ~ '(guarda|garrison|guarnição)'
        OR lower(coalesce(u->>'type','')) ~ '(guard|garrison)')
   ) INTO v_guard;
  END IF;
  SELECT CASE WHEN EXISTS(
     SELECT 1 FROM jsonb_array_elements(v_holdings) h
     WHERE h->>'status'='active'
       AND h->>'itemId'='pros-black-market--ear-in-the-underworld'
   ) THEN 3 ELSE 0 END INTO v_num;
  v_defense:=v_law+v_num;
  v_source:='operational_sheet';
 ELSE
  v_law:=coalesce(v_target.imported_law,v_region_law+10);
  -- NPCs without an operational sheet lack a verifiable inventory.
  -- The narrator explicitly confirms guards/prisons instead of inventing them.
  IF p_guard_override IS NULL OR p_prison_override IS NULL
  THEN RAISE EXCEPTION 'Alvo NPC sem inventário: confirme guarda e cadeia'; END IF;
  v_guard:=p_guard_override;v_prison:=p_prison_override;
  v_defense:=v_law;
  v_source:=CASE WHEN v_target.imported_law IS NOT NULL
   THEN 'official_spreadsheet' ELSE 'regional_fallback' END;
 END IF;

 IF v_law IS NULL OR v_law<0 OR v_law>100000 OR v_defense<0
 THEN RAISE EXCEPTION 'Lei/Defesa não homologada'; END IF;
 v_dc:=6+3*least(5,v_defense/20);
 v_total:=p_roll+p_modifier;
 v_degrees:=ceil(greatest(0,v_dc-v_total)/5.0)::integer;
 IF v_total>=v_dc THEN v_outcome:='mission_success';
 ELSIF NOT p_discovered THEN v_outcome:='mission_failure';
 ELSIF v_degrees<=1 THEN v_outcome:='escaped';
 ELSIF v_degrees>=3 AND v_law>=30 AND v_guard THEN v_outcome:='dead';
 ELSIF v_degrees>=2 AND v_law>=15 AND v_guard AND v_prison
  THEN v_outcome:='captured';
 ELSE v_outcome:='escaped';
 END IF;

 v_old_rank:=least(3,v_agent.mission_successes/3);
 v_new_successes:=v_agent.mission_successes+
  CASE WHEN v_outcome='mission_success' THEN 1 ELSE 0 END;
 v_new_rank:=least(3,v_new_successes/3);
 v_new_status:=CASE v_outcome
   WHEN 'captured' THEN 'captured' WHEN 'dead' THEN 'dead'
   ELSE 'available' END;
 SELECT c.year,c.month,c.day,c.festival,c.version INTO v_calendar
 FROM public.campaign_calendar c WHERE c.id=true;
 IF NOT FOUND THEN RAISE EXCEPTION 'Data oficial indisponível'; END IF;
 v_day:=lpad(v_calendar.year::text,4,'0')||'-'||
  CASE WHEN v_calendar.festival IS NOT NULL THEN 'F-'||v_calendar.festival
    ELSE lpad((v_calendar.month+1)::text,2,'0')||'-'||
         lpad(v_calendar.day::text,2,'0') END;
 IF NOT public.valid_campaign_date(v_day)
 THEN RAISE EXCEPTION 'Data oficial de Cormyr inválida'; END IF;

 UPDATE public.spy_assets SET
  mission_successes=v_new_successes,status=v_new_status,version=version+1
 WHERE id=v_agent.id AND owner_house_id=v_op.owner_house_id;
 UPDATE public.spy_operations SET status='completed',version=version+1
 WHERE id=v_op.id;
 v_detail:=CASE v_outcome
  WHEN 'mission_success' THEN 'Missão bem-sucedida em '||v_target.name
  WHEN 'mission_failure' THEN 'Missão fracassada sem descoberta em '||v_target.name
  WHEN 'escaped' THEN 'Fugiu após ser descoberto em '||v_target.name
  WHEN 'captured' THEN 'Preso em operação contra '||v_target.name
  WHEN 'dead' THEN 'Morto em operação contra '||v_target.name
 END;
 IF nullif(btrim(coalesce(p_reason,'')),'') IS NOT NULL THEN
  v_detail:=v_detail||' · '||left(btrim(p_reason),1200);
 END IF;
 INSERT INTO public.spy_agent_history(
  owner_house_id,agent_id,operation_id,event_type,
  event_date_key,calendar_version,target_house_id,target_name,target_region,
  agent_rank,cunning,total_successes,roll_total,modifier,
  target_difficulty,failure_degrees,law_snapshot,guard_present,prison_present,
  detail,request_key,actor
 ) VALUES(
  v_op.owner_house_id,v_agent.id,v_op.id,v_outcome,
  v_day,v_calendar.version,v_op.target_id,v_target.name,v_region,
  CASE v_new_rank WHEN 0 THEN 'Verde' WHEN 1 THEN 'Treinada'
   WHEN 2 THEN 'Veterana' ELSE 'Elite' END,
  3+v_new_rank,v_new_successes,p_roll,p_modifier,
  v_dc,v_degrees,v_law,v_guard,v_prison,v_detail,p_request_key,auth.uid()
 );
 IF v_new_rank>v_old_rank THEN
  INSERT INTO public.spy_agent_history(
   owner_house_id,agent_id,operation_id,event_type,event_date_key,calendar_version,
   target_house_id,target_name,target_region,agent_rank,cunning,total_successes,
   detail,request_key,actor
  ) VALUES(
   v_op.owner_house_id,v_agent.id,v_op.id,'promoted',v_day,v_calendar.version,
   v_op.target_id,v_target.name,v_region,
   CASE v_new_rank WHEN 1 THEN 'Treinada'
    WHEN 2 THEN 'Veterana' ELSE 'Elite' END,
   3+v_new_rank,v_new_successes,
   'Promoção automática após 3 sucessos adicionais.',
   gen_random_uuid(),auth.uid()
  );
 END IF;
 INSERT INTO public.spy_mission_decisions(
   operation_id,target_law,law_source,difficulty,rule_version,
   modifiers,resolution,reviewer,rationale
 ) VALUES(
   v_op.id,v_law,v_source,v_dc,'cormyr-agent-tiers-v1',
   jsonb_build_object('roll',p_roll,'cunning',v_cunning,
     'modifier',p_modifier,'discovered',p_discovered,'degrees',v_degrees,
     'guardPresent',v_guard,'prisonPresent',v_prison,
     'outcome',v_outcome,'provenance',v_source),
   CASE v_outcome WHEN 'mission_success' THEN 'success'
    WHEN 'mission_failure' THEN 'failure' ELSE v_outcome END,
   auth.uid(),v_detail
 );
 INSERT INTO public.spy_operation_events(
  operation_id,request_key,actor,event_type,old_state,new_state,
  reason,calendar_version
 ) VALUES(
  v_op.id,p_request_key,auth.uid(),'agent_mission_resolved',
  v_op.status,'completed',v_detail,v_calendar.version
 );
 RETURN jsonb_build_object(
  'operationId',v_op.id,'agentId',v_agent.id,'alreadyApplied',false,
  'outcome',v_outcome,'rank',CASE v_new_rank WHEN 0 THEN 'Verde'
   WHEN 1 THEN 'Treinada' WHEN 2 THEN 'Veterana' ELSE 'Elite' END,
  'cunning',3+v_new_rank,'missionSuccesses',v_new_successes,
  'promoted',v_new_rank>v_old_rank,'status',v_new_status,
  'dateKey',v_day,'targetName',v_target.name,
  'failureDegrees',v_degrees,'difficulty',v_dc);
END $body$;

REVOKE ALL ON FUNCTION public.spy_recruit_agent(text,text,text,uuid) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.spy_resolve_agent_mission(uuid,integer,integer,boolean,boolean,boolean,integer,uuid,text)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spy_recruit_agent(text,text,text,uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.spy_resolve_agent_mission(uuid,integer,integer,boolean,boolean,boolean,integer,uuid,text)
 TO authenticated;
COMMIT;
