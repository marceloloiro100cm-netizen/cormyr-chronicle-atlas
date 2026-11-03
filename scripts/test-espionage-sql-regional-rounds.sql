-- Verificação em PostgreSQL DESCARTÁVEL após 0082. NÃO executar em produção.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $deny$ BEGIN
 BEGIN
  PERFORM public.spy_review_region_link('11111111-aaaa-4111-8111-aaaaaaaaaaaa',
  'helmlands','shieldmark','land_neighbor',true,true,false,'public','Mapa aprovado',
  0,gen_random_uuid(),'Narrador certificou a fronteira');
  RAISE EXCEPTION 'Jogador cadastrou fronteira sem aprovação';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%Somente Narrador%' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.spy_get_regional_strategy('house-c');
  RAISE EXCEPTION 'Jogador A leu localização de espiões de C';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%não autorizada%' THEN RAISE; END IF;
 END;
END $deny$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
SELECT public.spy_test_assert((public.spy_review_region_link(
 '11111111-aaaa-4111-8111-aaaaaaaaaaaa','helmlands','shieldmark',
 'land_neighbor',true,true,false,'public','Mapa aprovado',0,
 '22222222-aaaa-4222-8222-aaaaaaaaaaaa','Fronteira confirmada pelo Narrador')->>'approved')='true',
 'Narrador cadastra conexão terrestre homologada');
SELECT public.spy_test_assert((public.spy_review_region_link(
 '22222222-aaaa-4222-8222-aaaaaaaaaaaa','shieldmark','horselands',
 'land_neighbor',true,true,false,'public','Mapa aprovado',0,
 '22222222-bbbb-4222-8222-aaaaaaaaaaaa','Fronteira confirmada pelo Narrador')->>'version')='1',
 'Segunda região vizinha cadastrada');
SELECT public.spy_test_assert((public.spy_review_region_link(
 '33333333-aaaa-4333-8333-aaaaaaaaaaaa','helmlands','horselands',
 'sea_passage',true,true,false,'public','Rota náutica homologada',0,
 '22222222-cccc-4222-8222-aaaaaaaaaaaa','Passagem marítima autorizada pelo Narrador')->>'version')='1',
 'Mar permite conexão entre regiões que não são vizinhas por terra');
SELECT public.spy_test_assert((public.spy_review_region_link(
 '44444444-aaaa-4444-8444-aaaaaaaaaaaa','crownlands','elfhold',
 'land_neighbor',true,false,false,'public','Fronteira não confirmada',0,
 '22222222-dddd-4222-8222-aaaaaaaaaaaa','Sem confirmação de vizinhança')->>'approved')='false',
 'Vizinhança não aprovada não fica pública');
SELECT public.spy_test_assert((public.spy_review_region_link(
 '55555555-aaaa-4555-8555-aaaaaaaaaaaa','veilstone','ferlin',
 'sea_passage',true,true,false,'narrator','Rota náutica secreta',0,
 '22222222-eeee-4222-8222-aaaaaaaaaaaa','Ligação marítima de uso restrito')->>'approved')='true',
 'Conexão secreta é reservada ao narrador');
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',false);
DO $owned$
DECLARE strategy jsonb; position text;
BEGIN
 strategy:=public.spy_get_regional_strategy('house-c');
 PERFORM public.spy_test_assert(jsonb_array_length(strategy->'agents')=5,
  'Devolve somente os cinco agentes da Casa C');
 PERFORM public.spy_test_assert(jsonb_array_length(strategy->'links')=3,
  'Somente as três conexões públicas aprovadas');
 SELECT a->>'currentRegion' INTO position
  FROM jsonb_array_elements(strategy->'agents') a
  WHERE a->>'id'=(SELECT id::text FROM public.spy_assets
    WHERE owner_house_id='house-c' AND source_ref='base:hold-network-c:0');
 PERFORM public.spy_test_assert(position='helmlands',
  'Origem é posição atual do agente, não sede da Casa');
 PERFORM public.spy_test_assert(strategy::text NOT LIKE '%Fronteira não confirmada%'
  AND strategy::text NOT LIKE '%Rota náutica secreta%',
  'Sem fontes privadas ou links não homologados');
END $owned$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',false);
DO $other$ BEGIN
 BEGIN
  PERFORM public.spy_get_regional_strategy('house-c');
  RAISE EXCEPTION 'Casa B consultou espiões da C';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%não autorizada%' THEN RAISE; END IF;
 END;
END $other$;
RESET ROLE;
SELECT 'ESTRATEGIA REGIONAL/SECRETO/ORIGEM REAL: PASSOU' AS result;
