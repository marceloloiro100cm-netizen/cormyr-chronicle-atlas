CREATE TABLE IF NOT EXISTS public.player_weekly_completion (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    player_id uuid NOT NULL REFERENCES public.campaign_players(id) ON DELETE CASCADE,
    week integer NOT NULL,
    status text NOT NULL CHECK (status IN ('in_progress', 'completed')),
    completed_at timestamptz,
    resumed_at timestamptz,
    actor uuid NOT NULL REFERENCES auth.users(id),
    narrator_actor uuid REFERENCES auth.users(id),
    version integer NOT NULL DEFAULT 1,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT player_weekly_completion_player_week_key UNIQUE (player_id, week)
);

CREATE TABLE IF NOT EXISTS public.player_weekly_completion_log (
    id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
    completion_id uuid NOT NULL REFERENCES public.player_weekly_completion(id) ON DELETE CASCADE,
    player_id uuid NOT NULL,
    week integer NOT NULL,
    status text NOT NULL,
    actor uuid NOT NULL REFERENCES auth.users(id),
    narrator_actor uuid REFERENCES auth.users(id),
    created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.player_weekly_completion ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_all ON public.player_weekly_completion FOR SELECT TO authenticated USING (true);
CREATE POLICY write_own ON public.player_weekly_completion FOR ALL TO authenticated USING (
    (SELECT user_id FROM public.campaign_players WHERE id = player_weekly_completion.player_id) = auth.uid() OR
    EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin')
);

ALTER TABLE public.player_weekly_completion_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_all_log ON public.player_weekly_completion_log FOR SELECT TO authenticated USING (true);

-- Helper to check admin status if it doesn't exist
CREATE OR REPLACE FUNCTION public.is_campaign_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin');
$$;

-- complete_weekly_letters
CREATE OR REPLACE FUNCTION public.complete_weekly_letters(p_player uuid, p_week integer, p_actor uuid, p_narrator uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_current_version integer;
  v_auth_uid uuid := auth.uid();
  v_is_admin boolean;
  v_player_user_id uuid;
BEGIN
  IF v_auth_uid IS NULL THEN RAISE EXCEPTION 'Sessão expirada.'; END IF;

  -- IDOR fix: ensure p_actor matches auth.uid()
  IF p_actor <> v_auth_uid THEN RAISE EXCEPTION 'Usuário ator incorreto.'; END IF;

  SELECT is_campaign_admin() INTO v_is_admin;
  SELECT user_id INTO v_player_user_id FROM public.campaign_players WHERE id = p_player;

  -- IDOR fix: ensure user is either admin or the owner of the player
  IF NOT v_is_admin AND (v_player_user_id IS NULL OR v_player_user_id <> v_auth_uid) THEN
    RAISE EXCEPTION 'Não autorizado. Apenas o próprio jogador ou narrador pode realizar esta ação.';
  END IF;

  INSERT INTO public.player_weekly_completion (player_id, week, status, completed_at, actor, narrator_actor)
  VALUES (p_player, p_week, 'completed', now(), p_actor, p_narrator)
  ON CONFLICT (player_id, week) DO UPDATE SET
      status = 'completed',
      completed_at = now(),
      actor = EXCLUDED.actor,
      narrator_actor = EXCLUDED.narrator_actor,
      version = player_weekly_completion.version + 1,
      updated_at = now()
  RETURNING version INTO v_current_version;

  INSERT INTO public.player_weekly_completion_log (completion_id, player_id, week, status, actor, narrator_actor)
  SELECT id, player_id, week, status, actor, narrator_actor FROM public.player_weekly_completion WHERE player_id = p_player AND week = p_week;

  RETURN jsonb_build_object('success', true, 'version', v_current_version);
END $$;
REVOKE ALL ON FUNCTION public.complete_weekly_letters(uuid, integer, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_weekly_letters(uuid, integer, uuid, uuid) TO authenticated;

-- resume_weekly_letters
CREATE OR REPLACE FUNCTION public.resume_weekly_letters(p_player uuid, p_week integer, p_actor uuid, p_narrator uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_current_version integer;
  v_auth_uid uuid := auth.uid();
  v_is_admin boolean;
  v_player_user_id uuid;
BEGIN
  IF v_auth_uid IS NULL THEN RAISE EXCEPTION 'Sessão expirada.'; END IF;

  -- IDOR fix: ensure p_actor matches auth.uid()
  IF p_actor <> v_auth_uid THEN RAISE EXCEPTION 'Usuário ator incorreto.'; END IF;

  SELECT is_campaign_admin() INTO v_is_admin;
  SELECT user_id INTO v_player_user_id FROM public.campaign_players WHERE id = p_player;

  -- IDOR fix: ensure user is either admin or the owner of the player
  IF NOT v_is_admin AND (v_player_user_id IS NULL OR v_player_user_id <> v_auth_uid) THEN
    RAISE EXCEPTION 'Não autorizado. Apenas o próprio jogador ou narrador pode realizar esta ação.';
  END IF;

  INSERT INTO public.player_weekly_completion (player_id, week, status, resumed_at, actor, narrator_actor)
  VALUES (p_player, p_week, 'in_progress', now(), p_actor, p_narrator)
  ON CONFLICT (player_id, week) DO UPDATE SET
      status = 'in_progress',
      resumed_at = now(),
      actor = EXCLUDED.actor,
      narrator_actor = EXCLUDED.narrator_actor,
      version = player_weekly_completion.version + 1,
      updated_at = now()
  RETURNING version INTO v_current_version;

  INSERT INTO public.player_weekly_completion_log (completion_id, player_id, week, status, actor, narrator_actor)
  SELECT id, player_id, week, status, actor, narrator_actor FROM public.player_weekly_completion WHERE player_id = p_player AND week = p_week;

  RETURN jsonb_build_object('success', true, 'version', v_current_version);
END $$;
REVOKE ALL ON FUNCTION public.resume_weekly_letters(uuid, integer, uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.resume_weekly_letters(uuid, integer, uuid, uuid) TO authenticated;
