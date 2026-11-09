-- Cormyr R5 Lote 3. Aceite de isolamento de CASAS com papeis JWT de laboratorio.
-- Executar SOMENTE no banco isolado e vazio de HOMOLOGACAO.
-- Esta transacao NAO usa contas reais; nao valida o login do Supabase Auth.
-- Todo usuario, Casa e vinculo sinteticos sao descartados com ROLLBACK.
BEGIN;
DO $guard$
BEGIN
 IF EXISTS(SELECT 1 FROM auth.users) OR
    EXISTS(SELECT 1 FROM public.campaign_players) OR
    EXISTS(SELECT 1 FROM public.campaign_calendar) OR
    EXISTS(SELECT 1 FROM public.spy_assets)
 THEN RAISE EXCEPTION 'R5 L3: banco nao isolado; ABORTAR'; END IF;
END $guard$;

INSERT INTO auth.users(id,aud,role,email,created_at,updated_at) VALUES
('a1111111-1111-4111-8111-111111111111','authenticated','authenticated','r5-l3-a@invalid.example',now(),now()),
('b2222222-2222-4222-8222-222222222222','authenticated','authenticated','r5-l3-b@invalid.example',now(),now()),
('c3333333-3333-4333-8333-333333333333','authenticated','authenticated','r5-l3-narrator@invalid.example',now(),now());
INSERT INTO public.campaign_houses(id,name,region)
VALUES('r5-l3-house-a','R5 Casa A','dragoncoast'),('r5-l3-house-b','R5 Casa B','ferlin');
INSERT INTO public.campaign_players(id,user_id,name)
VALUES('d1111111-1111-4111-8111-111111111111','a1111111-1111-4111-8111-111111111111','R5 A'),
('d2222222-2222-4222-8222-222222222222','b2222222-2222-4222-8222-222222222222','R5 B');
INSERT INTO public.house_memberships(player_id,house_id,can_edit,authorized_by)
VALUES('d1111111-1111-4111-8111-111111111111','r5-l3-house-a',true,'c3333333-3333-4333-8333-333333333333'),
('d2222222-2222-4222-8222-222222222222','r5-l3-house-b',true,'c3333333-3333-4333-8333-333333333333');
INSERT INTO public.user_roles(user_id,role)
VALUES('c3333333-3333-4333-8333-333333333333','admin');

DO $checks$
DECLARE actor text;own_house text;other_house text;outcome jsonb;denied boolean;
BEGIN
 FOREACH actor IN ARRAY ARRAY[
  'a1111111-1111-4111-8111-111111111111',
  'b2222222-2222-4222-8222-222222222222']
 LOOP
  PERFORM set_config('request.jwt.claim.sub',actor,true);
  PERFORM set_config('request.jwt.claims',
   jsonb_build_object('sub',actor,'role','authenticated')::text,true);
  own_house:=CASE WHEN actor LIKE 'a%' THEN 'r5-l3-house-a' ELSE 'r5-l3-house-b' END;
  other_house:=CASE WHEN own_house='r5-l3-house-a'
   THEN 'r5-l3-house-b' ELSE 'r5-l3-house-a' END;
  IF NOT public.campaign_access_active() OR public.is_campaign_admin() OR
     NOT public.in_campaign_house(own_house,true) OR
     public.in_campaign_house(other_house,false)
  THEN RAISE EXCEPTION 'R5 L3: jogador com permissao errada'; END IF;

  SELECT public.spy_house_management(own_house) INTO outcome;
  IF outcome->>'houseId'<>own_house
  THEN RAISE EXCEPTION 'R5 L3: gerenciamento retornou Casa errada'; END IF;
  SELECT public.spy_intelligence_read(own_house) INTO outcome;
  IF jsonb_typeof(outcome)<>'array'
  THEN RAISE EXCEPTION 'R5 L3: dossie proprio invalido'; END IF;

  denied:=false;
  BEGIN PERFORM public.spy_house_management(other_house);
   EXCEPTION WHEN OTHERS THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'R5 L3: vazamento de agentes adversarios'; END IF;

  denied:=false;
  BEGIN PERFORM public.spy_intelligence_read(other_house);
   EXCEPTION WHEN OTHERS THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'R5 L3: vazamento de dossie adversario'; END IF;

  denied:=false;
  BEGIN PERFORM public.spy_narrator_operations_dashboard();
   EXCEPTION WHEN OTHERS THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'R5 L3: vazamento de operacoes do Narrador'; END IF;

  denied:=false;
  BEGIN PERFORM public.spy_narrator_incident_history();
   EXCEPTION WHEN OTHERS THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'R5 L3: vazamento de incidentes'; END IF;

  denied:=false;
  BEGIN PERFORM public.spy_intelligence_admin_pending();
   EXCEPTION WHEN OTHERS THEN denied:=true; END;
  IF NOT denied THEN RAISE EXCEPTION 'R5 L3: vazamento da fila de premios'; END IF;
 END LOOP;

 actor:='c3333333-3333-4333-8333-333333333333';
 PERFORM set_config('request.jwt.claim.sub',actor,true);
 PERFORM set_config('request.jwt.claims',
  jsonb_build_object('sub',actor,'role','authenticated')::text,true);
 IF NOT public.is_campaign_admin() OR NOT public.campaign_access_active()
 THEN RAISE EXCEPTION 'R5 L3: Narrador sem acesso'; END IF;
 SELECT public.spy_narrator_operations_dashboard() INTO outcome;
 IF jsonb_typeof(outcome)<>'array'
 THEN RAISE EXCEPTION 'R5 L3: Central do Narrador invalida'; END IF;
 SELECT public.spy_narrator_incident_history() INTO outcome;
 IF jsonb_typeof(outcome)<>'array'
 THEN RAISE EXCEPTION 'R5 L3: arquivo de incidentes invalido'; END IF;
 SELECT public.spy_intelligence_read(NULL) INTO outcome;
 IF jsonb_typeof(outcome)<>'array'
 THEN RAISE EXCEPTION 'R5 L3: dossies do Narrador invalidos'; END IF;
 SELECT public.spy_intelligence_admin_pending() INTO outcome;
 IF jsonb_typeof(outcome)<>'array'
 THEN RAISE EXCEPTION 'R5 L3: fila administrativa invalida'; END IF;
END $checks$;

-- CRITICO: nenhuma mutacao sobrevive a esta linha.
ROLLBACK;