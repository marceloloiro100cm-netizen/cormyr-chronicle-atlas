-- P0: ensaio transacional em HOMOLOGAÇÃO ISOLADA.
-- Não executar em produção. Executar em banco com migrações 0086-0110.
-- Cria somente identidades fictícias @example.invalid e desfaz TODOS os efeitos.
BEGIN;
SET LOCAL lock_timeout='8s';
INSERT INTO auth.users (id,aud,role,email,encrypted_password,instance_id)
VALUES
 ('11111111-1111-4111-8111-111111111101','authenticated','authenticated','p0-red@example.invalid','', '00000000-0000-0000-0000-000000000000'),
 ('22222222-2222-4222-8222-222222222202','authenticated','authenticated','p0-blue@example.invalid','', '00000000-0000-0000-0000-000000000000'),
 ('33333333-3333-4333-8333-333333333303','authenticated','authenticated','p0-admin@example.invalid','', '00000000-0000-0000-0000-000000000000');
INSERT INTO public.campaign_houses (id,name,region) VALUES
 ('p0-red','Casa Vermelha · ensaio P0','dragoncoast'),
 ('p0-blue','Casa Azul · ensaio P0','dragoncoast');
INSERT INTO public.house_catalog (id,name,region,classification,archive_data,public_reviewed)
 VALUES ('p0-target','Casa Alvo · ensaio P0','elfhold','noble','{}'::jsonb,true);
INSERT INTO public.campaign_players (id,user_id,name,active,require_password_change) VALUES
 ('77777777-7777-4777-8777-777777777701','11111111-1111-4111-8111-111111111101','Jogador Vermelho P0',true,false),
 ('77777777-7777-4777-8777-777777777702','22222222-2222-4222-8222-222222222202','Jogador Azul P0',true,false);
INSERT INTO public.house_memberships (player_id,house_id,can_edit) VALUES
 ('77777777-7777-4777-8777-777777777701','p0-red',true),
 ('77777777-7777-4777-8777-777777777702','p0-blue',true);
INSERT INTO public.user_roles (user_id,role)
 VALUES ('33333333-3333-4333-8333-333333333303','admin');
INSERT INTO public.campaign_calendar (id,year,month,day,festival,version)
 VALUES (true,1522,0,21,NULL,1);
INSERT INTO public.spy_locations (id,kind,ref_id,region_id,name,approved,visibility,source) VALUES
 ('88888888-8888-4888-8888-888888888801','region','dragoncoast','dragoncoast','Costa do Dragão · P0',true,'narrator','p0-test'),
 ('88888888-8888-4888-8888-888888888802','region','elfhold','elfhold','Elfhold · P0',true,'narrator','p0-test');
INSERT INTO public.spy_cormyr_mission_links (from_region,to_region,passage,active)
 VALUES ('dragoncoast','elfhold','land_neighbor',true);
INSERT INTO public.spy_assets
 (id,owner_house_id,kind,codename,source_ref,current_location_id,status,rules_version,version)
 VALUES ('44444444-4444-4444-8444-444444444404','p0-red','network_cell',
 'Corvo P0','p0-fixture-agent','88888888-8888-4888-8888-888888888801',
 'available','cormyr-agent-tiers-v1',1);
-- Jogador Vermelho inicia a missão real da RPC; a retentativa não a duplica.
SET LOCAL request.jwt.claim.sub='11111111-1111-4111-8111-111111111101';
SET LOCAL ROLE authenticated;
DO $mission$
DECLARE v_first jsonb;v_repeat jsonb;
BEGIN
 v_first:=public.spy_submit_house_mission(
  'p0-red','44444444-4444-4444-8444-444444444404','p0-target','elfhold',
  1,1,'55555555-5555-4555-8555-555555555505','house_resources');
 IF v_first->>'status'<>'traveling' OR v_first->>'objective'<>'house_resources'
 THEN RAISE EXCEPTION 'P0.1: envio inicial inválido: %',v_first; END IF;
 v_repeat:=public.spy_submit_house_mission(
  'p0-red','44444444-4444-4444-8444-444444444404','p0-target','elfhold',
  1,1,'55555555-5555-4555-8555-555555555505','house_resources');
 IF v_repeat->>'alreadyApplied'<>'true'
 THEN RAISE EXCEPTION 'P0.6: retentativa criou nova operação: %',v_repeat; END IF;
 IF (SELECT count(*) FROM public.spy_operations WHERE operation_key=
 '55555555-5555-4555-8555-555555555505')<>1
 THEN RAISE EXCEPTION 'P0.6: duplicação de missão'; END IF;
END $mission$;
-- Um jogador não pode ler nem o próprio inventário de inteligência diretamente.
DO $security$
BEGIN
 IF has_table_privilege('authenticated','public.spy_intelligence_findings','SELECT')
 THEN RAISE EXCEPTION 'P0.4: grant de leitura indevido'; END IF;
 BEGIN
  PERFORM public.spy_intelligence_read('p0-blue');
  RAISE EXCEPTION 'P0.4: jogador vermelho acessou dossiê azul';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='P0.4: jogador vermelho acessou dossiê azul'
  THEN RAISE; END IF;
 END;
END $security$;
RESET ROLE;
-- Um avanço atravessa Midwinter (não consome dez dias extras).
UPDATE public.campaign_calendar SET year=1522,month=1,day=1,version=2 WHERE id=true;
DO $travel$
BEGIN
 IF (SELECT status FROM public.spy_operations WHERE operation_key=
 '55555555-5555-4555-8555-555555555505')<>'operating'
 THEN RAISE EXCEPTION 'P0.5: não iniciou investigação após a viagem'; END IF;
END $travel$;
UPDATE public.campaign_calendar SET year=1522,month=1,day=11,version=3 WHERE id=true;
DO $travel$
BEGIN
 IF (SELECT status FROM public.spy_operations WHERE operation_key=
 '55555555-5555-4555-8555-555555555505')<>'pending_narrator_review'
 THEN RAISE EXCEPTION 'P0.5: não encerrou investigação corretamente'; END IF;
END $travel$;
-- O narrador homologa. Não existe catálogo oficial; prêmio aguarda fonte.
SET LOCAL request.jwt.claim.sub='33333333-3333-4333-8333-333333333303';
SET LOCAL ROLE authenticated;
DO $adjudication$
DECLARE v_op uuid;v_agent_version integer;v_first jsonb;v_repeat jsonb;v_status jsonb;
BEGIN
 SELECT id INTO v_op FROM public.spy_operations WHERE operation_key=
  '55555555-5555-4555-8555-555555555505';
 SELECT version INTO v_agent_version FROM public.spy_assets
  WHERE id='44444444-4444-4444-8444-444444444404';
 v_first:=public.spy_resolve_agent_mission(
  v_op,18,0,false,true,true,v_agent_version,
  '66666666-6666-4666-8666-666666666606','Resolução de ensaio P0');
 IF v_first->>'outcome'<>'mission_success'
 THEN RAISE EXCEPTION 'P0.1: resolução não teve sucesso: %',v_first; END IF;
 v_repeat:=public.spy_resolve_agent_mission(
  v_op,18,0,false,true,true,v_agent_version,
  '66666666-6666-4666-8666-666666666606','Resolução de ensaio P0');
 IF v_repeat->>'alreadyApplied'<>'true'
 THEN RAISE EXCEPTION 'P0.6: resolução duplicada: %',v_repeat; END IF;
 v_status:=public.spy_intelligence_operation_status(v_op);
 IF v_status->>'status'<>'waiting_catalog'
 THEN RAISE EXCEPTION 'P0.2: prêmio sem dados não está pendente: %',v_status; END IF;
 IF (SELECT mission_successes FROM public.spy_assets WHERE id=
  '44444444-4444-4444-8444-444444444404')<>1
 THEN RAISE EXCEPTION 'P0.6: XP duplicado'; END IF;
END $adjudication$;
-- Uma segunda conta pode ler apenas os seus dossiês (sem acesso ao alvo da primeira).
SET LOCAL request.jwt.claim.sub='22222222-2222-4222-8222-222222222202';
DO $blue$
BEGIN
 IF jsonb_array_length(public.spy_intelligence_read('p0-blue'))<>0
 THEN RAISE EXCEPTION 'P0.4: vazamento para Casa Azul'; END IF;
 BEGIN
  PERFORM public.spy_intelligence_read('p0-red');
  RAISE EXCEPTION 'P0.4: Casa Azul leu dossiê vermelho';
 EXCEPTION WHEN raise_exception THEN
  IF SQLERRM='P0.4: Casa Azul leu dossiê vermelho' THEN RAISE; END IF;
 END;
END $blue$;
RESET ROLE;
-- A fonte chega uma désdia DEPOIS da conclusão; a observação não é retroativa.
UPDATE public.campaign_calendar SET year=1522,month=1,day=21,version=4 WHERE id=true;
INSERT INTO public.spy_noble_house_stats(
 house_id,house_name,region_id,defense,influence,lands,law,population,power,wealth,
 budget,total,difference,attribute_origin,source_row)
 VALUES ('p0-target','Casa Alvo · ensaio P0','elfhold',25,30,22,10,20,26,24,0,0,0,'p0-test',1);
SET LOCAL request.jwt.claim.sub='33333333-3333-4333-8333-333333333303';
SET LOCAL ROLE authenticated;
DO $finalize$
DECLARE v_op uuid;v_one jsonb;v_two jsonb;v_bad integer;
BEGIN
 SELECT id INTO v_op FROM public.spy_operations WHERE operation_key=
  '55555555-5555-4555-8555-555555555505';
 v_one:=public.spy_intelligence_finalize(v_op,NULL);
 IF v_one->>'status'<>'complete' OR (v_one->>'revealed')::integer<1
 THEN RAISE EXCEPTION 'P0.1: informações não chegaram ao dossiê: %',v_one; END IF;
 SELECT count(*) INTO v_bad FROM public.spy_intelligence_findings f
  JOIN public.spy_intelligence_dossiers d ON d.id=f.dossier_id
  WHERE d.owner_house_id='p0-red' AND f.verified_date_key<>'1522-02-21';
 IF v_bad<>0 THEN RAISE EXCEPTION 'P0.3: snapshot retrodatado'; END IF;
 v_two:=public.spy_intelligence_finalize(v_op,NULL);
 IF v_two->>'alreadyApplied'<>'true'
 THEN RAISE EXCEPTION 'P0.6: descobertas duplicadas'; END IF;
 IF jsonb_array_length(public.spy_intelligence_read('p0-red'))<>1
 THEN RAISE EXCEPTION 'P0.1: dossiê da investigadora não visível'; END IF;
END $finalize$;
-- Não deixa dados, contas, agentes, calendário ou registros fictícios no banco.
ROLLBACK;
