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
  if public.is_campaign_admin() then
    pname := 'Mestre';
  else
    select name into pname from public.campaign_players where id = public.my_player_id();
  end if;
  insert into public.letter_replies(letter_id,author_user_id,author_player_id,author_name,house_id,recipient_user_id,content,idempotency_key)
  values (l.id, auth.uid(), public.my_player_id(), coalesce(pname,'Jogador'), l.recipient_house_id, l.sender_user_id, p_content, p_key)
  returning id into rid;
  insert into public.letter_receipts(letter_id,user_id) values (l.id, auth.uid()) on conflict do nothing;
  return rid;
end
$$;