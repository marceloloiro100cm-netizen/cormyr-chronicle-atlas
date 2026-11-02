-- Disposable PostgreSQL only: verify current contract: houses OR player-to-Narrator; individual player recipient never allowed.
BEGIN;
DO $checks$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger
   WHERE tgrelid='public.campaign_letters'::regclass
     AND tgname='zz_house_only_mail_recipient' AND tgenabled='O') THEN
  RAISE EXCEPTION 'House-only recipient guard is missing or disabled';
 END IF;
 BEGIN
  INSERT INTO public.campaign_letters(sender_user_id,sender_name,recipient_player_id,subject,content,publication_state)
  VALUES(gen_random_uuid(),'Teste',gen_random_uuid(),'Direct player forbidden','Body','draft');
  RAISE EXCEPTION 'Player-addressed correspondence was accepted';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM NOT LIKE 'Destinatario individual desativado:%' THEN RAISE; END IF;
 END;
 BEGIN
  INSERT INTO public.campaign_letters(sender_user_id,sender_name,subject,content,publication_state)
  VALUES(gen_random_uuid(),'Teste','Unverified narrator sender forbidden','Body','draft');
  RAISE EXCEPTION 'Narrator-only correspondence was accepted';
 EXCEPTION WHEN check_violation THEN
  IF SQLERRM NOT LIKE 'Destinatario invalido: Narrador somente para missivas de jogadores%' THEN RAISE; END IF;
 END;
END $checks$;
ROLLBACK;
