-- 0107 | Dossiês · lote 11 — impedir recuperação de segredos revogados.
-- Jogadores só recebem histórico de itens AINDA conhecidos e nunca
-- snapshots antigos de eventos (a UI só apresenta chave, ação e data).
-- O Narrador mantém o histórico completo para auditoria.
-- Pré-requisito: 0104/0105. Não remove eventos nem altera missões.
BEGIN;
SET LOCAL lock_timeout='8s';
CREATE OR REPLACE FUNCTION public.spy_intelligence_read(p_house text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $read$
DECLARE v_rows jsonb;v_admin boolean;
BEGIN
 IF auth.uid() IS NULL OR NOT public.campaign_access_active()
 THEN RAISE EXCEPTION 'Sessão não autorizada'; END IF;
 v_admin:=public.is_campaign_admin();
 IF v_admin THEN
  NULL;
 ELSIF p_house IS NULL OR NOT public.in_campaign_house(p_house,false)
 THEN RAISE EXCEPTION 'Acesso não autorizado ao dossiê desta Casa'; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object(
  'id',d.id,'ownerHouseId',d.owner_house_id,'targetHouseId',d.target_house_id,
  'ownerHouseName',coalesce(oc.name,d.owner_house_id),
  'targetHouseName',coalesce(tc.name,d.target_house_id),
  'targetRegion',tc.region,
  'updatedAt',d.updated_at,
  'findings',coalesce((
   SELECT jsonb_agg(jsonb_build_object(
    'id',f.id,'objective',f.objective,'key',f.subject_key,
    'snapshot',f.value_snapshot,'discoveredDate',f.discovered_date_key,
    'verifiedDate',f.verified_date_key)
    ORDER BY f.verified_at DESC,f.subject_key)
   FROM public.spy_intelligence_findings f WHERE f.dossier_id=d.id),
   '[]'::jsonb),
  'history',coalesce((
   SELECT jsonb_agg(jsonb_build_object(
    'id',e.id,'objective',e.objective,'key',e.subject_key,
    'action',e.event_type,'dateKey',e.campaign_date_key,
    'oldSnapshot',CASE WHEN v_admin THEN e.previous_snapshot ELSE NULL END,
    'newSnapshot',CASE WHEN v_admin THEN e.new_snapshot ELSE '{}'::jsonb END)
    ORDER BY e.created_at DESC)
   FROM public.spy_intelligence_events e
   WHERE e.dossier_id=d.id AND (
    v_admin OR EXISTS(
     SELECT 1 FROM public.spy_intelligence_findings known
     WHERE known.dossier_id=d.id
      AND known.objective=e.objective
      AND known.subject_key=e.subject_key
    )
   )),
   '[]'::jsonb),
  'adminHistory',CASE WHEN v_admin THEN
   coalesce((SELECT jsonb_agg(jsonb_build_object(
    'id',a.id,'objective',a.objective,'key',a.subject_key,
    'action',a.action,'dateKey',a.campaign_date_key,'reason',a.reason)
    ORDER BY a.created_at DESC)
    FROM public.spy_intelligence_admin_audit a WHERE a.dossier_id=d.id),
    '[]'::jsonb)
   ELSE '[]'::jsonb END
 ) ORDER BY d.updated_at DESC),'[]'::jsonb) INTO v_rows
 FROM public.spy_intelligence_dossiers d
 LEFT JOIN public.house_catalog oc ON oc.id=d.owner_house_id
 LEFT JOIN public.house_catalog tc ON tc.id=d.target_house_id
 WHERE (v_admin AND (p_house IS NULL OR d.owner_house_id=p_house))
    OR (NOT v_admin AND d.owner_house_id=p_house);
 RETURN v_rows;
END $read$;
REVOKE ALL ON FUNCTION public.spy_intelligence_read(text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.spy_intelligence_read(text) TO authenticated;
COMMIT;
