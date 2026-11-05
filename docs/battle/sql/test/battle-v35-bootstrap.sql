-- V3.5 somente no banco de testes descartável após bootstrap V3.4.
-- O smoke PTE-2.0 revoga o Narrador de TESTE para verificar RLS; restaurar
-- apenas esta identidade sintética antes do ensaio isolado V3.5.
INSERT INTO public.user_roles(user_id,role)
 SELECT '11111111-1111-4111-8111-111111111111','admin'
 WHERE NOT EXISTS (SELECT 1 FROM public.user_roles
  WHERE user_id='11111111-1111-4111-8111-111111111111' AND role='admin');
CREATE TABLE public.noble_house_sheets (
 house_id text PRIMARY KEY REFERENCES public.campaign_houses(id),
 state jsonb NOT NULL,version integer NOT NULL DEFAULT 0);
-- As casas de teste são sintéticas, não utilizam dados dos jogadores.
INSERT INTO public.noble_house_sheets(house_id,state,version) VALUES
 ('house-v34-a','{"houseId":"house-v34-a","units":[{"id":"a","casualties":0}]}'::jsonb,7),
 ('house-v34-b','{"houseId":"house-v34-b","units":[{"id":"b","casualties":0}]}'::jsonb,8);
GRANT SELECT,UPDATE ON TABLE public.noble_house_sheets TO service_role;
INSERT INTO public.battle_sim_sessions(created_by,name,status,initial_state_json,current_state_json,
 initial_state_hash,state_hash) VALUES
 ('11111111-1111-4111-8111-111111111111','V35 official test','completed',
 '{"phase":"ready","rulesVersion":"PTE-2.0"}',
 '{"phase":"completed","rulesVersion":"PTE-2.0"}',repeat('e',64),repeat('f',64)),
 ('11111111-1111-4111-8111-111111111111','V35 rollback','completed',
 '{"phase":"ready","rulesVersion":"PTE-2.0"}',
 '{"phase":"completed","rulesVersion":"PTE-2.0"}',repeat('e',64),repeat('f',64));
