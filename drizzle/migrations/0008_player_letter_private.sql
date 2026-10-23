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
  insert into public.campaign_letters(id,sender_user_id,sender_player_id,sender_name,recipient_player_id,recipient_house_id,subject,content,letter_kind)
  values (p_key, auth.uid(), pid, coalesce(pname,'Jogador'), null, null, p_subject, p_content, 'reservada')
  returning id into lid;
  return lid;
end
$$;

comment on function public.player_send_letter is 'Missiva nova do jogador ao narrador: visivel apenas para o autor e o administrador (sem destinatario de casa).';