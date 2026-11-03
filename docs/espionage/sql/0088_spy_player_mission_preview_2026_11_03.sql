-- Cormyr · prévia visual de risco para jogadores (apenas leitura).
-- Não inicia missões, não modifica fichas e não concede acesso a atributos completos.
-- Permite ver somente a dificuldade agregada de UMA Casa por agente autorizado.
-- Probabilidade exata 3D6 calculada no servidor TS (modelo provisório).
BEGIN;
CREATE OR REPLACE FUNCTION public.spy_player_mission_preview(
 p_house text,p_agent uuid,p_target text
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp
AS $body$
DECLARE
 v_agent record; v_target record; v_region text; v_region_law integer;
 v_law integer;v_global_bonus integer:=0;v_source text;
 v_state jsonb;v_holdings jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
  OR NOT (public.is_campaign_admin() OR public.in_campaign_house(p_house,false))
 THEN RAISE EXCEPTION 'Prévia de espionagem não autorizada'; END IF;
 IF p_house IS NULL OR p_target IS NULL OR p_house=p_target
 THEN RAISE EXCEPTION 'Casa-alvo inválida'; END IF;

 SELECT a.id,a.status,a.owner_house_id INTO v_agent
 FROM public.spy_assets a WHERE a.id=p_agent AND a.owner_house_id=p_house;
 IF NOT FOUND THEN RAISE EXCEPTION 'Agente não pertence a esta Casa'; END IF;
 IF v_agent.status<>'available' THEN
  RAISE EXCEPTION 'Agente indisponível para iniciar missão'; END IF;

 SELECT c.id,c.name,c.region,c.public_reviewed,c.classification,
        n.state AS operational_state,
        s.law AS imported_law,
        s.region_id AS imported_region
 INTO v_target
 FROM public.house_catalog c
 LEFT JOIN public.noble_house_sheets n ON n.house_id=c.id
 LEFT JOIN public.spy_noble_house_stats s ON s.house_id=c.id
 WHERE c.id=p_target AND c.public_reviewed IS TRUE
  AND c.classification IN ('noble','major','royal');
 IF NOT FOUND THEN RAISE EXCEPTION 'Casa-alvo não homologada'; END IF;

 v_region:=lower(regexp_replace(coalesce(v_target.imported_region,v_target.region),'\\s+','','g'));
 IF v_region='crownland' THEN v_region:='crownlands'; END IF;
 IF v_region='swordmarch' THEN v_region:='swordmark'; END IF;
 IF v_region='dragoncoast' THEN v_region:='dragoncoast'; END IF;
 v_region_law:=CASE v_region
  WHEN 'crownlands' THEN 20 WHEN 'veilstone' THEN 5
  WHEN 'shieldmark' THEN 10 WHEN 'helmlands' THEN 10
  WHEN 'horselands' THEN 5 WHEN 'dragoncoast' THEN 0
  WHEN 'swordmark' THEN 10 WHEN 'ferlin' THEN 10
  WHEN 'stonelands' THEN 0 WHEN 'elfhold' THEN 15
  WHEN 'volkumburgh' THEN 5 ELSE NULL END;
 IF v_region_law IS NULL THEN RAISE EXCEPTION 'Região oficial desconhecida'; END IF;

 IF v_target.operational_state IS NOT NULL THEN
  v_state:=v_target.operational_state;
  IF jsonb_typeof(v_state->'base')<>'object'
   OR jsonb_typeof(v_state->'permanent')<>'object'
   OR NOT(v_state->'base' ? 'law') OR NOT(v_state->'permanent' ? 'law')
  THEN RAISE EXCEPTION 'Ficha operacional sem Lei consistente'; END IF;
  -- Mesmo critério basal de balances(state).total.law: não aplicar Lei
  -- regional novamente a fichas importadas; perdas alocadas não reduzem total.
  v_law:=(v_state#>>'{base,law}')::integer+
         (v_state#>>'{permanent,law}')::integer;
  IF v_state->>'regionalApplied'='true' AND v_state->>'method'<>'import'
  THEN v_law:=v_law+v_region_law; END IF;
  SELECT v_law+coalesce(sum(greatest(0,(m->'changes'->>'law')::integer)),0)::integer
  INTO v_law FROM jsonb_array_elements(
    CASE WHEN jsonb_typeof(v_state->'mailConsequences')='array'
     THEN v_state->'mailConsequences' ELSE '[]'::jsonb END) m
  WHERE m->>'active'='true';
  v_holdings:=CASE WHEN jsonb_typeof(v_state->'holdings')='array'
    THEN v_state->'holdings' ELSE '[]'::jsonb END;
  -- Somente proteção GERAL aplicável. Bônus locais exigem domínio e ficam
  -- reservados para a adjudicação oficial do Narrador.
  SELECT CASE WHEN EXISTS(
    SELECT 1 FROM jsonb_array_elements(v_holdings) h
    WHERE h->>'itemId'='pros-black-market--ear-in-the-underworld'
      AND h->>'status'='active'
      AND (nullif(h->>'parentId','') IS NULL OR EXISTS(
        SELECT 1 FROM jsonb_array_elements(v_holdings) parent
        WHERE parent->>'id'=h->>'parentId' AND parent->>'status'='active'))
  ) THEN 3 ELSE 0 END INTO v_global_bonus;
  v_source:='operational_sheet';
 ELSIF v_target.imported_law IS NOT NULL THEN
  v_law:=v_target.imported_law;
  v_source:='official_spreadsheet';
 ELSE
  v_law:=v_region_law+10;
  v_source:='regional_fallback';
 END IF;
 IF v_law IS NULL OR v_law<0 OR v_law>100000 THEN
  RAISE EXCEPTION 'Lei da Casa sem valor homologado'; END IF;
 RETURN jsonb_build_object(
  'houseId',p_house,'agentId',p_agent,'targetHouseId',v_target.id,
  'houseName',v_target.name,'targetRegionId',v_region,
  'houseDefense',v_law+v_global_bonus,'source',v_source,
  'provisional',true
 );
END $body$;
REVOKE ALL ON FUNCTION public.spy_player_mission_preview(text,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spy_player_mission_preview(text,uuid,text) TO authenticated;
COMMIT;
