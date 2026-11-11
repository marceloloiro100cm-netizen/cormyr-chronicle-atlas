-- Leonardo / Espião: somente consulta de missivas.
-- Esta migração NÃO remove mensagens existentes, não restringe recebimento
-- ou comprovantes de leitura, nem altera as Casas oficiais.
-- Precisa ser aplicada ao Supabase: versionar no GitHub não executa SQL.
BEGIN;
CREATE OR REPLACE FUNCTION public.block_espiao_outgoing_mail()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path=public,pg_temp AS $guard$
BEGIN
 IF auth.uid() IS NOT NULL AND EXISTS(
  SELECT 1 FROM public.campaign_players p
  JOIN public.house_memberships m ON m.player_id=p.id
  WHERE p.user_id=auth.uid() AND p.roster_house_id='espiao'
    AND lower(btrim(p.name))='leonardo' AND m.house_id='espiao'
 ) THEN
  RAISE EXCEPTION 'Leonardo: missivas em modo de consulta, sem envio ou resposta.'
   USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $guard$;
REVOKE ALL ON FUNCTION public.block_espiao_outgoing_mail() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS zz_espiao_mail_readonly ON public.campaign_letters;
CREATE TRIGGER zz_espiao_mail_readonly BEFORE INSERT OR UPDATE
 ON public.campaign_letters FOR EACH ROW
 EXECUTE FUNCTION public.block_espiao_outgoing_mail();
DROP TRIGGER IF EXISTS zz_espiao_reply_readonly ON public.letter_replies;
CREATE TRIGGER zz_espiao_reply_readonly BEFORE INSERT OR UPDATE
 ON public.letter_replies FOR EACH ROW
 EXECUTE FUNCTION public.block_espiao_outgoing_mail();
COMMIT;
