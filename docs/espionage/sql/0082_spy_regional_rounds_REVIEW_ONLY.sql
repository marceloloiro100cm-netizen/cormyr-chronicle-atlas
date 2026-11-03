-- CCA-ESP-MVP-001 · Regras de rodadas regionais · SQL REVIEW_ONLY
-- Não entra no journal Drizzle e NÃO deve ser aplicado à produção sem backup.
-- Ligação terrestre significa REGIÕES VIZINHAS, aprovada pelo Narrador.
-- Passagem marítima significa conexão navegável validada entre duas regiões,
-- e custa uma rodada mesmo quando não são vizinhas por terra.
BEGIN;
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
COMMIT;
