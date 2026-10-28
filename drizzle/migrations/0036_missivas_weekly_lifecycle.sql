-- 0036_missivas_weekly_lifecycle.sql

-- Helper to get narrator status
CREATE OR REPLACE FUNCTION public.is_campaign_admin() RETURNS boolean LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND role = 'admin');
$$;

-- reply_weekly_message
CREATE OR REPLACE FUNCTION public.reply_weekly_message(p_letter uuid, p_reply uuid, p_content text, p_key uuid, p_draft boolean) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_admin boolean;
  v_letter record;
  v_open_week integer;
  v_delivery integer;
  v_state text;
  v_delivered_at timestamptz;
  v_author_name text;
  v_author_player uuid;
  v_house uuid;
  v_completed text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sessão expirada.'; END IF;
  SELECT is_campaign_admin() INTO v_admin;

  PERFORM pg_advisory_xact_lock(hashtextextended('letter:' || p_letter, 0));

  SELECT * INTO v_letter FROM public.campaign_letters WHERE id = p_letter FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Missiva não encontrada.'; END IF;

  SELECT number INTO v_open_week FROM public.letter_rounds WHERE status = 'open' ORDER BY number DESC LIMIT 1;
  IF v_open_week IS NULL AND NOT p_draft THEN RAISE EXCEPTION 'Não há semana aberta para enviar respostas.'; END IF;

  -- Determine author details and check permissions (IDOR fix)
  IF v_admin THEN
    v_author_name := 'Mestre';
  ELSE
    IF NOT (
      v_user = v_letter.sender_user_id
      OR v_user = (SELECT user_id FROM public.campaign_players WHERE id = v_letter.recipient_player_id)
      OR EXISTS (
        SELECT 1 FROM public.house_memberships m
        JOIN public.campaign_players p ON p.id = m.player_id
        WHERE p.user_id = v_user AND m.house_id = v_letter.recipient_house_id
      )
    ) THEN
      RAISE EXCEPTION 'Jogador não autorizado.';
    END IF;

    SELECT p.id, p.name INTO v_author_player, v_author_name
    FROM public.campaign_players p
    WHERE p.user_id = v_user AND p.active LIMIT 1;

    IF v_author_name IS NULL THEN RAISE EXCEPTION 'Jogador não autorizado ou inativo.'; END IF;

    -- Get the player's house for this reply context if applicable
    SELECT m.house_id INTO v_house
    FROM public.house_memberships m
    WHERE m.player_id = v_author_player AND m.house_id = v_letter.recipient_house_id LIMIT 1;

    -- Check completion status
    IF v_open_week IS NOT NULL THEN
      SELECT status INTO v_completed FROM public.player_weekly_completion WHERE player_id = v_author_player AND week = v_open_week;
      IF v_completed = 'completed' THEN RAISE EXCEPTION 'Retome sua participação na semana antes de enviar missivas.'; END IF;
    END IF;
  END IF;

  -- Calculate delivery week rule
  IF v_admin THEN
    v_delivery := COALESCE(v_open_week, v_letter.delivery_week, v_letter.letter_number) + 1;
  ELSIF v_letter.sender_name = 'Mestre' THEN
    v_delivery := COALESCE(v_open_week, v_letter.delivery_week, v_letter.letter_number);
  ELSE
    v_delivery := COALESCE(v_open_week, v_letter.delivery_week, v_letter.letter_number) + 1;
  END IF;

  -- Determine state
  IF p_draft THEN
    v_state := 'draft';
  ELSIF v_delivery = v_open_week THEN
    v_state := 'delivered';
    v_delivered_at := now();
  ELSE
    v_state := 'scheduled';
  END IF;

  INSERT INTO public.letter_replies(
    id, letter_id, author_user_id, author_player_id, house_id, author_name, content,
    publication_state, delivery_week, delivered_at
  ) VALUES (
    COALESCE(p_reply, p_key), p_letter, v_user, v_author_player, v_house, v_author_name, p_content,
    v_state, v_delivery, v_delivered_at
  )
  ON CONFLICT (id) DO UPDATE SET
    content = EXCLUDED.content,
    publication_state = EXCLUDED.publication_state,
    delivery_week = EXCLUDED.delivery_week,
    delivered_at = EXCLUDED.delivered_at,
    sync_state = 'pending',
    updated_at = now()
  WHERE letter_replies.author_user_id = v_user;

  UPDATE public.campaign_letters SET sync_state = 'pending', updated_at = now() WHERE id = p_letter;

  RETURN jsonb_build_object('success', true, 'state', v_state, 'delivery', v_delivery);
END $$;
REVOKE ALL ON FUNCTION public.reply_weekly_message(uuid, uuid, text, uuid, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reply_weekly_message(uuid, uuid, text, uuid, boolean) TO authenticated;

-- save_weekly_reply_draft
CREATE OR REPLACE FUNCTION public.save_weekly_reply_draft(p_id uuid, p_letter uuid, p_reply uuid, p_content text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  RETURN public.reply_weekly_message(p_letter, p_reply, p_content, p_id, true);
END $$;
REVOKE ALL ON FUNCTION public.save_weekly_reply_draft(uuid, uuid, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_weekly_reply_draft(uuid, uuid, uuid, text) TO authenticated;

-- schedule_weekly_reply_draft
CREATE OR REPLACE FUNCTION public.schedule_weekly_reply_draft(p_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_admin boolean;
  v_reply record;
  v_letter record;
  v_open_week integer;
  v_delivery integer;
  v_state text;
  v_delivered_at timestamptz;
  v_completed text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sessão expirada.'; END IF;
  SELECT is_campaign_admin() INTO v_admin;

  SELECT * INTO v_reply FROM public.letter_replies WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Resposta não encontrada.'; END IF;
  IF v_reply.author_user_id <> v_user AND NOT v_admin THEN RAISE EXCEPTION 'Não autorizado.'; END IF;

  SELECT * INTO v_letter FROM public.campaign_letters WHERE id = v_reply.letter_id;

  IF NOT v_admin THEN
    IF NOT (
      v_user = v_letter.sender_user_id
      OR v_user = (SELECT user_id FROM public.campaign_players WHERE id = v_letter.recipient_player_id)
      OR EXISTS (
        SELECT 1 FROM public.house_memberships m
        JOIN public.campaign_players p ON p.id = m.player_id
        WHERE p.user_id = v_user AND m.house_id = v_letter.recipient_house_id
      )
    ) THEN
      RAISE EXCEPTION 'Jogador não autorizado.';
    END IF;
  END IF;

  SELECT number INTO v_open_week FROM public.letter_rounds WHERE status = 'open' ORDER BY number DESC LIMIT 1;
  IF v_open_week IS NULL THEN RAISE EXCEPTION 'Não há semana aberta para programar envios.'; END IF;

  IF NOT v_admin THEN
    SELECT status INTO v_completed FROM public.player_weekly_completion WHERE player_id = v_reply.author_player_id AND week = v_open_week;
    IF v_completed = 'completed' THEN RAISE EXCEPTION 'Retome sua participação na semana antes de enviar missivas.'; END IF;
  END IF;

  -- Same calculation as in reply_weekly_message
  IF v_admin THEN
    v_delivery := v_open_week + 1;
  ELSIF v_letter.sender_name = 'Mestre' THEN
    v_delivery := v_open_week;
  ELSE
    v_delivery := v_open_week + 1;
  END IF;

  IF v_delivery = v_open_week THEN
    v_state := 'delivered';
    v_delivered_at := now();
  ELSE
    v_state := 'scheduled';
  END IF;

  UPDATE public.letter_replies SET
    publication_state = v_state,
    delivery_week = v_delivery,
    delivered_at = v_delivered_at,
    sync_state = 'pending',
    updated_at = now()
  WHERE id = p_id;

  UPDATE public.campaign_letters SET sync_state = 'pending', updated_at = now() WHERE id = v_reply.letter_id;

  RETURN jsonb_build_object('success', true, 'state', v_state, 'delivery', v_delivery);
END $$;
REVOKE ALL ON FUNCTION public.schedule_weekly_reply_draft(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_weekly_reply_draft(uuid) TO authenticated;

-- send_campaign_letter_batch
CREATE OR REPLACE FUNCTION public.send_campaign_letter_batch(p_kind text, p_number integer, p_subject text, p_content text, p_recipients text[], p_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_open_week integer;
  v_state text;
  v_delivered_at timestamptz;
  v_recipient text;
  v_house uuid;
  v_player uuid;
BEGIN
  IF NOT is_campaign_admin() THEN RAISE EXCEPTION 'Somente o narrador pode enviar missivas em lote.'; END IF;

  SELECT number INTO v_open_week FROM public.letter_rounds WHERE status = 'open' ORDER BY number DESC LIMIT 1;

  IF p_number = v_open_week THEN
    v_state := 'delivered';
    v_delivered_at := now();
  ELSE
    v_state := 'scheduled';
  END IF;

  FOREACH v_recipient IN ARRAY p_recipients LOOP
    v_house := NULL;
    v_player := NULL;
    IF v_recipient LIKE 'h:%' THEN
      v_house := substr(v_recipient, 3)::uuid;
    ELSIF v_recipient LIKE 'p:%' THEN
      v_player := substr(v_recipient, 3)::uuid;
    END IF;

    INSERT INTO public.campaign_letters(
      id, sender_user_id, sender_name, letter_kind, letter_number, subject, content,
      recipient_house_id, recipient_player_id, publication_state, delivery_week, delivered_at
    ) VALUES (
      gen_random_uuid(), auth.uid(), 'Mestre', p_kind, p_number, p_subject, p_content,
      v_house, v_player, v_state, p_number, v_delivered_at
    );
  END LOOP;

  RETURN jsonb_build_object('success', true);
END $$;
REVOKE ALL ON FUNCTION public.send_campaign_letter_batch(text, integer, text, text, text[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.send_campaign_letter_batch(text, integer, text, text, text[], uuid) TO authenticated;

-- save_letter_batch_drafts
CREATE OR REPLACE FUNCTION public.save_letter_batch_drafts(p_kind text, p_number integer, p_subject text, p_content text, p_recipients text[], p_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_recipient text;
  v_house uuid;
  v_player uuid;
BEGIN
  IF NOT is_campaign_admin() THEN RAISE EXCEPTION 'Somente o narrador pode enviar missivas em lote.'; END IF;

  FOREACH v_recipient IN ARRAY p_recipients LOOP
    v_house := NULL;
    v_player := NULL;
    IF v_recipient LIKE 'h:%' THEN
      v_house := substr(v_recipient, 3)::uuid;
    ELSIF v_recipient LIKE 'p:%' THEN
      v_player := substr(v_recipient, 3)::uuid;
    END IF;

    INSERT INTO public.campaign_letters(
      id, sender_user_id, sender_name, letter_kind, letter_number, subject, content,
      recipient_house_id, recipient_player_id, publication_state, delivery_week
    ) VALUES (
      gen_random_uuid(), auth.uid(), 'Mestre', p_kind, p_number, p_subject, p_content,
      v_house, v_player, 'draft', p_number
    );
  END LOOP;

  RETURN jsonb_build_object('success', true);
END $$;
REVOKE ALL ON FUNCTION public.save_letter_batch_drafts(text, integer, text, text, text[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_letter_batch_drafts(text, integer, text, text, text[], uuid) TO authenticated;

-- player_send_letter_to
CREATE OR REPLACE FUNCTION public.player_send_letter_to(p_subject text, p_content text, p_house text, p_key uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_open_week integer;
  v_author_player uuid;
  v_author_name text;
  v_house_uuid uuid;
  v_completed text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sessão expirada.'; END IF;

  SELECT number INTO v_open_week FROM public.letter_rounds WHERE status = 'open' ORDER BY number DESC LIMIT 1;
  IF v_open_week IS NULL THEN RAISE EXCEPTION 'Não há semana aberta para enviar missivas.'; END IF;

  SELECT p.id, p.name INTO v_author_player, v_author_name
  FROM public.campaign_players p
  WHERE p.user_id = v_user AND p.active LIMIT 1;
  IF v_author_player IS NULL THEN RAISE EXCEPTION 'Jogador não autorizado.'; END IF;

  SELECT status INTO v_completed FROM public.player_weekly_completion WHERE player_id = v_author_player AND week = v_open_week;
  IF v_completed = 'completed' THEN RAISE EXCEPTION 'Retome sua participação na semana antes de enviar missivas.'; END IF;

  IF p_house IS NOT NULL THEN
    v_house_uuid := p_house::uuid;
  END IF;

  INSERT INTO public.campaign_letters(
    id, sender_user_id, sender_player_id, sender_name, letter_kind, letter_number, subject, content,
    recipient_house_id, publication_state, delivery_week, delivered_at
  ) VALUES (
    p_key, v_user, v_author_player, v_author_name, 'reservada', NULL, p_subject, p_content,
    v_house_uuid, 'delivered', v_open_week, now()
  );

  RETURN jsonb_build_object('success', true);
END $$;
REVOKE ALL ON FUNCTION public.player_send_letter_to(text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.player_send_letter_to(text, text, text, uuid) TO authenticated;

-- save_letter_draft
CREATE OR REPLACE FUNCTION public.save_letter_draft(p_id uuid, p_house text, p_subject text, p_content text, p_week integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE
  v_user uuid := auth.uid();
  v_open_week integer;
  v_author_player uuid;
  v_author_name text;
  v_house_uuid uuid;
  v_completed text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'Sessão expirada.'; END IF;

  SELECT number INTO v_open_week FROM public.letter_rounds WHERE status = 'open' ORDER BY number DESC LIMIT 1;

  SELECT p.id, p.name INTO v_author_player, v_author_name
  FROM public.campaign_players p
  WHERE p.user_id = v_user AND p.active LIMIT 1;
  IF v_author_player IS NULL THEN RAISE EXCEPTION 'Jogador não autorizado.'; END IF;

  IF v_open_week IS NOT NULL THEN
    SELECT status INTO v_completed FROM public.player_weekly_completion WHERE player_id = v_author_player AND week = v_open_week;
    IF v_completed = 'completed' THEN RAISE EXCEPTION 'Retome sua participação na semana antes de enviar missivas.'; END IF;
  END IF;

  IF p_house IS NOT NULL THEN
    v_house_uuid := p_house::uuid;
  END IF;

  INSERT INTO public.campaign_letters(
    id, sender_user_id, sender_player_id, sender_name, letter_kind, letter_number, subject, content,
    recipient_house_id, publication_state, delivery_week
  ) VALUES (
    p_id, v_user, v_author_player, v_author_name, 'reservada', NULL, p_subject, p_content,
    v_house_uuid, 'draft', COALESCE(v_open_week, p_week)
  )
  ON CONFLICT (id) DO UPDATE SET
    subject = EXCLUDED.subject,
    content = EXCLUDED.content,
    recipient_house_id = EXCLUDED.recipient_house_id,
    delivery_week = EXCLUDED.delivery_week,
    updated_at = now()
  WHERE campaign_letters.sender_user_id = v_user AND campaign_letters.publication_state = 'draft';

  RETURN jsonb_build_object('success', true);
END $$;
REVOKE ALL ON FUNCTION public.save_letter_draft(uuid, text, text, text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_letter_draft(uuid, text, text, text, integer) TO authenticated;
