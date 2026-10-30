-- Lote 7 (31–32): stronger audience isolation + safe legacy forwarding.
BEGIN;
SET LOCAL lock_timeout='5s';
-- A parent letter must exist, be delivered and not deleted EVEN for administrators.
CREATE OR REPLACE FUNCTION public.can_read_reply_as(r public.letter_replies, viewer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT r.deleted_at IS NULL AND EXISTS (
  SELECT 1 FROM public.campaign_letters l WHERE l.id=r.letter_id
    AND l.deleted_at IS NULL AND public.can_read_letter_as(l,viewer)
    AND (CASE WHEN r.publication_state='draft' THEN r.author_user_id=viewer
      ELSE EXISTS(SELECT 1 FROM public.user_roles u WHERE u.user_id=viewer AND u.role='admin')
       OR EXISTS(SELECT 1 FROM public.campaign_players p WHERE p.user_id=viewer
        AND p.active AND NOT p.require_password_change AND
        (r.author_user_id=viewer OR (r.publication_state='delivered' AND (
           r.recipient_user_id=viewer OR (l.recipient_player_id IS NULL
            AND r.house_id IS NOT NULL AND r.house_id=l.recipient_house_id
            AND EXISTS(SELECT 1 FROM public.house_memberships hm
             WHERE hm.player_id=p.id AND hm.house_id=l.recipient_house_id))
        ))))
    END)
 );
$$;
-- Apply the same limits to deleted reply tombstones; no house audience for individual mail.
CREATE OR REPLACE FUNCTION public.can_export_mail(p_type text,p_id uuid,p_viewer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN p_type='letter' THEN EXISTS(
  SELECT 1 FROM public.campaign_letters l WHERE l.id=p_id AND l.deleted_at IS NULL
  AND l.publication_state='delivered' AND public.can_read_letter_as(l,p_viewer))
 WHEN p_type='reply' THEN EXISTS(
  SELECT 1 FROM public.letter_replies r JOIN public.campaign_letters l ON l.id=r.letter_id
  WHERE r.id=p_id AND l.deleted_at IS NULL AND l.publication_state='delivered'
  AND r.publication_state='delivered' AND public.can_read_letter_as(l,p_viewer)
  AND (public.can_read_reply_as(r,p_viewer) OR (r.deleted_at IS NOT NULL
   AND (EXISTS(SELECT 1 FROM public.user_roles u WHERE u.user_id=p_viewer AND u.role='admin')
    OR r.author_user_id=p_viewer OR r.recipient_user_id=p_viewer
    OR (l.recipient_player_id IS NULL AND r.house_id=l.recipient_house_id AND EXISTS(
      SELECT 1 FROM public.campaign_players p JOIN public.house_memberships hm ON hm.player_id=p.id
      WHERE p.user_id=p_viewer AND p.active AND NOT p.require_password_change AND hm.house_id=l.recipient_house_id))))))
 ELSE false END;
$$;
-- When a reply is destined for the narrator, do not expose it via root-house membership.
CREATE OR REPLACE FUNCTION public.reply_weekly_message(p_letter uuid, p_reply uuid, p_content text, p_key uuid, p_draft boolean DEFAULT false)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$ DECLARE l public.campaign_letters; prior public.letter_replies; rid uuid; n integer; delivery integer; recipient uuid; pname text; gm boolean:=public.is_campaign_admin(); BEGIN PERFORM pg_advisory_xact_lock(184522); SELECT * INTO l FROM public.campaign_letters WHERE id=p_letter FOR UPDATE; IF NOT FOUND OR l.deleted_at IS NOT NULL OR l.publication_state<>'delivered' OR NOT public.can_read_letter(l) THEN RAISE EXCEPTION 'Missiva indisponível'; END IF; n:=public.open_letter_round(); IF NOT gm AND public.my_player_id() IS NULL THEN RAISE EXCEPTION 'Jogador não autorizado'; END IF; IF NOT gm AND n IS NULL AND NOT p_draft THEN RAISE EXCEPTION 'Missivas fechadas, aguarde o narrador abrir a próxima semana'; END IF; IF p_reply IS NOT NULL THEN SELECT * INTO prior FROM public.letter_replies WHERE id=p_reply AND letter_id=p_letter; IF NOT FOUND OR prior.publication_state<>'delivered' OR NOT public.can_read_reply(prior) THEN RAISE EXCEPTION 'Resposta indisponível'; END IF; recipient:=prior.author_user_id;
 ELSE
  IF gm AND l.sender_user_id=auth.uid() THEN
    IF l.recipient_player_id IS NOT NULL THEN
      SELECT p.user_id INTO recipient FROM public.campaign_players p
      WHERE p.id=l.recipient_player_id AND p.active AND NOT p.require_password_change AND p.user_id IS NOT NULL;
    ELSIF l.recipient_house_id IS NOT NULL THEN
      SELECT p.user_id INTO recipient FROM public.campaign_players p
        JOIN public.house_memberships hm ON hm.player_id=p.id
      WHERE hm.house_id=l.recipient_house_id AND p.active AND NOT p.require_password_change
        AND p.user_id IS NOT NULL AND p.user_id<>auth.uid()
      ORDER BY p.id LIMIT 1;
    END IF;
    IF recipient IS NULL THEN RAISE EXCEPTION 'A missiva não possui jogador destinatário ativo para receber complemento'; END IF;
  ELSE recipient:=l.sender_user_id; END IF;
 END IF; IF NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=recipient AND role='admin') AND NOT EXISTS(SELECT 1 FROM campaign_players p WHERE p.user_id=recipient AND p.active AND NOT p.require_password_change AND public.can_read_letter_as(l,p.user_id)) THEN RAISE EXCEPTION 'Destinatário indisponível'; END IF; IF recipient=auth.uid() THEN RAISE EXCEPTION 'Selecione a mensagem recebida à qual deseja responder'; END IF; IF btrim(p_content)='' THEN RAISE EXCEPTION 'Escreva a resposta'; END IF; SELECT id INTO rid FROM public.letter_replies WHERE author_user_id=auth.uid() AND idempotency_key=p_key; IF FOUND THEN IF NOT EXISTS(SELECT 1 FROM letter_replies WHERE id=rid AND letter_id=p_letter AND reply_to_id=coalesce(p_reply,p_letter) AND content=p_content) THEN RAISE EXCEPTION 'Chave de envio já utilizada para outra resposta'; END IF; RETURN rid; END IF; delivery:=public.reply_delivery_week(recipient); IF delivery IS NULL AND NOT p_draft THEN RAISE EXCEPTION 'Semana de entrega indisponível'; END IF; n:=coalesce(n,(SELECT max(number) FROM public.letter_rounds),delivery); IF gm THEN pname:='Mestre'; ELSE SELECT name INTO pname FROM public.campaign_players WHERE id=public.my_player_id(); END IF; INSERT INTO public.letter_replies(letter_id,author_user_id,author_player_id,author_name,house_id,recipient_user_id,content,idempotency_key,conversation_id,reply_to_id,creation_week,delivery_week,publication_state) VALUES(l.id,auth.uid(),public.my_player_id(),coalesce(pname,'Jogador'),CASE WHEN l.recipient_player_id IS NULL AND recipient<>l.sender_user_id
 AND EXISTS(SELECT 1 FROM public.campaign_players cp JOIN public.house_memberships hm ON hm.player_id=cp.id
    WHERE cp.user_id=recipient AND hm.house_id=l.recipient_house_id AND cp.active)
 THEN l.recipient_house_id ELSE NULL END,recipient,p_content,p_key,l.conversation_id,coalesce(p_reply,l.id),n,delivery,CASE WHEN p_draft THEN 'draft' ELSE 'scheduled' END) RETURNING id INTO rid; IF NOT gm AND NOT p_draft AND coalesce(current_setting('app.is_representation',true),'')<>'true' THEN INSERT INTO public.letter_receipts(letter_id,user_id) VALUES(l.id,auth.uid()) ON CONFLICT DO NOTHING; END IF; RETURN rid; END $function$
;
-- Legacy integrations still work, but are routed through the official batch RPC,
-- enforcing the same week, type, idempotency and recipient validation.
CREATE OR REPLACE FUNCTION public.send_campaign_letter(p_player uuid,p_house text,p_subject text,p_content text,p_key uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE target text; lid uuid; current_week integer;
BEGIN
 IF NOT public.is_campaign_admin() THEN RAISE EXCEPTION 'Somente o Narrador pode enviar missivas'; END IF;
 IF p_key IS NULL OR (p_player IS NULL AND p_house IS NULL) OR (p_player IS NOT NULL AND p_house IS NOT NULL)
 THEN RAISE EXCEPTION 'Informe exatamente um destinatário e chave de envio'; END IF;
 IF p_player IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM public.campaign_players p WHERE p.id=p_player
   AND p.active AND NOT p.require_password_change AND p.user_id IS NOT NULL)
  THEN RAISE EXCEPTION 'Jogador destinatário indisponível'; END IF;
  target:='p:'||p_player::text;
 ELSE
  IF NOT EXISTS(SELECT 1 FROM public.campaign_houses h WHERE h.id=p_house AND h.active AND h.season=2)
  THEN RAISE EXCEPTION 'Casa destinatária inválida'; END IF;
  target:='h:'||p_house;
 END IF;
 SELECT l.id INTO lid FROM public.campaign_letters l WHERE l.batch_key=p_key AND l.sender_user_id=auth.uid()
   AND (l.recipient_player_id IS NOT DISTINCT FROM p_player)
   AND (l.recipient_house_id IS NOT DISTINCT FROM p_house);
 IF lid IS NOT NULL THEN RETURN lid; END IF;
 SELECT number INTO current_week FROM public.letter_rounds WHERE status='open';
 PERFORM public.send_campaign_letter_batch('reservada',coalesce(current_week,
  (SELECT coalesce(max(number),0)+1 FROM public.letter_rounds)),p_subject,p_content,ARRAY[target],p_key);
 SELECT id INTO lid FROM public.campaign_letters WHERE batch_key=p_key AND sender_user_id=auth.uid()
   AND recipient_player_id IS NOT DISTINCT FROM p_player AND recipient_house_id IS NOT DISTINCT FROM p_house;
 IF lid IS NULL THEN RAISE EXCEPTION 'Envio legado não pôde ser confirmado'; END IF;
 RETURN lid;
END $$;
COMMIT;
