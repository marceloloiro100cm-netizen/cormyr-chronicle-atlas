-- CCA-ESP-MVP-001 · Homologação automática de contratos, APENAS PG16 descartável.
-- Executar depois das suites 0075–0083; jamais em produção.
-- Contratos cobertos: H03/H06/H08/H11/H12/H14/H15/H17/H19.
-- Este arquivo NÃO substitui homologação com JWT reais e banco RESTAURADO.
SELECT public.spy_test_assert(
 (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'spy_%'
     AND c.relrowsecurity=false)=0,
 'H08/H12: RLS habilitado em todas as tabelas spy');
SELECT public.spy_test_assert(
 (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'spy_%')>=14,
 'Esquema spy e conexões regionais presentes');
SELECT public.spy_test_assert(
 (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'spy_%'
   AND (has_table_privilege('anon',c.oid,'SELECT') OR
    has_table_privilege('authenticated',c.oid,'INSERT') OR
    has_table_privilege('authenticated',c.oid,'UPDATE') OR
    has_table_privilege('authenticated',c.oid,'DELETE')))=0,
 'H08/H17: nenhum acesso anônimo ou escrita direta por jogador');
SELECT public.spy_test_assert(
 (SELECT count(*) FROM public.campaign_temporal_consumers
  WHERE code='spy-movements' AND enabled=false)=1,
 'H14: consumidor permanece desativado até homologação real');
SELECT public.spy_test_assert(
 (SELECT count(*) FROM public.spy_assets WHERE owner_house_id='house-c')=5,
 'H03: uma rede base + melhoria + contratação gera 1+2+2 agentes');
SELECT public.spy_test_assert(
 (SELECT count(*) FROM public.spy_assets WHERE owner_house_id='house-d')=0,
 'H03: lote sem compra comprovada no ledger não gera agentes');
SELECT public.spy_test_assert(
 (SELECT count(*) FROM public.spy_intel_reports
  WHERE owner_house_id='house-c' AND status='released')=1,
 'H11: exatamente um relatório autorizado disponível no fixture');
SELECT public.spy_test_assert(
 (SELECT count(*) FROM public.spy_dossier_facts f
   JOIN public.spy_intel_reports r ON r.id=f.report_id
   WHERE f.owner_house_id='house-c' AND r.status NOT IN ('released','archived'))=0,
 'H11/H20: dossiê não incorpora dados de carta ainda selada');
SELECT public.spy_test_assert(
 (SELECT count(*) FROM public.spy_mission_decisions d
  JOIN public.spy_operations op ON op.id=d.operation_id
  WHERE op.owner_house_id='house-c' AND
   (d.target_law IS NOT NULL OR d.difficulty IS NOT NULL))=0,
 'H07/H09: o caso novo sem Lei homologada não inventa dificuldade');
SELECT public.spy_test_assert(
 (SELECT count(*) FROM public.spy_temporal_deliveries d
  JOIN public.spy_operation_segments s ON s.id=d.segment_id
  WHERE d.transition='arrived' AND s.status<>'arrived')=0,
 'H14: entregas imutáveis correspondem a chegada registrada');
SELECT public.spy_test_assert(
 (SELECT count(*) FROM (
  SELECT segment_id,transition FROM public.spy_temporal_deliveries
   GROUP BY segment_id,transition HAVING count(*)>1
  ) dup)=0,
 'H14/H15: replay não gera entregas duplicadas');
SELECT public.spy_test_assert(
 public.spy_add_desdias('1524-07-30',1)='1524-08-10' AND
 public.spy_add_desdias('1524-07-30',3)='1524-08-30' AND
 public.spy_add_desdias('1522-12-30',1)='1523-01-10',
 'H06: cada rodada é 10 dias ordinários, com festivais e ano novo');

-- H19: perda de vínculo deve bloquear acesso a agente, missiva e RPC no JWT atual.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
SELECT public.spy_test_assert(
 (SELECT count(*) FROM public.spy_intel_reports WHERE owner_house_id='house-c')=1,
 'H19 precondition: vínculo ativo vê carta liberada');
RESET ROLE;
DELETE FROM public.test_memberships
 WHERE user_id='44444444-4444-4444-8444-444444444444' AND house_id='house-c';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
SELECT public.spy_test_assert(
 (SELECT count(*) FROM public.spy_assets WHERE owner_house_id='house-c')=0,
 'H19: vínculo revogado não lê agentes');
SELECT public.spy_test_assert(
 (SELECT count(*) FROM public.spy_intel_reports WHERE owner_house_id='house-c')=0,
 'H19: vínculo revogado não lê relatórios');
SELECT public.spy_test_assert(
 (SELECT count(*) FROM public.spy_dossier_facts WHERE owner_house_id='house-c')=0,
 'H19: vínculo revogado não lê fatos históricos');
DO $deny$ BEGIN
 BEGIN
  PERFORM public.spy_read_house_dashboard('house-c');
  RAISE EXCEPTION 'H19: vínculo revogado ainda acessa dashboard';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%indisponível para esta Casa%' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.spy_get_regional_strategy('house-c');
  RAISE EXCEPTION 'H19: vínculo revogado ainda acessa posição do espião';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%não autorizada%' THEN RAISE; END IF;
 END;
END $deny$;
RESET ROLE;
SELECT 'HOMOLOGAÇÃO AUTOMATIZADA ISOLADA: RLS, 10 DIAS, REVOGAÇÃO, NO_GO PASSOU' AS result;
