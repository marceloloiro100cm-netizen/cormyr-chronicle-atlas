-- Matriz de acesso com identidades sintéticas e rollback.
BEGIN;
DO $$
BEGIN
 IF has_table_privilege('anon','public.battle_v3_live_matches','SELECT')
 THEN RAISE EXCEPTION 'Anon não pode ler batalhas V3'; END IF;
 IF has_table_privilege('authenticated','public.battle_v3_live_matches','INSERT')
    OR has_table_privilege('authenticated','public.battle_v3_live_matches','UPDATE')
 THEN RAISE EXCEPTION 'Jogadores não podem gravar no banco diretamente'; END IF;
 IF NOT has_table_privilege('service_role','public.battle_v3_live_matches','UPDATE')
 THEN RAISE EXCEPTION 'Service role sem autorização de escrita'; END IF;
END $$;
INSERT INTO public.battle_v3_live_matches
 (title,attacker_house_id,defender_house_id,created_by,state_hash,replay_json)
VALUES ('Teste V3 autenticado','test-evenhand','test-ashkar',
 '11111111-1111-4111-8111-111111111111',repeat('a',64),'{}'::jsonb);

SET LOCAL ROLE authenticated;
SELECT set_config('app.campaign_active','on',true);
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.battle_v3_live_matches)<>1
 THEN RAISE EXCEPTION 'Atacante não consegue ler partida'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.battle_v3_live_matches)<>1
 THEN RAISE EXCEPTION 'Defensor não consegue ler partida'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.battle_v3_live_matches)<>0
 THEN RAISE EXCEPTION 'Terceiro jogador vê partida alheia'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
SELECT set_config('app.campaign_active','off',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.battle_v3_live_matches)<>0
 THEN RAISE EXCEPTION 'Acesso de campanha revogado não foi aplicado'; END IF;
END $$;
ROLLBACK;
