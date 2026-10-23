alter table public.campaign_letters
  add column letter_number integer,
  add column letter_kind text not null default 'reservada' check (letter_kind in ('geral','reservada')),
  add column batch_key uuid;

create unique index campaign_letters_batch_recipient
  on public.campaign_letters (batch_key, coalesce(recipient_player_id::text,''), coalesce(recipient_house_id,''))
  where batch_key is not null;

create index campaign_letters_number on public.campaign_letters (letter_number desc nulls last);

comment on column public.campaign_letters.letter_kind is 'geral = enviada a varios destinatarios escolhidos pelo narrador; reservada = um unico destinatario';
comment on column public.campaign_letters.batch_key is 'chave idempotente do envio em lote; um envio repetido nao duplica destinatarios';

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
  n := coalesce(p_number, (select coalesce(max(letter_number),0)+1 from public.campaign_letters));
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

create or replace function public.player_send_letter(p_subject text, p_content text, p_key uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  pid uuid;
  hid text;
  pname text;
  lid uuid;
begin
  pid := public.my_player_id();
  if pid is null then
    raise exception 'Sua conta ainda nao esta vinculada a um jogador autorizado';
  end if;
  select m.house_id into hid from public.house_memberships m where m.player_id = pid limit 1;
  if hid is null then
    raise exception 'Nenhuma casa autorizada para esta conta';
  end if;
  if btrim(p_subject) = '' or btrim(p_content) = '' then
    raise exception 'Preencha assunto e conteudo';
  end if;
  select id into lid from public.campaign_letters where id = p_key and sender_user_id = auth.uid();
  if found then return lid; end if;
  select name into pname from public.campaign_players where id = pid;
  insert into public.campaign_letters(id,sender_user_id,sender_player_id,sender_name,recipient_house_id,subject,content,letter_kind)
  values (p_key, auth.uid(), pid, coalesce(pname,'Jogador'), hid, p_subject, p_content, 'reservada')
  returning id into lid;
  return lid;
end
$$;

create or replace function public.reply_campaign_letter(p_letter uuid, p_content text, p_key uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  l public.campaign_letters;
  rid uuid;
  pname text;
begin
  select * into l from public.campaign_letters where id = p_letter for update;
  if not found or not (coalesce(public.letter_recipient(l),false) or public.is_campaign_admin()) then
    raise exception 'Voce nao e destinatario desta missiva';
  end if;
  if btrim(p_content) = '' then
    raise exception 'Escreva a resposta';
  end if;
  select id into rid from public.letter_replies where author_user_id = auth.uid() and idempotency_key = p_key;
  if found then return rid; end if;
  select name into pname from public.campaign_players where id = public.my_player_id();
  if public.is_campaign_admin() and pname is null then pname := 'Mestre'; end if;
  insert into public.letter_replies(letter_id,author_user_id,author_player_id,author_name,house_id,recipient_user_id,content,idempotency_key)
  values (l.id, auth.uid(), public.my_player_id(), coalesce(pname,'Jogador'), l.recipient_house_id, l.sender_user_id, p_content, p_key)
  returning id into rid;
  insert into public.letter_receipts(letter_id,user_id) values (l.id, auth.uid()) on conflict do nothing;
  return rid;
end
$$;