-- Cormyr · Cadastro de espiões com avatar exclusivo por Casa.
-- Nenhuma imagem é criada sem o link fornecido pelo Narrador.
-- Todas as melhorias opcionais são compradas NA MESMA transação de recrutamento.
BEGIN;
CREATE TABLE IF NOT EXISTS public.spy_portrait_catalog(
 id text PRIMARY KEY CHECK(length(id) BETWEEN 1 AND 80 AND id ~ '^[a-z0-9][a-z0-9_-]*$'),
 label text NOT NULL CHECK(length(label) BETWEEN 1 AND 100),
 image_url text NOT NULL CHECK(image_url ~ '^https://[^[:space:]<>]+
 sort_order integer NOT NULL DEFAULT 0,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.spy_portrait_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS spy_portrait_catalog_read ON public.spy_portrait_catalog;
CREATE POLICY spy_portrait_catalog_read ON public.spy_portrait_catalog
 FOR SELECT TO authenticated USING(public.campaign_access_active());
REVOKE ALL ON public.spy_portrait_catalog FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.spy_portrait_catalog TO authenticated;
ALTER TABLE public.spy_assets ADD COLUMN IF NOT EXISTS portrait_id text
 REFERENCES public.spy_portrait_catalog(id) ON DELETE RESTRICT;
-- O retrato continua reservado mesmo após prisão/morte, preservando histórico.
CREATE UNIQUE INDEX IF NOT EXISTS spy_agent_portrait_house_unique
 ON public.spy_assets(owner_house_id,portrait_id) WHERE portrait_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.spy_house_management(p_house text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $body$
DECLARE v_agents jsonb;v_operations jsonb;v_history jsonb;v_recruitment jsonb;v_portraits jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active() OR
  NOT (public.is_campaign_admin() OR public.in_campaign_house(p_house,false))
 THEN RAISE EXCEPTION 'Gerenciamento de agentes não autorizado para esta Casa'; END IF;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',a.id,'codename',a.codename,'status',a.status,'version',a.version,
  'currentRegion',CASE WHEN l.kind='region' THEN l.ref_id ELSE l.region_id END,
  'missionSuccesses',a.mission_successes,
  'rank',CASE least(3,a.mission_successes/3)
    WHEN 0 THEN 'Verde' WHEN 1 THEN 'Treinada'
    WHEN 2 THEN 'Veterana' ELSE 'Elite' END,
  'cunning',3+least(3,a.mission_successes/3),
  'toNextRank',CASE WHEN a.mission_successes>=9 THEN 0
    ELSE 3-a.mission_successes%3 END,
  'sourceHoldingId',a.source_holding_id,
  'portraitId',a.portrait_id,
  'forgedDocuments',EXISTS(SELECT 1 FROM public.spy_agent_upgrades u
    WHERE u.agent_id=a.id AND u.upgrade_code='forged_documents'),
  'aceInTheHole',EXISTS(SELECT 1 FROM public.spy_agent_upgrades u
    WHERE u.agent_id=a.id AND u.upgrade_code='ace_in_the_hole')
 ) ORDER BY a.created_at,a.id),'[]'::jsonb)
 INTO v_agents
 FROM public.spy_assets a LEFT JOIN public.spy_locations l ON l.id=a.current_location_id
 WHERE a.owner_house_id=p_house;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',o.id,'assetId',o.asset_id,'missionKind',o.mission_kind,
   'targetType',o.target_type,'targetId',o.target_id,'status',o.status,
   'travelDays',CASE WHEN s.total_segments>0 THEN s.travel_days ELSE NULL END,
   'arrivalKey',s.last_arrival,'createdAt',o.created_at
  ) ORDER BY o.created_at DESC,o.id),'[]'::jsonb)
 INTO v_operations
 FROM public.spy_operations o
 LEFT JOIN LATERAL(
  SELECT count(*)::int AS total_segments,
   sum(os.duration_days)::int AS travel_days,
   (SELECT s2.arrival_key FROM public.spy_operation_segments s2
    WHERE s2.operation_id=o.id AND s2.status<>'cancelled'
    ORDER BY s2.ordinal DESC LIMIT 1) AS last_arrival
  FROM public.spy_operation_segments os
  WHERE os.operation_id=o.id AND os.status<>'cancelled'
 ) s ON true
 WHERE o.owner_house_id=p_house;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',h.id,'agentId',h.agent_id,'eventType',h.event_type,
  'dateKey',h.event_date_key,'targetName',h.target_name,
  'targetRegion',h.target_region,'detail',h.detail,
  'rank',h.agent_rank,'cunning',h.cunning,
  'totalSuccesses',h.total_successes,'failureDegrees',h.failure_degrees,
  'operationId',h.operation_id
 ) ORDER BY h.created_at DESC,h.id DESC),'[]'::jsonb)
 INTO v_history
 FROM public.spy_agent_history h WHERE h.owner_house_id=p_house;

 -- Three base cells per active Spy Network holding, two per active expansion.
 SELECT coalesce(jsonb_agg(jsonb_build_object(
    'sourceHoldingId',v.id,'name',v.name,'capacity',v.capacity,
    'occupied',v.occupied,'vacancies',greatest(0,v.capacity-v.occupied)
 ) ORDER BY v.name,v.id),'[]'::jsonb) INTO v_recruitment
 FROM (
  SELECT h->>'id' AS id,h->>'name' AS name,
   CASE h->>'itemId' WHEN 'pros-spy-network' THEN 3 ELSE 2 END AS capacity,
   (SELECT count(*)::int FROM public.spy_assets a
    WHERE a.owner_house_id=p_house AND a.source_holding_id=h->>'id'
      AND a.status NOT IN('captured','dead','lost','retired')) AS occupied
  FROM public.noble_house_sheets n,
       LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(n.state->'holdings')='array'
         THEN n.state->'holdings' ELSE '[]'::jsonb END) h
  WHERE n.house_id=p_house
    AND h->>'status'='active'
    AND h->>'itemId' IN('pros-spy-network','pros-spy-network--expanded-network')
    AND (nullif(h->>'parentId','') IS NULL OR EXISTS(
     SELECT 1 FROM jsonb_array_elements(n.state->'holdings') parent
     WHERE parent->>'id'=h->>'parentId' AND parent->>'status'='active'))
 ) v;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',c.id,'label',c.label,'imageUrl',c.image_url,
  'assignedAgentId',a.id
 ) ORDER BY c.sort_order,c.id),'[]'::jsonb) INTO v_portraits
 FROM public.spy_portrait_catalog c
 LEFT JOIN public.spy_assets a ON a.portrait_id=c.id AND a.owner_house_id=p_house
 WHERE c.active=true;
 RETURN jsonb_build_object(
  'houseId',p_house,'agents',v_agents,'operations',v_operations,
  'history',v_history,'recruitment',v_recruitment,'portraits',v_portraits,
  'houseVersion',(SELECT n.version FROM public.noble_house_sheets n
    WHERE n.house_id=p_house));
END $body$;
-- Evitar consultas diretas adicionais a posse/privilegio do jogador:
-- Dados de equipamento e catálogo de retratos vêm somente da leitura
-- de Casa já autenticada por spy_house_management.

CREATE OR REPLACE FUNCTION public.spy_assign_agent_portrait(
 p_house text,p_agent uuid,p_portrait text,p_expected_version integer
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,pg_temp AS $body$
DECLARE v_agent record;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active() OR
  NOT(public.is_campaign_admin() OR public.in_campaign_house(p_house,true))
 THEN RAISE EXCEPTION 'Retrato não autorizado para a Casa'; END IF;
 IF p_portrait IS NULL OR p_expected_version IS NULL
 THEN RAISE EXCEPTION 'Seleção de retrato incompleta'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.spy_portrait_catalog c
   WHERE c.id=p_portrait AND c.active=true)
 THEN RAISE EXCEPTION 'Retrato não faz parte da galeria disponível'; END IF;
 SELECT * INTO v_agent FROM public.spy_assets a
  WHERE a.owner_house_id=p_house AND a.id=p_agent FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Agente não pertence à Casa'; END IF;
 IF v_agent.version<>p_expected_version THEN
  RAISE EXCEPTION 'Ficha alterada; recarregue antes de escolher retrato'; END IF;
 IF v_agent.portrait_id IS DISTINCT FROM p_portrait THEN
  UPDATE public.spy_assets SET portrait_id=p_portrait,version=version+1
    WHERE id=p_agent;
 END IF;
 RETURN jsonb_build_object('agentId',p_agent,'portraitId',p_portrait,
  'version',CASE WHEN v_agent.portrait_id IS DISTINCT FROM p_portrait
   THEN v_agent.version+1 ELSE v_agent.version END);
END $body$;
REVOKE ALL ON FUNCTION public.spy_assign_agent_portrait(text,uuid,text,integer)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spy_assign_agent_portrait(text,uuid,text,integer)
 TO authenticated;

CREATE OR REPLACE FUNCTION public.spy_create_agent(
 p_house text,p_source_holding text,p_codename text,p_portrait text,
 p_upgrades text[],p_request_key uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,pg_temp AS $body$
DECLARE
 v_codes text[]:=coalesce(p_upgrades,ARRAY[]::text[]);
 v_existing record;v_recruited jsonb;v_agent uuid;v_code text;
 v_agent_version integer;v_house_version integer;v_portrait text;
 v_is_repeat boolean:=false;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active() OR
  NOT(public.is_campaign_admin() OR public.in_campaign_house(p_house,true))
 THEN RAISE EXCEPTION 'Criação de agente não autorizada'; END IF;
 IF p_request_key IS NULL OR p_source_holding IS NULL OR
  char_length(btrim(coalesce(p_codename,''))) NOT BETWEEN 2 AND 80 OR
  coalesce(p_codename,'') ~ '[[:cntrl:]]'
 THEN RAISE EXCEPTION 'Nome ou solicitação inválida'; END IF;
 IF cardinality(v_codes)>2 OR
  (SELECT count(DISTINCT x) FROM unnest(v_codes) x)<>cardinality(v_codes) OR
  EXISTS(SELECT 1 FROM unnest(v_codes) x
     WHERE x IS NULL OR x NOT IN('forged_documents','ace_in_the_hole'))
 THEN RAISE EXCEPTION 'Melhorias inválidas ou repetidas'; END IF;

 -- Mesmo bloqueio das compras de Riqueza; nenhuma compra pode se intercalar.
 PERFORM pg_advisory_xact_lock(hashtextextended('noble:'||p_house,0));
 SELECT h.agent_id,h.owner_house_id,a.codename,a.source_holding_id,a.portrait_id
  INTO v_existing FROM public.spy_agent_history h
  JOIN public.spy_assets a ON a.id=h.agent_id
  WHERE h.request_key=p_request_key AND h.event_type='recruited';
 IF FOUND THEN
  IF v_existing.owner_house_id<>p_house OR
    v_existing.source_holding_id<>p_source_holding OR
    v_existing.codename<>btrim(p_codename) OR
    v_existing.portrait_id IS DISTINCT FROM p_portrait OR
    (SELECT array_agg(u.upgrade_code ORDER BY u.upgrade_code)
      FROM public.spy_agent_upgrades u WHERE u.agent_id=v_existing.agent_id)
    IS DISTINCT FROM
    (SELECT array_agg(x ORDER BY x) FROM unnest(v_codes) x)
  THEN RAISE EXCEPTION 'Chave de criação já usada com outros dados'; END IF;
  v_agent:=v_existing.agent_id;
  v_is_repeat:=true;
 ELSE
  IF EXISTS(SELECT 1 FROM public.spy_agent_history WHERE request_key=p_request_key)
  THEN RAISE EXCEPTION 'Chave de solicitação já utilizada'; END IF;
  IF p_portrait IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.spy_portrait_catalog
      WHERE id=p_portrait AND active=true)
   THEN RAISE EXCEPTION 'Retrato indisponível'; END IF;
  ELSIF EXISTS(SELECT 1 FROM public.spy_portrait_catalog WHERE active=true)
   THEN RAISE EXCEPTION 'Selecione um retrato antes de criar o espião';
  END IF;
  v_recruited:=public.spy_recruit_agent(p_house,p_source_holding,
    btrim(p_codename),p_request_key);
  v_agent:=(v_recruited->>'id')::uuid;
  IF p_portrait IS NOT NULL THEN
   UPDATE public.spy_assets SET portrait_id=p_portrait
     WHERE id=v_agent AND owner_house_id=p_house;
  END IF;
  FOREACH v_code IN ARRAY v_codes LOOP
   SELECT version INTO v_agent_version FROM public.spy_assets WHERE id=v_agent;
   SELECT version INTO v_house_version FROM public.noble_house_sheets
     WHERE house_id=p_house;
   PERFORM public.spy_buy_agent_upgrade(p_house,v_agent,v_code,
     v_agent_version,v_house_version,md5(p_request_key::text||':'||v_code)::uuid);
  END LOOP;
 END IF;
 SELECT a.version,a.portrait_id INTO v_agent_version,v_portrait
  FROM public.spy_assets a WHERE a.id=v_agent AND a.owner_house_id=p_house;
 RETURN jsonb_build_object('id',v_agent,'codename',btrim(p_codename),
  'rank','Verde','cunning',3,'status','available','missionSuccesses',0,
  'portraitId',v_portrait,'version',v_agent_version,
  'upgrades',to_jsonb(v_codes),'alreadyApplied',v_is_repeat);
END $body$;
REVOKE ALL ON FUNCTION public.spy_create_agent(text,text,text,text,text[],uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spy_create_agent(text,text,text,text,text[],uuid)
 TO authenticated;
COMMIT;
 AND
   length(image_url) BETWEEN 12 AND 2048),
 sort_order integer NOT NULL DEFAULT 0,
 active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.spy_portrait_catalog ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS spy_portrait_catalog_read ON public.spy_portrait_catalog;
CREATE POLICY spy_portrait_catalog_read ON public.spy_portrait_catalog
 FOR SELECT TO authenticated USING(public.campaign_access_active());
REVOKE ALL ON public.spy_portrait_catalog FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.spy_portrait_catalog TO authenticated;
ALTER TABLE public.spy_assets ADD COLUMN IF NOT EXISTS portrait_id text
 REFERENCES public.spy_portrait_catalog(id) ON DELETE RESTRICT;
-- O retrato continua reservado mesmo após prisão/morte, preservando histórico.
CREATE UNIQUE INDEX IF NOT EXISTS spy_agent_portrait_house_unique
 ON public.spy_assets(owner_house_id,portrait_id) WHERE portrait_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.spy_house_management(p_house text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $body$
DECLARE v_agents jsonb;v_operations jsonb;v_history jsonb;v_recruitment jsonb;v_portraits jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active() OR
  NOT (public.is_campaign_admin() OR public.in_campaign_house(p_house,false))
 THEN RAISE EXCEPTION 'Gerenciamento de agentes não autorizado para esta Casa'; END IF;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',a.id,'codename',a.codename,'status',a.status,'version',a.version,
  'currentRegion',CASE WHEN l.kind='region' THEN l.ref_id ELSE l.region_id END,
  'missionSuccesses',a.mission_successes,
  'rank',CASE least(3,a.mission_successes/3)
    WHEN 0 THEN 'Verde' WHEN 1 THEN 'Treinada'
    WHEN 2 THEN 'Veterana' ELSE 'Elite' END,
  'cunning',3+least(3,a.mission_successes/3),
  'toNextRank',CASE WHEN a.mission_successes>=9 THEN 0
    ELSE 3-a.mission_successes%3 END,
  'sourceHoldingId',a.source_holding_id,
  'portraitId',a.portrait_id,
  'forgedDocuments',EXISTS(SELECT 1 FROM public.spy_agent_upgrades u
    WHERE u.agent_id=a.id AND u.upgrade_code='forged_documents'),
  'aceInTheHole',EXISTS(SELECT 1 FROM public.spy_agent_upgrades u
    WHERE u.agent_id=a.id AND u.upgrade_code='ace_in_the_hole')
 ) ORDER BY a.created_at,a.id),'[]'::jsonb)
 INTO v_agents
 FROM public.spy_assets a LEFT JOIN public.spy_locations l ON l.id=a.current_location_id
 WHERE a.owner_house_id=p_house;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',o.id,'assetId',o.asset_id,'missionKind',o.mission_kind,
   'targetType',o.target_type,'targetId',o.target_id,'status',o.status,
   'travelDays',CASE WHEN s.total_segments>0 THEN s.travel_days ELSE NULL END,
   'arrivalKey',s.last_arrival,'createdAt',o.created_at
  ) ORDER BY o.created_at DESC,o.id),'[]'::jsonb)
 INTO v_operations
 FROM public.spy_operations o
 LEFT JOIN LATERAL(
  SELECT count(*)::int AS total_segments,
   sum(os.duration_days)::int AS travel_days,
   (SELECT s2.arrival_key FROM public.spy_operation_segments s2
    WHERE s2.operation_id=o.id AND s2.status<>'cancelled'
    ORDER BY s2.ordinal DESC LIMIT 1) AS last_arrival
  FROM public.spy_operation_segments os
  WHERE os.operation_id=o.id AND os.status<>'cancelled'
 ) s ON true
 WHERE o.owner_house_id=p_house;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',h.id,'agentId',h.agent_id,'eventType',h.event_type,
  'dateKey',h.event_date_key,'targetName',h.target_name,
  'targetRegion',h.target_region,'detail',h.detail,
  'rank',h.agent_rank,'cunning',h.cunning,
  'totalSuccesses',h.total_successes,'failureDegrees',h.failure_degrees,
  'operationId',h.operation_id
 ) ORDER BY h.created_at DESC,h.id DESC),'[]'::jsonb)
 INTO v_history
 FROM public.spy_agent_history h WHERE h.owner_house_id=p_house;

 -- Three base cells per active Spy Network holding, two per active expansion.
 SELECT coalesce(jsonb_agg(jsonb_build_object(
    'sourceHoldingId',v.id,'name',v.name,'capacity',v.capacity,
    'occupied',v.occupied,'vacancies',greatest(0,v.capacity-v.occupied)
 ) ORDER BY v.name,v.id),'[]'::jsonb) INTO v_recruitment
 FROM (
  SELECT h->>'id' AS id,h->>'name' AS name,
   CASE h->>'itemId' WHEN 'pros-spy-network' THEN 3 ELSE 2 END AS capacity,
   (SELECT count(*)::int FROM public.spy_assets a
    WHERE a.owner_house_id=p_house AND a.source_holding_id=h->>'id'
      AND a.status NOT IN('captured','dead','lost','retired')) AS occupied
  FROM public.noble_house_sheets n,
       LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(n.state->'holdings')='array'
         THEN n.state->'holdings' ELSE '[]'::jsonb END) h
  WHERE n.house_id=p_house
    AND h->>'status'='active'
    AND h->>'itemId' IN('pros-spy-network','pros-spy-network--expanded-network')
    AND (nullif(h->>'parentId','') IS NULL OR EXISTS(
     SELECT 1 FROM jsonb_array_elements(n.state->'holdings') parent
     WHERE parent->>'id'=h->>'parentId' AND parent->>'status'='active'))
 ) v;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',c.id,'label',c.label,'imageUrl',c.image_url,
  'assignedAgentId',a.id
 ) ORDER BY c.sort_order,c.id),'[]'::jsonb) INTO v_portraits
 FROM public.spy_portrait_catalog c
 LEFT JOIN public.spy_assets a ON a.portrait_id=c.id AND a.owner_house_id=p_house
 WHERE c.active=true;
 RETURN jsonb_build_object(
  'houseId',p_house,'agents',v_agents,'operations',v_operations,
  'history',v_history,'recruitment',v_recruitment,'portraits',v_portraits,
  'houseVersion',(SELECT n.version FROM public.noble_house_sheets n
    WHERE n.house_id=p_house));
END $body$;
-- Evitar consultas diretas adicionais a posse/privilegio do jogador:
-- Dados de equipamento e catálogo de retratos vêm somente da leitura
-- de Casa já autenticada por spy_house_management.

CREATE OR REPLACE FUNCTION public.spy_assign_agent_portrait(
 p_house text,p_agent uuid,p_portrait text,p_expected_version integer
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,pg_temp AS $body$
DECLARE v_agent record;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active() OR
  NOT(public.is_campaign_admin() OR public.in_campaign_house(p_house,true))
 THEN RAISE EXCEPTION 'Retrato não autorizado para a Casa'; END IF;
 IF p_portrait IS NULL OR p_expected_version IS NULL
 THEN RAISE EXCEPTION 'Seleção de retrato incompleta'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.spy_portrait_catalog c
   WHERE c.id=p_portrait AND c.active=true)
 THEN RAISE EXCEPTION 'Retrato não faz parte da galeria disponível'; END IF;
 SELECT * INTO v_agent FROM public.spy_assets a
  WHERE a.owner_house_id=p_house AND a.id=p_agent FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Agente não pertence à Casa'; END IF;
 IF v_agent.version<>p_expected_version THEN
  RAISE EXCEPTION 'Ficha alterada; recarregue antes de escolher retrato'; END IF;
 IF v_agent.portrait_id IS DISTINCT FROM p_portrait THEN
  UPDATE public.spy_assets SET portrait_id=p_portrait,version=version+1
    WHERE id=p_agent;
 END IF;
 RETURN jsonb_build_object('agentId',p_agent,'portraitId',p_portrait,
  'version',CASE WHEN v_agent.portrait_id IS DISTINCT FROM p_portrait
   THEN v_agent.version+1 ELSE v_agent.version END);
END $body$;
REVOKE ALL ON FUNCTION public.spy_assign_agent_portrait(text,uuid,text,integer)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spy_assign_agent_portrait(text,uuid,text,integer)
 TO authenticated;

CREATE OR REPLACE FUNCTION public.spy_create_agent(
 p_house text,p_source_holding text,p_codename text,p_portrait text,
 p_upgrades text[],p_request_key uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,pg_temp AS $body$
DECLARE
 v_codes text[]:=coalesce(p_upgrades,ARRAY[]::text[]);
 v_existing record;v_recruited jsonb;v_agent uuid;v_code text;
 v_agent_version integer;v_house_version integer;v_portrait text;
 v_is_repeat boolean:=false;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active() OR
  NOT(public.is_campaign_admin() OR public.in_campaign_house(p_house,true))
 THEN RAISE EXCEPTION 'Criação de agente não autorizada'; END IF;
 IF p_request_key IS NULL OR p_source_holding IS NULL OR
  char_length(btrim(coalesce(p_codename,''))) NOT BETWEEN 2 AND 80 OR
  coalesce(p_codename,'') ~ '[[:cntrl:]]'
 THEN RAISE EXCEPTION 'Nome ou solicitação inválida'; END IF;
 IF cardinality(v_codes)>2 OR
  (SELECT count(DISTINCT x) FROM unnest(v_codes) x)<>cardinality(v_codes) OR
  EXISTS(SELECT 1 FROM unnest(v_codes) x
     WHERE x IS NULL OR x NOT IN('forged_documents','ace_in_the_hole'))
 THEN RAISE EXCEPTION 'Melhorias inválidas ou repetidas'; END IF;

 -- Mesmo bloqueio das compras de Riqueza; nenhuma compra pode se intercalar.
 PERFORM pg_advisory_xact_lock(hashtextextended('noble:'||p_house,0));
 SELECT h.agent_id,h.owner_house_id,a.codename,a.source_holding_id,a.portrait_id
  INTO v_existing FROM public.spy_agent_history h
  JOIN public.spy_assets a ON a.id=h.agent_id
  WHERE h.request_key=p_request_key AND h.event_type='recruited';
 IF FOUND THEN
  IF v_existing.owner_house_id<>p_house OR
    v_existing.source_holding_id<>p_source_holding OR
    v_existing.codename<>btrim(p_codename) OR
    v_existing.portrait_id IS DISTINCT FROM p_portrait OR
    (SELECT array_agg(u.upgrade_code ORDER BY u.upgrade_code)
      FROM public.spy_agent_upgrades u WHERE u.agent_id=v_existing.agent_id)
    IS DISTINCT FROM
    (SELECT array_agg(x ORDER BY x) FROM unnest(v_codes) x)
  THEN RAISE EXCEPTION 'Chave de criação já usada com outros dados'; END IF;
  v_agent:=v_existing.agent_id;
  v_is_repeat:=true;
 ELSE
  IF EXISTS(SELECT 1 FROM public.spy_agent_history WHERE request_key=p_request_key)
  THEN RAISE EXCEPTION 'Chave de solicitação já utilizada'; END IF;
  IF p_portrait IS NOT NULL THEN
   IF NOT EXISTS(SELECT 1 FROM public.spy_portrait_catalog
      WHERE id=p_portrait AND active=true)
   THEN RAISE EXCEPTION 'Retrato indisponível'; END IF;
  ELSIF EXISTS(SELECT 1 FROM public.spy_portrait_catalog WHERE active=true)
   THEN RAISE EXCEPTION 'Selecione um retrato antes de criar o espião';
  END IF;
  v_recruited:=public.spy_recruit_agent(p_house,p_source_holding,
    btrim(p_codename),p_request_key);
  v_agent:=(v_recruited->>'id')::uuid;
  IF p_portrait IS NOT NULL THEN
   UPDATE public.spy_assets SET portrait_id=p_portrait
     WHERE id=v_agent AND owner_house_id=p_house;
  END IF;
  FOREACH v_code IN ARRAY v_codes LOOP
   SELECT version INTO v_agent_version FROM public.spy_assets WHERE id=v_agent;
   SELECT version INTO v_house_version FROM public.noble_house_sheets
     WHERE house_id=p_house;
   PERFORM public.spy_buy_agent_upgrade(p_house,v_agent,v_code,
     v_agent_version,v_house_version,md5(p_request_key::text||':'||v_code)::uuid);
  END LOOP;
 END IF;
 SELECT a.version,a.portrait_id INTO v_agent_version,v_portrait
  FROM public.spy_assets a WHERE a.id=v_agent AND a.owner_house_id=p_house;
 RETURN jsonb_build_object('id',v_agent,'codename',btrim(p_codename),
  'rank','Verde','cunning',3,'status','available','missionSuccesses',0,
  'portraitId',v_portrait,'version',v_agent_version,
  'upgrades',to_jsonb(v_codes),'alreadyApplied',v_is_repeat);
END $body$;
REVOKE ALL ON FUNCTION public.spy_create_agent(text,text,text,text,text[],uuid)
 FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spy_create_agent(text,text,text,text,text[],uuid)
 TO authenticated;
COMMIT;
