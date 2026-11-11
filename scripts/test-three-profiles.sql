-- Exercita os três perfis somente em PostgreSQL descartável de CI.
BEGIN;
DO $check$
DECLARE
 v_editor uuid:=gen_random_uuid();
 v_player uuid:=gen_random_uuid();
 v_admin uuid:=gen_random_uuid();
 v_editor_record uuid;
 v_player_record uuid;
 v_profile text;
BEGIN
 IF has_table_privilege('anon','public.campaign_access_profiles','SELECT') THEN
   RAISE EXCEPTION 'Tabela de perfis indevidamente pública.';
 END IF;
 INSERT INTO auth.users(id) VALUES(v_editor),(v_player),(v_admin);
 INSERT INTO public.campaign_players(user_id,name,active,require_password_change,roster_house_id)
  VALUES(v_editor,'Leonardo',true,false,NULL) RETURNING id INTO v_editor_record;
 INSERT INTO public.campaign_access_profiles(user_id,profile,active)
  VALUES(v_editor,'editor',true);
 INSERT INTO public.campaign_houses(id,name,season,active,source)
  VALUES('test-profile-house','Casa de Teste',2,true,'test-disposable');
 INSERT INTO public.campaign_players(user_id,name,active,require_password_change,roster_house_id)
  VALUES(v_player,'Jogador de Teste',true,false,'test-profile-house')
  RETURNING id INTO v_player_record;
 INSERT INTO public.house_memberships(player_id,house_id,can_edit,authorized_by)
  VALUES(v_player_record,'test-profile-house',true,v_admin);
 INSERT INTO public.user_roles(user_id,role) VALUES(v_admin,'admin');

 PERFORM set_config('request.jwt.claim.sub',v_editor::text,true);
 IF public.current_campaign_profile()<>'editor'
    OR NOT public.is_campaign_editor()
    OR NOT public.can_edit_campaign_newspaper() THEN
  RAISE EXCEPTION 'Editor-Chefe não autorizado no Jornal.';
 END IF;
 IF public.my_player_id() IS NOT NULL
    OR public.in_campaign_house('test-profile-house') THEN
  RAISE EXCEPTION 'Editor-Chefe recebeu permissão de Casa.';
 END IF;
 BEGIN
  INSERT INTO public.house_memberships(player_id,house_id,can_edit,authorized_by)
    VALUES(v_editor_record,'test-profile-house',false,v_admin);
  RAISE EXCEPTION 'Editor-Chefe recebeu filiação nobre indevida.';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;
 BEGIN
  UPDATE public.campaign_players SET roster_house_id='test-profile-house' WHERE id=v_editor_record;
  RAISE EXCEPTION 'Editor-Chefe recebeu uma Casa no elenco.';
 EXCEPTION WHEN insufficient_privilege THEN NULL;
 END;

 PERFORM set_config('request.jwt.claim.sub',v_player::text,true);
 IF public.current_campaign_profile()<>'jogador'
    OR public.is_campaign_editor()
    OR NOT public.in_campaign_house('test-profile-house') THEN
  RAISE EXCEPTION 'Jogador não ficou vinculado à Casa.';
 END IF;
 PERFORM set_config('request.jwt.claim.sub',v_admin::text,true);
 IF public.current_campaign_profile()<>'narrador' OR NOT public.is_campaign_admin() THEN
  RAISE EXCEPTION 'Narrador sem autoridade total.';
 END IF;
END $check$;
ROLLBACK;
