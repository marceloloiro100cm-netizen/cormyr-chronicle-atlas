-- Only noble houses may receive newly created correspondence.
BEGIN;
CREATE OR REPLACE FUNCTION public.require_house_mail_recipient()
RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $body$
BEGIN
 IF NEW.recipient_house_id IS NULL OR NEW.recipient_player_id IS NOT NULL THEN
  RAISE EXCEPTION 'Destinatario invalido: selecione somente casas nobres' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $body$;
DROP TRIGGER IF EXISTS zz_house_only_mail_recipient ON public.campaign_letters;
CREATE TRIGGER zz_house_only_mail_recipient BEFORE INSERT OR UPDATE OF recipient_player_id,recipient_house_id
ON public.campaign_letters FOR EACH ROW EXECUTE FUNCTION public.require_house_mail_recipient();
COMMIT;
