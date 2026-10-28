-- Stages 1/2: preserve historical rows; centralize audience and draft publication.
CREATE FUNCTION public.can_read_letter_as(l public.campaign_letters, viewer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=viewer AND role='admin')
 OR (l.deleted_at IS NULL AND EXISTS(
 SELECT 1 FROM campaign_players p WHERE p.user_id=viewer AND p.active AND NOT p.require_password_change
 AND (l.sender_user_id=viewer OR (l.publication_state='delivered' AND
 (l.recipient_player_id=p.id OR (l.recipient_player_id IS NULL AND EXISTS(
 SELECT 1 FROM house_memberships m WHERE m.player_id=p.id AND m.house_id=l.recipient_house_id)))))));
$$;
CREATE FUNCTION public.can_read_reply_as(r public.letter_replies, viewer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT EXISTS(SELECT 1 FROM user_roles WHERE user_id=viewer AND role='admin')
 OR (EXISTS(SELECT 1 FROM campaign_letters l WHERE l.id=r.letter_id AND public.can_read_letter_as(l,viewer))
 AND EXISTS(SELECT 1 FROM campaign_players p WHERE p.user_id=viewer AND p.active AND NOT p.require_password_change
 AND (r.author_user_id=viewer OR (r.publication_state='delivered' AND (r.recipient_user_id=viewer
 OR (r.house_id IS NOT NULL AND EXISTS(SELECT 1 FROM house_memberships m WHERE m.player_id=p.id AND m.house_id=r.house_id)))))));
$$;
REVOKE ALL ON FUNCTION public.can_read_letter_as(public.campaign_letters,uuid),public.can_read_reply_as(public.letter_replies,uuid) FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.can_read_letter(l public.campaign_letters) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.can_read_letter_as(l,auth.uid()) $$;
CREATE OR REPLACE FUNCTION public.can_read_reply(r public.letter_replies) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$ SELECT public.can_read_reply_as(r,auth.uid()) $$;
CREATE FUNCTION public.can_export_mail(p_type text,p_id uuid,p_viewer uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
 SELECT CASE WHEN p_type='letter' THEN EXISTS(SELECT 1 FROM campaign_letters l WHERE l.id=p_id AND l.deleted_at IS NULL AND l.publication_state='delivered' AND public.can_read_letter_as(l,p_viewer))
 WHEN p_type='reply' THEN EXISTS(SELECT 1 FROM letter_replies r JOIN campaign_letters l ON l.id=r.letter_id WHERE r.id=p_id AND l.deleted_at IS NULL AND l.publication_state='delivered' AND r.publication_state='delivered' AND public.can_read_reply_as(r,p_viewer))
 ELSE false END;
$$;
REVOKE ALL ON FUNCTION public.can_export_mail(text,uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.can_export_mail(text,uuid,uuid) TO service_role;

CREATE FUNCTION public.mark_letter_read(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM campaign_letters l WHERE l.id=p_id AND l.deleted_at IS NULL AND l.publication_state='delivered' AND public.can_read_letter(l)) THEN RAISE EXCEPTION 'Missiva indisponível'; END IF;
 INSERT INTO letter_receipts(letter_id,user_id,read_at) VALUES(p_id,auth.uid(),clock_timestamp())
 ON CONFLICT(letter_id,user_id) DO UPDATE SET read_at=excluded.read_at;
END $$;
REVOKE ALL ON FUNCTION public.mark_letter_read(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.mark_letter_read(uuid) TO authenticated;

CREATE FUNCTION public.reply_delivery_week(p_recipient uuid) RETURNS integer LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public AS $$
DECLARE n integer; target integer;
BEGIN
 IF NOT public.campaign_access_active() THEN RAISE EXCEPTION 'Jogador não autorizado'; END IF;
 n:=public.open_letter_round();
 IF n IS NULL THEN
   IF NOT public.is_campaign_admin() THEN RETURN NULL; END IF;
   RETURN (SELECT coalesce(max(number),0)+1 FROM letter_rounds);
 END IF;
 target:=CASE WHEN public.is_campaign_admin() OR NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=p_recipient AND role='admin') THEN n+1 ELSE n END;
 IF EXISTS(SELECT 1 FROM letter_rounds WHERE number=target AND status='closed') THEN RETURN NULL; END IF;
 RETURN target;
END $$;
REVOKE ALL ON FUNCTION public.reply_delivery_week(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reply_delivery_week(uuid) TO authenticated;

CREATE FUNCTION public.version_letter_draft() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF OLD.publication_state='draft' AND NEW.version=OLD.version THEN
 NEW.version:=OLD.version+1; NEW.updated_at:=now(); NEW.sync_state:='pending';
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER version_letter_draft BEFORE UPDATE OF subject,content ON public.campaign_letters
FOR EACH ROW EXECUTE FUNCTION public.version_letter_draft();

CREATE FUNCTION public.edit_letter_draft(p_id uuid,p_version integer,p_subject text,p_content text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l campaign_letters;
BEGIN
 SELECT * INTO l FROM campaign_letters WHERE id=p_id FOR UPDATE;
 IF NOT FOUND OR NOT public.campaign_access_active() OR l.sender_user_id<>auth.uid() OR l.publication_state<>'draft' OR l.deleted_at IS NOT NULL THEN RAISE EXCEPTION 'Rascunho indisponível'; END IF;
 IF l.version<>p_version THEN RAISE EXCEPTION 'Conflito de versão: atualize antes de salvar; seu texto foi preservado'; END IF;
 IF btrim(coalesce(p_subject,''))='' OR btrim(coalesce(p_content,''))='' THEN RAISE EXCEPTION 'Preencha assunto e conteúdo'; END IF;
 UPDATE campaign_letters SET subject=p_subject,content=p_content WHERE id=p_id RETURNING * INTO l;
 RETURN to_jsonb(l);
END $$;
REVOKE ALL ON FUNCTION public.edit_letter_draft(uuid,integer,text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.edit_letter_draft(uuid,integer,text,text) TO authenticated;

CREATE OR REPLACE FUNCTION public.reply_weekly_message(p_letter uuid,p_reply uuid,p_content text,p_key uuid,p_draft boolean DEFAULT false) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE l public.campaign_letters; prior public.letter_replies; rid uuid; n integer; delivery integer; recipient uuid; pname text; gm boolean:=public.is_campaign_admin(); BEGIN PERFORM pg_advisory_xact_lock(184522); SELECT * INTO l FROM public.campaign_letters WHERE id=p_letter FOR UPDATE; IF NOT FOUND OR l.deleted_at IS NOT NULL OR l.publication_state<>'delivered' OR NOT public.can_read_letter(l) THEN RAISE EXCEPTION 'Missiva indisponível'; END IF; n:=public.open_letter_round(); IF NOT gm AND public.my_player_id() IS NULL THEN RAISE EXCEPTION 'Jogador não autorizado'; END IF; IF NOT gm AND n IS NULL AND NOT p_draft THEN RAISE EXCEPTION 'Missivas fechadas, aguarde o narrador abrir a próxima semana'; END IF; IF p_reply IS NOT NULL THEN SELECT * INTO prior FROM public.letter_replies WHERE id=p_reply AND letter_id=p_letter; IF NOT FOUND OR prior.publication_state<>'delivered' OR NOT public.can_read_reply(prior) THEN RAISE EXCEPTION 'Resposta indisponível'; END IF; recipient:=prior.author_user_id; ELSE recipient:=l.sender_user_id; END IF; IF NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=recipient AND role='admin') AND NOT EXISTS(SELECT 1 FROM campaign_players p WHERE p.user_id=recipient AND p.active AND NOT p.require_password_change AND public.can_read_letter_as(l,p.user_id)) THEN RAISE EXCEPTION 'Destinatário indisponível'; END IF; IF recipient=auth.uid() THEN RAISE EXCEPTION 'Selecione a mensagem recebida à qual deseja responder'; END IF; IF btrim(p_content)='' THEN RAISE EXCEPTION 'Escreva a resposta'; END IF; SELECT id INTO rid FROM public.letter_replies WHERE author_user_id=auth.uid() AND idempotency_key=p_key; IF FOUND THEN IF NOT EXISTS(SELECT 1 FROM letter_replies WHERE id=rid AND letter_id=p_letter AND reply_to_id=coalesce(p_reply,p_letter) AND content=p_content) THEN RAISE EXCEPTION 'Chave de envio já utilizada para outra resposta'; END IF; RETURN rid; END IF; delivery:=public.reply_delivery_week(recipient); IF delivery IS NULL AND NOT p_draft THEN RAISE EXCEPTION 'Semana de entrega indisponível'; END IF; n:=coalesce(n,delivery); IF gm THEN pname:='Mestre'; ELSE SELECT name INTO pname FROM public.campaign_players WHERE id=public.my_player_id(); END IF; INSERT INTO public.letter_replies(letter_id,author_user_id,author_player_id,author_name,house_id,recipient_user_id,content,idempotency_key,conversation_id,reply_to_id,creation_week,delivery_week,publication_state) VALUES(l.id,auth.uid(),public.my_player_id(),coalesce(pname,'Jogador'),l.recipient_house_id,recipient,p_content,p_key,l.conversation_id,coalesce(p_reply,l.id),n,delivery,CASE WHEN p_draft THEN 'draft' ELSE 'scheduled' END) RETURNING id INTO rid; IF NOT gm AND NOT p_draft THEN INSERT INTO public.letter_receipts(letter_id,user_id) VALUES(l.id,auth.uid()) ON CONFLICT DO NOTHING; END IF; RETURN rid; END $$;
CREATE OR REPLACE FUNCTION public.save_weekly_reply_draft(p_id uuid,p_letter uuid,p_reply uuid,p_content text) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r letter_replies; l campaign_letters;
BEGIN
 IF NOT public.campaign_access_active() THEN RAISE EXCEPTION 'Jogador não autorizado'; END IF;
 SELECT * INTO l FROM campaign_letters WHERE id=p_letter;
 IF NOT FOUND OR l.deleted_at IS NOT NULL OR NOT public.can_read_letter(l) THEN RAISE EXCEPTION 'Missiva indisponível'; END IF;
 SELECT * INTO r FROM letter_replies WHERE id=p_id OR (author_user_id=auth.uid() AND idempotency_key=p_id) FOR UPDATE;
 IF FOUND THEN
 IF r.author_user_id<>auth.uid() OR r.publication_state<>'draft' OR r.letter_id<>p_letter OR r.reply_to_id IS DISTINCT FROM coalesce(p_reply,p_letter) THEN RAISE EXCEPTION 'Rascunho indisponível'; END IF;
 UPDATE letter_replies SET content=p_content WHERE id=r.id; RETURN r.id;
 END IF;
 RETURN public.reply_weekly_message(p_letter,p_reply,p_content,p_id,true);
END $$;

CREATE OR REPLACE FUNCTION public.schedule_weekly_reply_draft(p_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r letter_replies; l campaign_letters; prior letter_replies; n integer; target integer;
BEGIN
 PERFORM pg_advisory_xact_lock(184522);
 IF NOT public.campaign_access_active() THEN RAISE EXCEPTION 'Jogador não autorizado'; END IF;
 SELECT * INTO r FROM letter_replies WHERE id=p_id AND author_user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Rascunho indisponível'; END IF;
 IF r.publication_state<>'draft' THEN RETURN; END IF;
 SELECT * INTO l FROM campaign_letters WHERE id=r.letter_id FOR UPDATE;
 IF NOT FOUND OR l.deleted_at IS NOT NULL OR l.publication_state<>'delivered' OR NOT public.can_read_letter(l) THEN RAISE EXCEPTION 'Missiva indisponível'; END IF;
 IF r.reply_to_id<>l.id THEN
 SELECT * INTO prior FROM letter_replies WHERE id=r.reply_to_id AND letter_id=l.id;
 IF NOT FOUND OR prior.publication_state<>'delivered' OR NOT public.can_read_reply(prior) OR prior.author_user_id<>r.recipient_user_id THEN RAISE EXCEPTION 'Resposta indisponível'; END IF;
 ELSIF r.recipient_user_id<>l.sender_user_id THEN RAISE EXCEPTION 'Destinatário inválido'; END IF;
 IF NOT EXISTS(SELECT 1 FROM user_roles WHERE user_id=r.recipient_user_id AND role='admin') AND NOT EXISTS(SELECT 1 FROM campaign_players p WHERE p.user_id=r.recipient_user_id AND p.active AND NOT p.require_password_change AND public.can_read_letter_as(l,p.user_id)) THEN RAISE EXCEPTION 'Destinatário indisponível'; END IF;
 target:=public.reply_delivery_week(r.recipient_user_id);
 IF target IS NULL THEN RAISE EXCEPTION 'Missivas fechadas, aguarde o narrador abrir a próxima semana'; END IF;
 n:=coalesce(public.open_letter_round(),target);
 IF btrim(coalesce(r.content,''))='' THEN RAISE EXCEPTION 'Escreva a resposta'; END IF;
 UPDATE letter_replies SET creation_week=n,delivery_week=target,publication_state=CASE WHEN target=public.open_letter_round() THEN 'delivered' ELSE 'scheduled' END,delivered_at=CASE WHEN target=public.open_letter_round() THEN now() END WHERE id=r.id;
 INSERT INTO sync_outbox(entity_type,entity_id,version,payload) SELECT 'reply',id,1,to_jsonb(t) FROM letter_replies t WHERE id=r.id ON CONFLICT DO NOTHING;
 UPDATE sync_outbox SET state='pending',next_attempt_at=now() WHERE entity_id=r.id;
END $$;

CREATE OR REPLACE FUNCTION public.schedule_letter_draft(p_id uuid,p_week integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE l campaign_letters; n integer; target integer;
BEGIN
 PERFORM pg_advisory_xact_lock(184522);
 IF NOT public.campaign_access_active() THEN RAISE EXCEPTION 'Jogador não autorizado'; END IF;
 SELECT * INTO l FROM campaign_letters WHERE id=p_id AND sender_user_id=auth.uid() AND deleted_at IS NULL FOR UPDATE;
 IF NOT FOUND OR l.publication_state<>'draft' THEN RAISE EXCEPTION 'Rascunho indisponível'; END IF;
 n:=public.open_letter_round();
 IF NOT public.is_campaign_admin() THEN
 IF n IS NULL THEN RAISE EXCEPTION 'Missivas fechadas, aguarde o narrador abrir a próxima semana'; END IF;
 IF NOT EXISTS(SELECT 1 FROM house_memberships WHERE player_id=public.my_player_id()) THEN RAISE EXCEPTION 'Nenhuma casa autorizada'; END IF;
 IF l.recipient_player_id IS NOT NULL OR public.in_campaign_house(l.recipient_house_id) THEN RAISE EXCEPTION 'Destinatário inválido'; END IF;
 END IF;
 IF l.recipient_house_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM campaign_houses WHERE id=l.recipient_house_id AND active AND season=2) THEN RAISE EXCEPTION 'Casa destinatária inválida'; END IF;
 IF l.recipient_player_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM campaign_players WHERE id=l.recipient_player_id AND active AND NOT require_password_change AND user_id IS NOT NULL) THEN RAISE EXCEPTION 'Jogador destinatário inválido'; END IF;
 target:=CASE WHEN public.is_campaign_admin() THEN p_week ELSE n END;
 IF target IS NULL OR target<1 OR EXISTS(SELECT 1 FROM letter_rounds WHERE number=target AND status='closed') THEN RAISE EXCEPTION 'Semana de entrega inválida'; END IF;
 IF btrim(coalesce(l.subject,''))='' OR btrim(coalesce(l.content,''))='' THEN RAISE EXCEPTION 'Preencha o rascunho antes de enviar'; END IF;
 UPDATE campaign_letters SET delivery_week=target,letter_number=target,creation_week=coalesce(n,target),publication_state=CASE WHEN target=n THEN 'delivered' ELSE 'scheduled' END,delivered_at=CASE WHEN target=n THEN now() END WHERE id=p_id;
 INSERT INTO sync_outbox(entity_type,entity_id,version,payload) SELECT 'letter',id,version,to_jsonb(t) FROM campaign_letters t WHERE id=p_id ON CONFLICT DO NOTHING;
 UPDATE sync_outbox SET state='pending',next_attempt_at=now() WHERE entity_id=p_id;
END $$;

CREATE OR REPLACE FUNCTION public.player_send_letter_to(p_subject text,p_content text,p_house text,p_key uuid) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE pid uuid; hid text; pname text; lid uuid; n integer; BEGIN PERFORM pg_advisory_xact_lock(184522); pid:=public.my_player_id(); IF pid IS NULL THEN RAISE EXCEPTION 'Sua conta ainda não está vinculada a um jogador autorizado'; END IF; SELECT m.house_id INTO hid FROM public.house_memberships m WHERE m.player_id=pid LIMIT 1; IF hid IS NULL THEN RAISE EXCEPTION 'Nenhuma casa autorizada para esta conta'; END IF; n:=public.open_letter_round(); IF n IS NULL THEN RAISE EXCEPTION 'Missivas fechadas, aguarde o narrador abrir a próxima semana'; END IF; IF btrim(p_subject)='' OR btrim(p_content)='' THEN RAISE EXCEPTION 'Preencha assunto e conteúdo'; END IF; IF p_house IS NOT NULL AND (p_house=hid OR NOT EXISTS(SELECT 1 FROM public.campaign_houses WHERE id=p_house AND active AND season=2)) THEN RAISE EXCEPTION 'Casa destinatária inválida'; END IF; SELECT id INTO lid FROM public.campaign_letters WHERE id=p_key AND sender_user_id=auth.uid(); IF FOUND THEN RETURN lid; END IF; SELECT name INTO pname FROM public.campaign_players WHERE id=pid; INSERT INTO public.campaign_letters(id,sender_user_id,sender_player_id,sender_name,recipient_player_id,recipient_house_id,subject,content,letter_kind,letter_number) VALUES(p_key,auth.uid(),pid,coalesce(pname,'Jogador'),NULL,p_house,p_subject,p_content,'reservada',n) RETURNING id INTO lid; RETURN lid; END $$;

CREATE OR REPLACE FUNCTION public.save_letter_draft(p_id uuid,p_house text,p_subject text,p_content text,p_week integer) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$ DECLARE pid uuid:=public.my_player_id(); pname text; BEGIN IF NOT public.is_campaign_admin() AND (pid IS NULL OR NOT EXISTS(SELECT 1 FROM public.house_memberships WHERE player_id=pid)) THEN RAISE EXCEPTION 'Jogador não autorizado'; END IF; IF EXISTS(SELECT 1 FROM campaign_letters WHERE id=p_id AND deleted_at IS NOT NULL) THEN RAISE EXCEPTION 'Rascunho indisponível'; END IF; IF p_house IS NOT NULL AND (NOT EXISTS(SELECT 1 FROM campaign_houses WHERE id=p_house AND active AND season=2) OR (NOT public.is_campaign_admin() AND public.in_campaign_house(p_house))) THEN RAISE EXCEPTION 'Casa destinatária inválida'; END IF; IF public.is_campaign_admin() THEN pname:='Mestre'; ELSE SELECT name INTO pname FROM public.campaign_players WHERE id=pid; END IF; INSERT INTO public.campaign_letters(id,sender_user_id,sender_player_id,sender_name,recipient_house_id,subject,content,letter_kind,letter_number,publication_state) VALUES(p_id,auth.uid(),pid,pname,p_house,p_subject,p_content,'reservada',p_week,'draft') ON CONFLICT(id) DO UPDATE SET subject=excluded.subject,content=excluded.content,recipient_house_id=excluded.recipient_house_id,delivery_week=excluded.letter_number,letter_number=excluded.letter_number WHERE campaign_letters.sender_user_id=auth.uid() AND campaign_letters.publication_state='draft'; IF NOT FOUND THEN RAISE EXCEPTION 'Rascunho indisponível'; END IF; RETURN p_id; END $$;

create or replace function public.send_campaign_letter_batch(p_kind text, p_number integer, p_subject text, p_content text, p_recipients text[], p_key uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  r text;
  n integer;
  sent integer := 0;
  pid uuid;
  hid text;
begin
  perform pg_advisory_xact_lock(184522);
  if not public.is_campaign_admin() then
    raise exception 'Somente o administrador pode enviar novas missivas';
  end if;
  if p_kind not in ('geral','reservada') then
    raise exception 'Tipo de missiva invalido';
  end if;
  if p_kind = 'reservada' and coalesce(array_length(p_recipients,1),0) <> 1 then
    raise exception 'Missiva reservada tem exatamente um destinatario';
  end if;
  if coalesce(array_length(p_recipients,1),0) = 0 then
    raise exception 'Escolha ao menos um destinatario';
  end if;
  if btrim(p_subject) = '' or btrim(p_content) = '' then
    raise exception 'Preencha assunto e conteudo';
  end if;
  n := coalesce(p_number, (select coalesce(max(number),0)+1 from public.letter_rounds));
  foreach r in array p_recipients loop
    pid := null; hid := null;
    if left(r,2) = 'p:' then
      pid := substring(r from 3)::uuid;
    elsif left(r,2) = 'h:' then
      hid := substring(r from 3);
    else
      raise exception 'Destinatario invalido: %', r;
    end if;
    insert into public.campaign_letters(id,sender_user_id,sender_name,recipient_player_id,recipient_house_id,subject,content,letter_number,letter_kind,batch_key)
    values (gen_random_uuid(), auth.uid(), 'Mestre', pid, hid, p_subject, p_content, n, p_kind, p_key)
    on conflict (batch_key, coalesce(recipient_player_id::text,''), coalesce(recipient_house_id,'')) where batch_key is not null do nothing;
    if found then sent := sent + 1; end if;
  end loop;
  return sent;
end
$$;

