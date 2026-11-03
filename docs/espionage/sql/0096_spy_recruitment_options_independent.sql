-- Consulta leve de recrutamento: não depende do carregamento completo de
-- Agentes e Missões. Disponibiliza vagas e retratos APENAS à própria Casa.
-- Lei da capacidade: Rede base = 3, Rede Ampliada = 2 por posse ativa.
-- Migração apenas de função; não cria agentes, compras ou vagas artificiais.
BEGIN;
CREATE OR REPLACE FUNCTION public.spy_recruitment_options(p_house text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $body$
DECLARE v_slots jsonb;v_portraits jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
    OR NOT (public.is_campaign_admin() OR public.in_campaign_house(p_house,false))
 THEN RAISE EXCEPTION 'Consulta de vagas não autorizada'; END IF;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'sourceHoldingId',t.id,'name',t.name,
   'capacity',t.capacity,'occupied',t.occupied,
   'vacancies',greatest(0,t.capacity-t.occupied)
 ) ORDER BY t.name,t.id),'[]'::jsonb)
 INTO v_slots
 FROM (
   SELECT h->>'id' AS id,
     h->>'name' AS name,
     CASE h->>'itemId'
       WHEN 'pros-spy-network' THEN 3
       WHEN 'pros-spy-network--expanded-network' THEN 2
       ELSE 0 END AS capacity,
     (SELECT count(*)::integer FROM public.spy_assets a
        WHERE a.owner_house_id=p_house
          AND a.source_holding_id=h->>'id'
          AND a.status NOT IN('captured','dead','lost','retired')
     ) AS occupied
   FROM public.noble_house_sheets n
   CROSS JOIN LATERAL jsonb_array_elements(
     CASE WHEN jsonb_typeof(n.state->'holdings')='array'
       THEN n.state->'holdings' ELSE '[]'::jsonb END
   ) h
   WHERE n.house_id=p_house
     AND n.state->>'phase'='active'
     AND h->>'status'='active'
     AND h->>'itemId' IN('pros-spy-network',
                          'pros-spy-network--expanded-network')
     AND (
       nullif(h->>'parentId','') IS NULL
       OR EXISTS (
         SELECT 1 FROM jsonb_array_elements(n.state->'holdings') parent
         WHERE parent->>'id'=h->>'parentId'
           AND parent->>'status'='active'
       )
     )
 ) t;

 SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'label',c.label,'imageUrl',c.image_url,
    'assignedAgentId',a.id
 ) ORDER BY c.sort_order,c.id),'[]'::jsonb)
 INTO v_portraits
 FROM public.spy_portrait_catalog c
 LEFT JOIN public.spy_assets a
   ON a.portrait_id=c.id AND a.owner_house_id=p_house
 WHERE c.active=true;

 RETURN jsonb_build_object('houseId',p_house,
   'recruitment',v_slots,'portraits',v_portraits);
END $body$;

REVOKE ALL ON FUNCTION public.spy_recruitment_options(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spy_recruitment_options(text) TO authenticated;
COMMIT;
