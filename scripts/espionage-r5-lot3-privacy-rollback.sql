-- R5 Lote 3: teste real de RPCs protegidas com identidades sintéticas em laboratório.
-- Requer homologação isolada vazia, BEGIN/ROLLBACK. NÃO executar em produção.
BEGIN;
DO $guard$
BEGIN
 IF EXISTS(SELECT 1 FROM auth.users) OR EXISTS(SELECT 1 FROM public.campaign_players)
  OR EXISTS(SELECT 1 FROM public.campaign_calendar)
  OR EXISTS(SELECT 1 FROM public.spy_intelligence_dossiers)
  OR EXISTS(SELECT 1 FROM public.spy_assets)
 THEN RAISE EXCEPTION 'R5 L3: laboratório não isolado, recusar teste'; END IF;
END $guard$;

INSERT INTO auth.users(id,aud,role,email,created_at,updated_at)
VALUES
('d3d3d3d3-d3d3-43d3-83d3-d3d3d3d3d3d3','authenticated','authenticated','r5-l3-narrator@invalid.example',now(),now()),
('a3a3a3a3-a3a3-43a3-83a3-a3a3a3a3a3a3','authenticated','authenticated','r5-l3-player-a@invalid.example',now(),now()),
('b3b3b3b3-b3b3-43b3-83b3-b3b3b3b3b3b3','authenticated','authenticated','r5-l3-player-b@invalid.example',now(),now());
INSERT INTO public.user_roles(user_id,role)
VALUES('d3d3d3d3-d3d3-43d3-83d3-d3d3d3d3d3d3','admin');
INSERT INTO public.campaign_houses(id,name,region)
VALUES('r5-l3-owner','R5 Casa A','dragoncoast'),('r5-l3-other','R5 Casa B','ferlin');
INSERT INTO public.house_catalog(id,name,region,classification,archive_data,public_reviewed)
VALUES
('r5-l3-owner','R5 Casa A','dragoncoast','noble','{}'::jsonb,true),
('r5-l3-other','R5 Casa B','ferlin','noble','{}'::jsonb,true);
INSERT INTO public.campaign_players(id,user_id,name)
VALUES
('a4a4a4a4-a4a4-44a4-84a4-a4a4a4a4a4a4','a3a3a3a3-a3a3-43a3-83a3-a3a3a3a3a3a3','Jogador A de Laboratório'),
('b4b4b4b4-b4b4-44b4-84b4-b4b4b4b4b4b4','b3b3b3b3-b3b3-43b3-83b3-b3b3b3b3b3b3','Jogador B de Laboratório');
INSERT INTO public.house_memberships(player_id,house_id,can_edit,authorized_by)
VALUES
('a4a4a4a4-a4a4-44a4-84a4-a4a4a4a4a4a4','r5-l3-owner',true,'d3d3d3d3-d3d3-43d3-83d3-d3d3d3d3d3d3'),
('b4b4b4b4-b4b4-44b4-84b4-b4b4b4b4b4b4','r5-l3-other',true,'d3d3d3d3-d3d3-43d3-83d3-d3d3d3d3d3d3');
INSERT INTO public.spy_intelligence_dossiers(id,owner_house_id,target_house_id)
VALUES('c3c3c3c3-c3c3-43c3-83c3-c3c3c3c3c3c3','r5-l3-owner','r5-l3-other');
INSERT INTO public.spy_intelligence_findings(
 id,dossier_id,objective,subject_key,value_snapshot,discovered_date_key,verified_date_key)
VALUES('e3e3e3e3-e3e3-43e3-83e3-e3e3e3e3e3e3',
 'c3c3c3c3-c3c3-43c3-83c3-c3c3c3c3c3c3',
 'house_resources','law','{"value":31}'::jsonb,'1522-01-11','1522-01-21');
DO $tests$
DECLARE v jsonb;v_blocked boolean;
BEGIN
 -- Player A: only his House and only one discovered attribute.
 PERFORM set_config('request.jwt.claim.sub','a3a3a3a3-a3a3-43a3-83a3-a3a3a3a3a3a3',true);
 PERFORM set_config('request.jwt.claims','{"sub":"a3a3a3a3-a3a3-43a3-83a3-a3a3a3a3a3a3","role":"authenticated"}',true);
 IF NOT public.campaign_access_active() OR
  NOT public.in_campaign_house('r5-l3-owner',false) OR
  public.in_campaign_house('r5-l3-other',false)
 THEN RAISE EXCEPTION 'R5 L3: associação do jogador A incorreta'; END IF;
 SELECT public.spy_intelligence_read('r5-l3-owner') INTO v;
 IF jsonb_array_length(v)<>1 OR
  jsonb_array_length(v->0->'findings')<>1 OR
  v->0->'findings'->0->>'key'<>'law' OR
  jsonb_array_length(v->0->'adminHistory')<>0
 THEN RAISE EXCEPTION 'R5 L3: jogador A recebeu descobertas indevidas ou faltando: %',v; END IF;
 v_blocked:=false;
 BEGIN PERFORM public.spy_intelligence_read(NULL);
 EXCEPTION WHEN OTHERS THEN v_blocked:=true; END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'R5 L3: jogador A acessou todos os dossiês'; END IF;
 v_blocked:=false;
 BEGIN PERFORM public.spy_intelligence_read('r5-l3-other');
 EXCEPTION WHEN OTHERS THEN v_blocked:=true; END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'R5 L3: jogador A acessou dossiê de Casa B'; END IF;
 v_blocked:=false;
 BEGIN PERFORM public.spy_narrator_operations_dashboard();
 EXCEPTION WHEN OTHERS THEN v_blocked:=true; END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'R5 L3: jogador A acessou Central'; END IF;
 v_blocked:=false;
 BEGIN PERFORM public.spy_narrator_incident_history();
 EXCEPTION WHEN OTHERS THEN v_blocked:=true; END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'R5 L3: jogador A acessou arquivo de incidentes'; END IF;
 v_blocked:=false;
 BEGIN PERFORM public.spy_intelligence_admin_pending();
 EXCEPTION WHEN OTHERS THEN v_blocked:=true; END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'R5 L3: jogador A acessou fila administrativa'; END IF;

 -- Player B: isolated from Casa A; own dossier list must be empty.
 PERFORM set_config('request.jwt.claim.sub','b3b3b3b3-b3b3-43b3-83b3-b3b3b3b3b3b3',true);
 PERFORM set_config('request.jwt.claims','{"sub":"b3b3b3b3-b3b3-43b3-83b3-b3b3b3b3b3b3","role":"authenticated"}',true);
 SELECT public.spy_intelligence_read('r5-l3-other') INTO v;
 IF jsonb_array_length(v)<>0
 THEN RAISE EXCEPTION 'R5 L3: jogador B leu informação de A'; END IF;
 v_blocked:=false;
 BEGIN PERFORM public.spy_intelligence_read('r5-l3-owner');
 EXCEPTION WHEN OTHERS THEN v_blocked:=true; END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'R5 L3: jogador B leu A'; END IF;

 -- Admin: full authorized list and admin-only reads.
 PERFORM set_config('request.jwt.claim.sub','d3d3d3d3-d3d3-43d3-83d3-d3d3d3d3d3d3',true);
 PERFORM set_config('request.jwt.claims','{"sub":"d3d3d3d3-d3d3-43d3-83d3-d3d3d3d3d3d3","role":"authenticated"}',true);
 IF NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'R5 L3: admin não autorizado'; END IF;
 SELECT public.spy_intelligence_read(NULL) INTO v;
 IF jsonb_array_length(v)<>1
 THEN RAISE EXCEPTION 'R5 L3: admin sem dossiês completos'; END IF;
 IF jsonb_typeof(public.spy_narrator_operations_dashboard())<>'array'
  OR jsonb_typeof(public.spy_narrator_incident_history())<>'array'
  OR jsonb_typeof(public.spy_intelligence_admin_pending())<>'array'
 THEN RAISE EXCEPTION 'R5 L3: RPC administrativa inválida'; END IF;

 -- No identity: rejects all private reads.
 PERFORM set_config('request.jwt.claim.sub','',true);
 PERFORM set_config('request.jwt.claims','{}',true);
 v_blocked:=false;
 BEGIN PERFORM public.spy_intelligence_read('r5-l3-owner');
 EXCEPTION WHEN OTHERS THEN v_blocked:=true; END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'R5 L3: anônimo leu dossiê'; END IF;
 v_blocked:=false;
 BEGIN PERFORM public.spy_narrator_operations_dashboard();
 EXCEPTION WHEN OTHERS THEN v_blocked:=true; END;
 IF NOT v_blocked THEN RAISE EXCEPTION 'R5 L3: anônimo leu Central'; END IF;
END $tests$;
ROLLBACK;
