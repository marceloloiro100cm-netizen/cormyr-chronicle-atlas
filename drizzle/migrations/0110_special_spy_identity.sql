-- A identidade "Espião" não pertence à lista de Casas da segunda temporada.
-- Apenas o jogador com vínculo ativo pode visualizar sua identidade privada.
-- Não cria usuários, senhas, privilégios de Narrador ou fichas de outras casas.
BEGIN;
CREATE POLICY campaign_house_special_member_read
 ON public.campaign_houses FOR SELECT TO authenticated
 USING (id='espiao' AND active AND season=0 AND public.in_campaign_house(id,false));
COMMIT;
