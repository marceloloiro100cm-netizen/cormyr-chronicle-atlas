-- CCA-BATTLE-V2: BACKOUT EXCLUSIVAMENTE APÓS AUTORIZAÇÃO E BACKUP.
-- Não é executado no CI nem na produção. Rodar somente na homologação correta.
-- Recusa remover qualquer tabela com conteúdo. Não altera tabelas da campanha.
BEGIN;
DO $guard$
BEGIN
 IF to_regclass('public.battle_sim_sessions') IS NULL
   OR to_regclass('public.battle_sim_events') IS NULL
   OR to_regclass('public.battle_sim_scenarios') IS NULL
 THEN RAISE EXCEPTION 'Objetos da batalha ausentes. Recusando backout parcial.'; END IF;
 IF EXISTS(SELECT 1 FROM public.battle_sim_sessions)
   OR EXISTS(SELECT 1 FROM public.battle_sim_events)
   OR EXISTS(SELECT 1 FROM public.battle_sim_scenarios)
 THEN RAISE EXCEPTION 'A batalha contém registros; faça backup e tratamento manual antes de excluir.'; END IF;
END
$guard$;
DROP FUNCTION public.battle_sim_commit_step(uuid,uuid,integer,text,jsonb,jsonb,jsonb,text,text);
DROP FUNCTION public.battle_sim_commit_replay(uuid,text,jsonb,jsonb,text,text,jsonb);
DROP TABLE public.battle_sim_events;
DROP TABLE public.battle_sim_sessions;
DROP TABLE public.battle_sim_scenarios;
COMMIT;
