-- Corrige função de cadastro de jogadores: public.has_role(uuid,text)
-- foi removida, causando falha ao registrar conta e vínculo com Casa.
-- Reutiliza auth.admin API no servidor; não cria nem modifica senhas por SQL.
-- O privilégio EXECUTE permanece exclusivo do service_role.
BEGIN;
CREATE OR REPLACE FUNCTION public.admin_save_player_account(p_actor uuid, p_player uuid, p_user uuid, p_name text, p_house text, p_active boolean, p_edit boolean, p_change boolean, p_folder text, p_password_set boolean)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE pid uuid; BEGIN IF NOT EXISTS(SELECT 1 FROM public.user_roles admin_role WHERE admin_role.user_id=p_actor AND admin_role.role='admin') THEN RAISE EXCEPTION 'Acesso restrito ao Narrador'; END IF; PERFORM pg_advisory_xact_lock(hashtext(coalesce(p_user::text,p_player::text,p_name))); IF NOT EXISTS(SELECT 1 FROM public.house_catalog WHERE id=p_house) THEN RAISE EXCEPTION 'Casa não cadastrada'; END IF; IF p_player IS NOT NULL AND NOT EXISTS(SELECT 1 FROM public.campaign_players WHERE id=p_player) THEN RAISE EXCEPTION 'Jogador não encontrado'; END IF; IF p_player IS NOT NULL THEN pid:=p_player; ELSIF p_user IS NOT NULL THEN SELECT id INTO pid FROM public.campaign_players WHERE user_id=p_user; END IF; IF EXISTS(SELECT 1 FROM public.campaign_players WHERE user_id=p_user AND id IS DISTINCT FROM pid) THEN RAISE EXCEPTION 'Conta já vinculada a outro jogador'; END IF; IF pid IS NULL THEN INSERT INTO public.campaign_players(name,user_id,roster_house_id,active,require_password_change,folder_id) VALUES(p_name,p_user,p_house,p_active,p_change,p_folder) RETURNING id INTO pid; ELSE UPDATE public.campaign_players SET name=p_name,user_id=p_user,roster_house_id=p_house,active=p_active,require_password_change=p_change,folder_id=p_folder WHERE id=pid; END IF; INSERT INTO public.house_memberships(player_id,house_id,can_edit,authorized_by) VALUES(pid,p_house,p_edit,p_actor) ON CONFLICT(player_id,house_id) DO UPDATE SET can_edit=excluded.can_edit,authorized_by=excluded.authorized_by; INSERT INTO public.campaign_admin_audit(actor,target_player,action,details) VALUES(p_actor,pid,CASE WHEN p_password_set THEN 'account_password_set' ELSE 'player_management' END,jsonb_build_object('active',p_active,'requireChange',p_change,'houseId',p_house)); RETURN pid; END $function$
;
REVOKE ALL ON FUNCTION public.admin_save_player_account(uuid,uuid,uuid,text,text,boolean,boolean,boolean,text,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.admin_save_player_account(uuid,uuid,uuid,text,text,boolean,boolean,boolean,text,boolean) TO service_role;
COMMIT;
