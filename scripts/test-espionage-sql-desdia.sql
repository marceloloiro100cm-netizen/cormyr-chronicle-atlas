-- PostgreSQL DESCARTÁVEL, nunca produção. Mesmo resultado do motor JS Harptos.
SELECT public.spy_test_assert(public.spy_add_desdias('1522-01-01',1)='1522-01-11',
 '1 désdia = dez dias ordinários');
SELECT public.spy_test_assert(public.spy_add_desdias('1522-01-01',3)='1522-02-01',
 '2 travessias + 1 investigação atravessam o mês');
SELECT public.spy_test_assert(public.spy_add_desdias('1522-12-30',1)='1523-01-10',
 'Virada de ano sem mês 13 ou calendário gregoriano');
SELECT public.spy_test_assert(public.spy_add_desdias('1522-01-05',1)='1522-01-15',
 'Partida no meio da désdia não é arredondada');
SELECT public.spy_test_assert(public.spy_add_desdias('1524-07-30',1)='1524-08-10',
 'Midsummer e Shieldmeet de 1524 não consomem dias ordinários');
SELECT public.spy_test_assert(public.spy_add_desdias('1524-07-30',2)='1524-08-20',
 'Viagem e investigação de duas désdias');
SELECT public.spy_test_assert(public.spy_add_desdias('1524-07-30',3)='1524-08-30',
 'Atalho marítimo + investigação + retorno em três désdias');
SELECT public.spy_test_assert(public.spy_add_desdias('1524-F-shieldmeet',1)='1524-08-10',
 'Festival intercalar usa último dia ordinário anterior');
SELECT public.spy_test_assert(public.spy_add_desdias('1524-F-midsummer',0)='1524-F-midsummer',
 'Projeção zero não modifica festival');
SELECT public.spy_test_assert(public.spy_add_desdias('1522-11-30',1)='1522-12-10',
 'Feast of the Moon intercalar não consome dia ordinário');
DO $invalid$ BEGIN
 BEGIN
  PERFORM public.spy_add_desdias('1523-F-shieldmeet',1);
  RAISE EXCEPTION 'Shieldmeet em ano não bissexto aceito';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%Festival de Harptos inválido%' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.spy_add_desdias('1524-13-01',1);
  RAISE EXCEPTION 'Mês 13 aceito';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%Data ordinária de Harptos inválida%' THEN RAISE; END IF;
 END;
 BEGIN
  PERFORM public.spy_add_desdias('1524-07-30',-1);
  RAISE EXCEPTION 'Rodada negativa aceita';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%Quantidade de désdias inválida%' THEN RAISE; END IF;
 END;
END $invalid$;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $check$ BEGIN
 BEGIN
  PERFORM public.spy_add_desdias('1524-07-30',1);
  RAISE EXCEPTION 'Jogador acessou função interna do planejamento durável';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
END $check$;
RESET ROLE;
SELECT 'REGRA DESDIA ESPIONAGEM: 10 DIAS ORDINARIOS E FESTIVAIS PASSOU' AS result;
