-- CCA-ESP-MVP-001 / conciliação ADITIVA e restrita das redes já adquiridas.
-- Proveniência: noble_house_sheets.state.holdings (ativo) + domains + identity.region.
-- Ao contrário de contratos avulsos, redes base e ampliadas já constam como posses.
-- NENHUM UPDATE/DELETE ou nova cobrança; nunca inventar ligações entre regiões.
-- Executar apenas após validação dos IDs e regiões no banco alvo.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $preflight$
DECLARE n integer;
BEGIN
 IF (SELECT count(*) FROM public.noble_house_sheets WHERE house_id IN ('ashkar','erdenor')
  AND state->>'phase'='active')<>2
 THEN RAISE EXCEPTION 'Precondição: fichas Ashkar e Erdenor precisam estar ativas'; END IF;
 IF (SELECT state->'identity'->>'region' FROM public.noble_house_sheets WHERE house_id='ashkar')
  IS DISTINCT FROM 'dragoncoast'
 OR (SELECT state->'identity'->>'region' FROM public.noble_house_sheets WHERE house_id='erdenor')
  IS DISTINCT FROM 'horselands'
 THEN RAISE EXCEPTION 'A região oficial mudou: revisão necessária antes de conciliar'; END IF;
 SELECT count(*) INTO n FROM public.noble_house_sheets s
 CROSS JOIN LATERAL jsonb_array_elements(s.state->'holdings') h
 WHERE (s.house_id,h->>'id',h->>'itemId',h->>'domainId',h->>'status') IN (
  ('ashkar','hold-ashkar-spy','pros-spy-network','dom-ashkar-1','active'),
  ('ashkar','hold-ashkar-spy-exp','pros-spy-network--expanded-network','dom-ashkar-1','active'),
  ('erdenor','hold-erdenor-spy','pros-spy-network','dom-erdenor-1','active')
 );
 IF n<>3 THEN RAISE EXCEPTION 'As três posses-base auditadas mudaram'; END IF;
 IF NOT EXISTS(SELECT 1 FROM public.noble_house_sheets s
  CROSS JOIN LATERAL jsonb_array_elements(s.state->'holdings') h
  WHERE s.house_id='ashkar' AND h->>'id'='hold-ashkar-spy-exp'
   AND h->>'parentId'='hold-ashkar-spy') THEN
  RAISE EXCEPTION 'A ampliação Ashkar não depende da Rede base'; END IF;
 IF EXISTS(SELECT 1 FROM public.spy_assets WHERE owner_house_id IN ('ashkar','erdenor')
  AND source_ref NOT IN ('base:hold-ashkar-spy:0','expanded:hold-ashkar-spy-exp:0',
   'expanded:hold-ashkar-spy-exp:1','base:hold-erdenor-spy:0'))
 THEN RAISE EXCEPTION 'Há outros agentes nestas Casas: reconciliar manualmente'; END IF;
END $preflight$;
INSERT INTO public.spy_locations(kind,ref_id,region_id,name,approved,visibility,source)
SELECT 'domain',d->>'id',s.state->'identity'->>'region',d->>'name',
 true,'narrator','Ficha da Casa ativa e domínio vinculado (conciliação inicial)'
FROM public.noble_house_sheets s
CROSS JOIN LATERAL jsonb_array_elements(s.state->'domains') d
WHERE (s.house_id,d->>'id') IN (('ashkar','dom-ashkar-1'),('erdenor','dom-erdenor-1'))
ON CONFLICT(kind,ref_id) DO NOTHING;
DO $locations$
BEGIN
 IF (SELECT count(*) FROM public.spy_locations
  WHERE kind='domain' AND approved AND visibility='narrator'
  AND ((ref_id='dom-ashkar-1' AND region_id='dragoncoast') OR
       (ref_id='dom-erdenor-1' AND region_id='horselands')))<>2
 THEN RAISE EXCEPTION 'Localidades de origem não estão homologadas ou divergem do cadastro'; END IF;
END $locations$;
WITH supported(house_id,holding_id,item_id,domain_id,slot,source_ref,codename) AS (
 VALUES
 ('ashkar','hold-ashkar-spy','pros-spy-network','dom-ashkar-1',0,'base:hold-ashkar-spy:0','Agente da Rede 1'),
 ('ashkar','hold-ashkar-spy-exp','pros-spy-network--expanded-network','dom-ashkar-1',0,'expanded:hold-ashkar-spy-exp:0','Agente da Rede Ampliada 1'),
 ('ashkar','hold-ashkar-spy-exp','pros-spy-network--expanded-network','dom-ashkar-1',1,'expanded:hold-ashkar-spy-exp:1','Agente da Rede Ampliada 2'),
 ('erdenor','hold-erdenor-spy','pros-spy-network','dom-erdenor-1',0,'base:hold-erdenor-spy:0','Agente da Rede 1')
)
INSERT INTO public.spy_assets(owner_house_id,kind,codename,source_holding_id,
 source_ref,current_location_id,status,rules_version)
SELECT x.house_id,'network_cell',x.codename,x.holding_id,x.source_ref,l.id,'available',
 'CCA-ESP-MVP-001:2026-11-02'
FROM supported x
JOIN public.noble_house_sheets s ON s.house_id=x.house_id AND s.state->>'phase'='active'
JOIN LATERAL jsonb_array_elements(s.state->'holdings') h
 ON h->>'id'=x.holding_id AND h->>'itemId'=x.item_id
 AND h->>'domainId'=x.domain_id AND h->>'status'='active'
JOIN public.spy_locations l ON l.kind='domain' AND l.ref_id=x.domain_id AND l.approved
ON CONFLICT(owner_house_id,source_ref) DO NOTHING;
DO $postcheck$
BEGIN
 IF (SELECT count(*) FROM public.spy_assets WHERE owner_house_id='ashkar')<>3
 OR (SELECT count(*) FROM public.spy_assets WHERE owner_house_id='erdenor')<>1
 THEN RAISE EXCEPTION 'Conciliador não produziu 3 agentes Ashkar e 1 Erdenor'; END IF;
 IF EXISTS(SELECT 1 FROM public.spy_assets a JOIN public.spy_locations l ON l.id=a.current_location_id
  WHERE (a.owner_house_id='ashkar' AND l.region_id<>'dragoncoast') OR
    (a.owner_house_id='erdenor' AND l.region_id<>'horselands'))
 THEN RAISE EXCEPTION 'Algum agente ficou em uma região incorreta'; END IF;
END $postcheck$;
INSERT INTO public.spy_operation_events(request_key,actor,event_type,new_state,reason,calendar_version)
SELECT k,NULL,'agents_reconciled','available',
 'Conciliação inicial aditiva de redes já adquiridas; nenhuma cobrança nem mudança de calendário',
 (SELECT version FROM public.campaign_calendar WHERE id=true)
FROM (VALUES
 ('a7ae0129-783e-4cf1-ae74-02d420786b71'::uuid),
 ('b9bb2faf-8960-4814-948f-ff61f0133615'::uuid)) ids(k)
ON CONFLICT(request_key) DO NOTHING;
COMMIT;
SELECT owner_house_id AS house,
 count(*) AS agents,
 min(l.region_id) AS current_region,
 count(DISTINCT source_ref) AS distinct_sources
FROM public.spy_assets a JOIN public.spy_locations l ON l.id=a.current_location_id
WHERE owner_house_id IN ('ashkar','erdenor')
GROUP BY owner_house_id ORDER BY owner_house_id;
