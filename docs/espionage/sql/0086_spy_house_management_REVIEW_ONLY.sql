-- CCA-ESP · Apenas gerenciamento administrativo de agente e listagem da própria Casa.
-- DEPENDÊNCIA: foundation spy_assets, spy_operations, spy_operation_segments e
-- spy_operation_events já instaladas. SEM enviar/avançar/concluir missões.
-- As duas RPCs usam JWT real e autorização repetida no banco. Migração aditiva.
-- Revisar execução e backup antes de aplicar em produção.
BEGIN;
CREATE OR REPLACE FUNCTION public.spy_house_management(p_house text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $body$
DECLARE v_agents jsonb;v_operations jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active() OR
    NOT (public.is_campaign_admin() OR public.in_campaign_house(p_house,false))
 THEN RAISE EXCEPTION 'Gerenciamento de agentes não autorizado para esta Casa'; END IF;

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
   'id',a.id,'codename',a.codename,'status',a.status,'version',a.version,
   'currentRegion',CASE WHEN l.kind='region' THEN l.ref_id ELSE l.region_id END
  ) ORDER BY a.created_at,a.id),'[]'::jsonb)
 INTO v_agents FROM public.spy_assets a
 LEFT JOIN public.spy_locations l ON l.id=a.current_location_id
 WHERE a.owner_house_id=p_house;

 SELECT COALESCE(jsonb_agg(jsonb_build_object(
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
 RETURN jsonb_build_object('houseId',p_house,'agents',v_agents,'operations',v_operations);
END $body$;

CREATE OR REPLACE FUNCTION public.spy_rename_agent(
 p_house text,p_agent uuid,p_name text,p_expected_version integer,p_request_key uuid
) RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY DEFINER
SET search_path=public,pg_temp AS $body$
DECLARE current_name text;current_version integer;new_name text;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active() OR
    NOT (public.is_campaign_admin() OR public.in_campaign_house(p_house,true))
 THEN RAISE EXCEPTION 'Renomeação não autorizada'; END IF;
 new_name:=btrim(p_name);
 IF new_name IS NULL OR char_length(new_name)<2 OR char_length(new_name)>80 OR
    new_name ~ '[[:cntrl:]]' OR p_expected_version IS NULL OR p_expected_version<1
 THEN RAISE EXCEPTION 'Nome ou versão inválidos'; END IF;
 IF p_request_key IS NULL THEN RAISE EXCEPTION 'Chave de operação obrigatória'; END IF;

 SELECT a.codename,a.version INTO current_name,current_version
 FROM public.spy_assets a
 WHERE a.id=p_agent AND a.owner_house_id=p_house FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Agente não encontrado nesta Casa'; END IF;

 IF current_name=new_name THEN
  RETURN jsonb_build_object('id',p_agent,'codename',current_name,'version',current_version);
 END IF;
 IF current_version<>p_expected_version
 THEN RAISE EXCEPTION 'Agente alterado por outra operação. Recarregue antes de salvar'; END IF;
 IF EXISTS(SELECT 1 FROM public.spy_operation_events e WHERE e.request_key=p_request_key)
 THEN RAISE EXCEPTION 'Solicitação de renomeação já processada'; END IF;
 UPDATE public.spy_assets
 SET codename=new_name,version=version+1
 WHERE owner_house_id=p_house AND id=p_agent
 RETURNING version INTO current_version;
 INSERT INTO public.spy_operation_events(
  request_key,actor,event_type,old_state,new_state,reason,calendar_version
 ) VALUES(
  p_request_key,auth.uid(),'agent_renamed',current_name,new_name,
  'Nome do agente atualizado no gerenciamento de espionagem da Casa '||p_house,
  (SELECT c.version FROM public.campaign_calendar c WHERE c.id=true)
 );
 RETURN jsonb_build_object('id',p_agent,'codename',new_name,'version',current_version);
END $body$;
REVOKE ALL ON FUNCTION public.spy_house_management(text) FROM PUBLIC,anon;
REVOKE ALL ON FUNCTION public.spy_rename_agent(text,uuid,text,integer,uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spy_house_management(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.spy_rename_agent(text,uuid,text,integer,uuid) TO authenticated;
COMMIT;
