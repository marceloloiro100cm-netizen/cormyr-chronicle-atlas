-- Cormyr: três perfis mutuamente exclusivos. O perfil editor não é Casa, ficha ou missiva.
-- Aplicar depois de 0111_campaign_newspaper.sql; nunca cria ou modifica senhas.
BEGIN;

CREATE TABLE IF NOT EXISTS public.campaign_access_profiles (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  profile text NOT NULL CHECK (profile IN ('jogador','editor','narrador')),
  active boolean NOT NULL DEFAULT true,
  assigned_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.campaign_access_profiles ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.campaign_access_profiles FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.campaign_access_profiles TO authenticated;
GRANT ALL ON public.campaign_access_profiles TO service_role;
DROP POLICY IF EXISTS account_profile_self_read ON public.campaign_access_profiles;
CREATE POLICY account_profile_self_read ON public.campaign_access_profiles FOR SELECT TO authenticated
 USING (user_id=auth.uid() OR public.is_campaign_admin());

INSERT INTO public.campaign_access_profiles(user_id,profile,active)
 SELECT p.user_id,'jogador',p.active FROM public.campaign_players p
 JOIN auth.users a ON a.id=p.user_id
 WHERE p.user_id IS NOT NULL
ON CONFLICT(user_id) DO NOTHING;
INSERT INTO public.campaign_access_profiles(user_id,profile,active)
 SELECT u.user_id,'narrador',true FROM public.user_roles u WHERE u.role='admin'
ON CONFLICT(user_id) DO UPDATE SET profile='narrador',active=true;

-- Migração conservadora do antigo pseudo-vínculo Espião: preserva usuário e histórico,
-- revoga TODAS as autorizações de Casas e retira a filiação da ficha de jogador.
DO $migrate$
DECLARE v_player uuid; v_user uuid; v_total integer;
BEGIN
 SELECT count(*) INTO v_total FROM public.campaign_players
  WHERE lower(btrim(name))='leonardo' AND roster_house_id='espiao' AND user_id IS NOT NULL;
 IF v_total>1 THEN
   RAISE EXCEPTION 'Mais de uma identidade Leonardo/Espião: migração requer conciliação manual.';
 END IF;
 IF v_total=1 THEN
   SELECT id,user_id INTO v_player,v_user FROM public.campaign_players
    WHERE lower(btrim(name))='leonardo' AND roster_house_id='espiao' AND user_id IS NOT NULL;
   IF EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=v_user AND role='admin') THEN
     RAISE EXCEPTION 'Conta do Narrador não pode ser convertida para editor.';
   END IF;
   DELETE FROM public.house_memberships WHERE player_id=v_player;
   UPDATE public.campaign_players SET roster_house_id=NULL,folder_id=NULL WHERE id=v_player;
   INSERT INTO public.campaign_access_profiles(user_id,profile,active)
    VALUES(v_user,'editor',true)
    ON CONFLICT(user_id) DO UPDATE SET profile='editor',active=true;
 END IF;
END $migrate$;

CREATE OR REPLACE FUNCTION public.is_campaign_editor_identity()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
 SELECT auth.uid() IS NOT NULL AND NOT public.is_campaign_admin() AND EXISTS (
  SELECT 1 FROM public.campaign_access_profiles a
   WHERE a.user_id=auth.uid() AND a.profile='editor'
 );
$function$;
REVOKE ALL ON FUNCTION public.is_campaign_editor_identity() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_campaign_editor_identity() TO authenticated;

CREATE OR REPLACE FUNCTION public.is_campaign_editor()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
 SELECT public.is_campaign_editor_identity() AND EXISTS (
  SELECT 1 FROM public.campaign_access_profiles a
  JOIN public.campaign_players p ON p.user_id=a.user_id
  WHERE a.user_id=auth.uid() AND a.profile='editor' AND a.active
    AND p.active AND lower(btrim(p.name))='leonardo'
 );
$function$;
REVOKE ALL ON FUNCTION public.is_campaign_editor() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.is_campaign_editor() TO authenticated;

CREATE OR REPLACE FUNCTION public.current_campaign_profile()
 RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
 SELECT CASE
  WHEN auth.uid() IS NULL THEN NULL
  WHEN public.is_campaign_admin() THEN 'narrador'
  WHEN public.is_campaign_editor() THEN 'editor'
  WHEN EXISTS (
   SELECT 1 FROM public.campaign_players p
   JOIN public.house_memberships m ON m.player_id=p.id
   LEFT JOIN public.campaign_access_profiles a ON a.user_id=p.user_id
   WHERE p.user_id=auth.uid() AND p.active
    AND (a.user_id IS NULL OR (a.profile='jogador' AND a.active))
  ) THEN 'jogador'
  ELSE NULL END;
$function$;
REVOKE ALL ON FUNCTION public.current_campaign_profile() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.current_campaign_profile() TO authenticated;

-- Compatibilidade com as funções de acesso anteriores, negando explicitamente
-- a identidade de jogador/casa para quem possui o perfil editorial.
CREATE OR REPLACE FUNCTION public.my_player_id()
 RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
 SELECT id FROM public.campaign_players
  WHERE user_id=auth.uid() AND NOT public.is_campaign_editor_identity();
$function$;
CREATE OR REPLACE FUNCTION public.in_campaign_house(h text,edit_required boolean DEFAULT false)
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
 SELECT NOT public.is_campaign_editor_identity() AND EXISTS(
  SELECT 1 FROM public.house_memberships m
  JOIN public.campaign_players p ON p.id=m.player_id
  WHERE p.user_id=auth.uid() AND m.house_id=h
   AND (NOT edit_required OR m.can_edit)
 );
$function$;

-- O banco impede criar uma filiação nobre para um editor, inclusive através de
-- rotinas administrativas antigas que ainda esperem a antiga Casa 'espiao'.
CREATE OR REPLACE FUNCTION public.guard_campaign_editor_house()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
BEGIN
 IF EXISTS (
   SELECT 1 FROM public.campaign_players p
   JOIN public.campaign_access_profiles a ON a.user_id=p.user_id
   WHERE p.id=NEW.player_id AND a.profile='editor'
 ) THEN
   RAISE EXCEPTION 'Perfil Editor-Chefe não pode possuir Casa.'
    USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS guard_editor_house_membership ON public.house_memberships;
CREATE TRIGGER guard_editor_house_membership
 BEFORE INSERT OR UPDATE ON public.house_memberships FOR EACH ROW
 EXECUTE FUNCTION public.guard_campaign_editor_house();

CREATE OR REPLACE FUNCTION public.guard_campaign_editor_roster()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
BEGIN
 IF NEW.roster_house_id IS NOT NULL AND EXISTS (
   SELECT 1 FROM public.campaign_access_profiles a
    WHERE a.user_id=NEW.user_id AND a.profile='editor'
 ) THEN RAISE EXCEPTION 'Editor-Chefe não possui Casa no elenco.'
   USING ERRCODE='42501'; END IF;
 RETURN NEW;
END;
$function$;
DROP TRIGGER IF EXISTS guard_editor_roster ON public.campaign_players;
CREATE TRIGGER guard_editor_roster
 BEFORE INSERT OR UPDATE OF roster_house_id,user_id ON public.campaign_players FOR EACH ROW
 EXECUTE FUNCTION public.guard_campaign_editor_roster();

-- Proibição de missivas por RLS e por gatilho (também vale nas RPCs SECURITY DEFINER).
CREATE OR REPLACE FUNCTION public.block_campaign_editor_mail()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
BEGIN
 IF public.is_campaign_editor_identity() THEN
  RAISE EXCEPTION 'O perfil Editor-Chefe não possui Missivas.'
   USING ERRCODE='42501';
 END IF;
 RETURN CASE WHEN TG_OP='DELETE' THEN OLD ELSE NEW END;
END;
$function$;
REVOKE ALL ON FUNCTION public.block_campaign_editor_mail() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS zz_editor_mail_guard ON public.campaign_letters;
CREATE TRIGGER zz_editor_mail_guard BEFORE INSERT OR UPDATE OR DELETE
 ON public.campaign_letters FOR EACH ROW EXECUTE FUNCTION public.block_campaign_editor_mail();
DROP TRIGGER IF EXISTS zz_editor_reply_guard ON public.letter_replies;
CREATE TRIGGER zz_editor_reply_guard BEFORE INSERT OR UPDATE OR DELETE
 ON public.letter_replies FOR EACH ROW EXECUTE FUNCTION public.block_campaign_editor_mail();

DROP POLICY IF EXISTS editor_no_letters ON public.campaign_letters;
CREATE POLICY editor_no_letters ON public.campaign_letters AS RESTRICTIVE
 FOR ALL TO authenticated USING (NOT public.is_campaign_editor_identity())
 WITH CHECK (NOT public.is_campaign_editor_identity());
DROP POLICY IF EXISTS editor_no_replies ON public.letter_replies;
CREATE POLICY editor_no_replies ON public.letter_replies AS RESTRICTIVE
 FOR ALL TO authenticated USING (NOT public.is_campaign_editor_identity())
 WITH CHECK (NOT public.is_campaign_editor_identity());
DROP POLICY IF EXISTS editor_no_letter_receipts ON public.letter_receipts;
CREATE POLICY editor_no_letter_receipts ON public.letter_receipts AS RESTRICTIVE
 FOR ALL TO authenticated USING (NOT public.is_campaign_editor_identity())
 WITH CHECK (NOT public.is_campaign_editor_identity());
DROP POLICY IF EXISTS editor_no_house_records ON public.campaign_records;
CREATE POLICY editor_no_house_records ON public.campaign_records AS RESTRICTIVE
 FOR ALL TO authenticated USING (NOT public.is_campaign_editor_identity())
 WITH CHECK (NOT public.is_campaign_editor_identity());

-- Substitui a autorização do Jornal baseada em nome/casa pela autorização editorial.
CREATE OR REPLACE FUNCTION public.can_edit_campaign_newspaper()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
 SELECT public.is_campaign_admin() OR (
  public.is_campaign_editor() AND EXISTS(
   SELECT 1 FROM public.campaign_players p WHERE p.user_id=auth.uid()
    AND p.active AND NOT p.require_password_change
  )
 );
$function$;
CREATE OR REPLACE FUNCTION public.can_read_campaign_newspaper_player()
 RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp
AS $function$
 SELECT public.current_campaign_profile()='jogador'
  AND EXISTS(SELECT 1 FROM public.campaign_players p
   WHERE p.user_id=auth.uid() AND p.active AND NOT p.require_password_change);
$function$;

COMMIT;
