-- Cormyr Chronicle Atlas · R5 Lote 1
-- ACEITE TRANSACIONAL INTEGRADO: staging DESCARTÁVEL, nunca produção.
-- Testa RPCs reais com JWT sintético de laboratório dentro de UMA transação:
-- criar agente -> iniciar 3 missões (Recursos / Exército / Posses) ->
-- avançar HUB -> homologar -> finalizar 3 dossiês -> promover ->
-- retry idempotente -> fracasso -> morte. SEM REGISTROS PERSISTIDOS.
-- Isto NÃO substitui login real e teste visual de jogador/narrador.
BEGIN;
DO $guard$
BEGIN
 IF EXISTS(SELECT 1 FROM public.campaign_calendar)
 OR EXISTS(SELECT 1 FROM public.spy_assets)
 OR EXISTS(SELECT 1 FROM auth.users)
 THEN RAISE EXCEPTION 'R5: ambiente não isolado ou contém dados; ABORTAR'; END IF;
END $guard$;

SELECT set_config('request.jwt.claim.sub','d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1',true);
SELECT set_config('request.jwt.claims','{"sub":"d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1","role":"authenticated"}',true);
INSERT INTO auth.users(id,aud,role,email,created_at,updated_at)
VALUES('d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1','authenticated','authenticated',
'r5-l1-rollback-only@invalid.example',now(),now());
INSERT INTO public.user_roles(user_id,role)
VALUES('d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1','admin');
INSERT INTO public.campaign_houses(id,name,region)
VALUES('r5-l1-source','R5 Origem','dragoncoast'),('r5-l1-target','R5 Alvo','ferlin');
INSERT INTO public.house_catalog(id,name,region,classification,archive_data,public_reviewed)
VALUES('r5-l1-source','R5 Origem','dragoncoast','noble','{}'::jsonb,true),
('r5-l1-target','R5 Alvo','ferlin','noble','{}'::jsonb,true);
INSERT INTO public.noble_house_sheets(house_id,state,updated_by)
VALUES
('r5-l1-source','{"base":{"law":10},"permanent":{"law":0},"holdings":[{"id":"r5-network","name":"Rede Inicial","itemId":"pros-spy-network","status":"active","domainId":"r5-domain"}]}'::jsonb,'d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1'),
('r5-l1-target','{"base":{"law":10},"permanent":{"law":0},"holdings":[{"id":"h1","name":"Posse 1","status":"active"},{"id":"h2","name":"Posse 2","status":"active"},{"id":"h3","name":"Posse 3","status":"active"}],"domains":[{"id":"d1","name":"Domínio 1"}],"units":[{"id":"u1","name":"Guerreiros 1"},{"id":"u2","name":"Guerreiros 2"},{"id":"u3","name":"Guerreiros 3"}]}'::jsonb,'d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1');
INSERT INTO public.spy_locations(kind,ref_id,region_id,name,approved,visibility,source)
VALUES('region','dragoncoast','dragoncoast','R5 Costa',true,'public','r5'),
('region','ferlin','ferlin','R5 Ferlin',true,'public','r5'),
('domain','r5-domain','dragoncoast','R5 Domínio',true,'narrator','r5');
INSERT INTO public.spy_cormyr_mission_links(from_region,to_region,passage,active)
VALUES('dragoncoast','ferlin','land_neighbor',true);
INSERT INTO public.campaign_calendar(id,year,month,day,auto_advance,version,updated_by)
VALUES(true,1522,0,11,false,1,'d1d1d1d1-d1d1-41d1-81d1-d1d1d1d1d1d1');
DO $accept$
DECLARE
 v_agent uuid;v_op uuid;v_agent_version integer;v_calendar_version integer;
 v_create jsonb;v_submission jsonb;v_result jsonb;v_award jsonb;v_retry jsonb;
 v_request_key uuid;
 v_objective text;v_idx integer;v_successes integer;v_promo_count integer;
BEGIN
 SELECT public.spy_create_agent('r5-l1-source','r5-network','Agente R5',NULL,
  ARRAY[]::text[],'a2a2a2a2-a2a2-42a2-82a2-a2a2a2a2a2a2') INTO v_create;
 IF v_create->>'status'<>'available' OR v_create->>'rank'<>'Verde'
 THEN RAISE EXCEPTION 'R5 criação incorreta: %',v_create; END IF;
 v_agent:=(v_create->>'id')::uuid;
 SELECT public.spy_create_agent('r5-l1-source','r5-network','Agente R5',NULL,
  ARRAY[]::text[],'a2a2a2a2-a2a2-42a2-82a2-a2a2a2a2a2a2') INTO v_retry;
 IF v_retry->>'alreadyApplied'<>'true' OR (v_retry->>'id')::uuid<>v_agent
  OR (SELECT count(*) FROM public.spy_assets WHERE owner_house_id='r5-l1-source')<>1
 THEN RAISE EXCEPTION 'R5 criação duplicada em repetição da chave'; END IF;
 IF public.spy_add_desdias('1522-01-21',1)<>'1522-02-01'
   OR public.spy_add_desdias('1524-07-21',1)<>'1524-08-01'
 THEN RAISE EXCEPTION 'R5 Harptos: Midwinter ou Shieldmeet inválido'; END IF;

 FOR v_idx IN 1..3 LOOP
  v_objective:=CASE v_idx WHEN 1 THEN 'house_resources' WHEN 2 THEN 'army'
   ELSE 'possessions' END;
  SELECT version INTO v_agent_version FROM public.spy_assets WHERE id=v_agent;
  SELECT version INTO v_calendar_version FROM public.campaign_calendar WHERE id=true;
  SELECT public.spy_submit_house_mission(
   'r5-l1-source',v_agent,'r5-l1-target','ferlin',v_agent_version,
   v_calendar_version,gen_random_uuid(),v_objective) INTO v_submission;
  v_op:=(v_submission->>'operationId')::uuid;
  IF v_submission->>'objective'<>v_objective OR
    (v_submission->>'status')<>(CASE WHEN v_idx=1 THEN 'traveling' ELSE 'operating' END)
  THEN RAISE EXCEPTION 'R5 início de missão incorreto: %',v_submission; END IF;
  IF v_idx=1 THEN
   UPDATE public.campaign_calendar SET day=21,version=version+1 WHERE id=true;
   IF (SELECT status FROM public.spy_operations WHERE id=v_op)<>'operating'
   THEN RAISE EXCEPTION 'R5 HUB não fez a chegada'; END IF;
   UPDATE public.campaign_calendar SET month=1,day=1,version=version+1 WHERE id=true;
  ELSIF v_idx=2 THEN
   UPDATE public.campaign_calendar SET month=1,day=11,version=version+1 WHERE id=true;
  ELSE
   UPDATE public.campaign_calendar SET month=1,day=21,version=version+1 WHERE id=true;
  END IF;
  IF (SELECT status FROM public.spy_operations WHERE id=v_op)<>'pending_narrator_review'
   OR (SELECT status FROM public.spy_assets WHERE id=v_agent)<>'pending_review'
  THEN RAISE EXCEPTION 'R5 HUB não exigiu homologação'; END IF;
  SELECT version INTO v_agent_version FROM public.spy_assets WHERE id=v_agent;
  v_request_key:=gen_random_uuid();
  SELECT public.spy_resolve_agent_mission(v_op,15,0,false,NULL,NULL,
   v_agent_version,v_request_key,'Teste R5 isolado') INTO v_result;
  IF v_result->>'outcome'<>'mission_success'
   OR (SELECT status FROM public.spy_operations WHERE id=v_op)<>'completed'
  THEN RAISE EXCEPTION 'R5 resolução incorreta: %',v_result; END IF;
  SELECT public.spy_intelligence_finalize(v_op,
   CASE WHEN v_objective='house_resources' THEN
    '{"defense":15,"influence":10,"lands":8,"law":10,"power":6,"population":7,"wealth":9}'::jsonb
   ELSE NULL END) INTO v_award;
  IF v_award->>'status'<>'complete'
  THEN RAISE EXCEPTION 'R5 prêmio não confirmado: %',v_award; END IF;
  IF (SELECT count(*) FROM public.spy_intelligence_findings f
   JOIN public.spy_intelligence_dossiers d ON d.id=f.dossier_id
   WHERE d.owner_house_id='r5-l1-source' AND d.target_house_id='r5-l1-target'
    AND f.objective=v_objective)<3
  THEN RAISE EXCEPTION 'R5 informações faltando na modalidade %',v_objective; END IF;

  IF v_idx=3 THEN
   SELECT public.spy_resolve_agent_mission(v_op,15,0,false,NULL,NULL,
    v_agent_version,v_request_key,'Teste R5 isolado') INTO v_retry;
   IF v_retry->>'alreadyApplied'<>'true' OR
      (SELECT count(*) FROM public.spy_mission_decisions
       WHERE operation_id=v_op)<>1
   THEN RAISE EXCEPTION 'R5 homologação duplicada após retry: %',v_retry; END IF;
   SELECT public.spy_intelligence_finalize(v_op,NULL) INTO v_retry;
   IF v_retry->>'alreadyApplied'<>'true'
   THEN RAISE EXCEPTION 'R5 dossiê duplicado em retry: %',v_retry; END IF;
  END IF;
 END LOOP;
 SELECT mission_successes INTO v_successes FROM public.spy_assets WHERE id=v_agent;
 IF v_successes<>3 THEN RAISE EXCEPTION 'R5 XP esperado 3, recebido %',v_successes; END IF;
 SELECT count(*) INTO v_promo_count FROM public.spy_agent_history
  WHERE agent_id=v_agent AND event_type='promoted';
 IF v_promo_count<>1 OR (SELECT status FROM public.spy_assets WHERE id=v_agent)<>'available'
 THEN RAISE EXCEPTION 'R5 promoção (3 sucessos) incorreta'; END IF;

 -- Fracasso NÃO concede experiência ou prêmio.
 SELECT version INTO v_agent_version FROM public.spy_assets WHERE id=v_agent;
 SELECT version INTO v_calendar_version FROM public.campaign_calendar WHERE id=true;
 SELECT public.spy_submit_house_mission('r5-l1-source',v_agent,'r5-l1-target',
  'ferlin',v_agent_version,v_calendar_version,gen_random_uuid(),'house_resources')
  INTO v_submission;
 v_op:=(v_submission->>'operationId')::uuid;
 UPDATE public.campaign_calendar SET month=2,day=1,version=version+1 WHERE id=true;
 SELECT version INTO v_agent_version FROM public.spy_assets WHERE id=v_agent;
 SELECT public.spy_resolve_agent_mission(v_op,4,-9,false,NULL,NULL,
  v_agent_version,gen_random_uuid(),'Fracasso R5') INTO v_result;
 IF v_result->>'outcome'<>'mission_failure' OR
 (SELECT mission_successes FROM public.spy_assets WHERE id=v_agent)<>3 OR
 EXISTS(SELECT 1 FROM public.spy_intelligence_mission_awards WHERE operation_id=v_op)
 THEN RAISE EXCEPTION 'R5 fracasso concedeu prêmio ou XP'; END IF;

 -- Situação grave, espiao descoberto: guarda + Lei alta podem matá-lo.
 UPDATE public.noble_house_sheets SET state=jsonb_set(
  jsonb_set(state,'{base,law}','40'::jsonb),
  '{holdings}',(state->'holdings')||'[{"id":"g1","itemId":"pros-bailiffs","status":"active"},{"id":"g2","itemId":"pros-gaol","status":"active"}]'::jsonb)
 WHERE house_id='r5-l1-target';
 SELECT version INTO v_agent_version FROM public.spy_assets WHERE id=v_agent;
 SELECT version INTO v_calendar_version FROM public.campaign_calendar WHERE id=true;
 SELECT public.spy_submit_house_mission('r5-l1-source',v_agent,'r5-l1-target',
  'ferlin',v_agent_version,v_calendar_version,gen_random_uuid(),'house_resources')
  INTO v_submission;
 v_op:=(v_submission->>'operationId')::uuid;
 UPDATE public.campaign_calendar SET month=2,day=11,version=version+1 WHERE id=true;
 SELECT version INTO v_agent_version FROM public.spy_assets WHERE id=v_agent;
 SELECT public.spy_resolve_agent_mission(v_op,4,-9,true,NULL,NULL,
  v_agent_version,gen_random_uuid(),'Descoberto em perigo') INTO v_result;
 IF v_result->>'outcome'<>'dead' OR
 (SELECT status FROM public.spy_assets WHERE id=v_agent)<>'dead' OR
 (SELECT mission_successes FROM public.spy_assets WHERE id=v_agent)<>3
 THEN RAISE EXCEPTION 'R5 destino do agente incorreto: %',v_result; END IF;
 IF (SELECT count(*) FROM public.spy_mission_decisions)<>
   (SELECT count(*) FROM public.spy_operations)
 THEN RAISE EXCEPTION 'R5 operação sem decisão ou duplicada'; END IF;
END $accept$;
-- Sem commit: a transação apaga inclusive o usuário sintético de laboratório.
ROLLBACK;
