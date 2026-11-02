-- Cenário temporal isolado: duas viagens sequenciais vencidas numa única publicação.
INSERT INTO spy_locations(id,kind,ref_id,region_id,name,approved,visibility,source) VALUES
 ('20202020-2020-4020-8020-202020202020','region','r2','r2','R2',true,'public','mapa'),
 ('40404040-4040-4040-8040-404040404040','region','r3','r3','R3',true,'public','mapa');
-- Deve ser executado depois do bootstrap, 0075, 0076 e testes do esquema.
INSERT INTO spy_travel_edges(id,from_location_id,to_location_id,mode,base_days,
 approved,approved_by,approval_reason,source)
VALUES
 ('10101010-1010-4010-8010-101010101010','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '20202020-2020-4020-8020-202020202020','horse',1,true,
  '33333333-3333-4333-8333-333333333333','Rota validada por Narrador','mapa'),
 ('30303030-3030-4030-8030-303030303030','20202020-2020-4020-8020-202020202020',
  '40404040-4040-4040-8040-404040404040','horse',1,true,
  '33333333-3333-4333-8333-333333333333','Rota validada por Narrador','mapa');
-- São criadas localizações antes das arestas no script, por FK.

INSERT INTO spy_operation_segments(id,operation_id,edge_id,ordinal,
 from_location_id,to_location_id,departure_key,arrival_key,duration_days,edge_version,status)
VALUES
 ('50505050-5050-4050-8050-505050505050','11111111-aaaa-4111-8111-111111111111',
  '10101010-1010-4010-8010-101010101010',0,
  'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '20202020-2020-4020-8020-202020202020','1524-01-18','1524-01-19',1,1,'traveling'),
 ('60606060-6060-4060-8060-606060606060','11111111-aaaa-4111-8111-111111111111',
  '30303030-3030-4030-8030-303030303030',1,
  '20202020-2020-4020-8020-202020202020',
  '40404040-4040-4040-8040-404040404040','1524-01-19','1524-01-20',1,1,'traveling');
UPDATE spy_operations SET status='traveling' WHERE id='11111111-aaaa-4111-8111-111111111111';
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',false);
DO $assert$ BEGIN
 BEGIN
  PERFORM public.spy_process_published_movements(4,gen_random_uuid(),'Trabalho temporal de teste');
  RAISE EXCEPTION 'Jogador chamou consumidor narratorial';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM NOT LIKE '%Narrador%' THEN RAISE; END IF;
 END;
END $assert$;
RESET ROLE;
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
SELECT public.spy_test_assert(
 (public.spy_process_published_movements(4,
  '70707070-7070-4070-8070-707070707070','Publicação oficial confirmada em homologação')->>'processed')='2',
 'Salto deve concluir DOIS trechos sequenciais');
RESET ROLE;
SELECT public.spy_test_assert(
 (SELECT count(*) FROM spy_temporal_deliveries WHERE transition='arrived')=2,
 'Uma entrega por chegada');
SELECT public.spy_test_assert(
 (SELECT count(*) FROM spy_operation_segments WHERE status='arrived')=2,
 'Ambos os trechos chegaram');
-- Republicar mesma data com outra chave não causa chegada duplicada.
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
SELECT public.spy_test_assert(
 (public.spy_process_published_movements(4,
  '80808080-8080-4080-8080-808080808080','Repetição de publicação em homologação')->>'processed')='0',
 'Replay deve ser idempotente');
RESET ROLE;
-- Retrocesso registrado não desfaz viagem concluída.
UPDATE campaign_calendar SET day=19,version=5 WHERE id=true;
INSERT INTO campaign_time_operations(after_state) VALUES('{"version":5}');
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',false);
SELECT public.spy_test_assert(
 (public.spy_process_published_movements(5,
  '90909090-9090-4090-8090-909090909090','Retrocesso conciliação homologada')->>'processed')='0',
 'Retrocesso não apaga chegada');
RESET ROLE;
SELECT public.spy_test_assert(
 (SELECT count(*) FROM spy_temporal_deliveries)=2,
 'Histórico de movimentação preservado após retrocesso');
SELECT 'SQL ESPIONAGEM TEMPORAL: PASSOU' AS result;
