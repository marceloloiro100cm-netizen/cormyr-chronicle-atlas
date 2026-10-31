-- Hub Temporal | Lote 01 | conferência de baseline PostgreSQL/Supabase
-- SOMENTE LEITURA. Não executar procedimentos de abertura de rodada ou publicação para testar.
-- Não exportar conteúdo de missivas/personagens, IDs de usuário nem detalhes de documentos.
-- Execute cada SELECT com conta administrativa autorizada e registre a data/hora da consulta.

-- 1) Estado temporal publicado (sem identificador do executor).
SELECT year, month, day, festival, published_week, last_round,
       auto_advance, version, published_at
FROM public.campaign_calendar;

-- 2) Situação das rodadas de correspondência.
SELECT status, COUNT(*) AS total, MIN(number) AS primeira, MAX(number) AS ultima
FROM public.letter_rounds GROUP BY status ORDER BY status;

-- 3) Contagens agregadas, sem expor mensagens privadas.
SELECT
  (SELECT COUNT(*) FROM public.campaign_houses) AS casas,
  (SELECT COUNT(*) FROM public.noble_house_sheets) AS fichas_nobres,
  (SELECT COUNT(*) FROM public.campaign_records) AS registros,
  (SELECT COUNT(*) FROM public.campaign_letters) AS missivas,
  (SELECT COUNT(*) FROM public.letter_replies) AS respostas,
  (SELECT COUNT(*) FROM public.campaign_calendar_audit) AS auditorias_calendario,
  (SELECT COUNT(*) FROM public.campaign_schedule_events) AS eventos_cadastrados;

-- 4) Referência temporal das fichas; números de mês apenas, sem dados das Casas.
SELECT COUNT(*) AS total_fichas,
       COUNT(*) FILTER (WHERE state ? 'month') AS fichas_com_mes,
       MIN((state->>'month')::integer) FILTER (WHERE state->>'month' ~ '^[0-9]+$') AS menor_mes,
       MAX((state->>'month')::integer) FILTER (WHERE state->>'month' ~ '^[0-9]+$') AS maior_mes,
       SUM(CASE WHEN jsonb_typeof(state->'projects')='array'
                THEN jsonb_array_length(state->'projects') ELSE 0 END) AS projetos
FROM public.noble_house_sheets;

-- 5) Registros de personagens por formato/escopo, sem retornar seus conteúdos.
SELECT kind, visibility, COUNT(*) AS total,
       COUNT(*) FILTER (WHERE content ~* 'idade|nascim|birth|age') AS com_pista_etaria,
       COUNT(*) FILTER (WHERE content LIKE
            'Ficha de Personagem · Chronicle System · Estruturada%') AS fichas_chronicle
FROM public.campaign_records
GROUP BY kind, visibility ORDER BY kind, visibility;

-- 6) Rastreamento de migrações de Drizzle (ID não prova execução de todos os arquivos).
SELECT COUNT(*) AS entradas, MAX(id) AS ultimo_id, MAX(created_at) AS maior_timestamp
FROM drizzle.__drizzle_migrations;

-- 7) Funções de alteração/consulta do tempo e permissão de execução.
SELECT p.proname AS funcao, pg_get_function_identity_arguments(p.oid) AS argumentos,
       p.prosecdef AS security_definer
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN
 ('get_campaign_calendar','set_campaign_calendar','advance_calendar_round',
  'publish_campaign_schedule','publish_campaign_schedule_confirmed',
  'calendar_mail_events','set_letter_round','apply_calendar_months',
  'get_campaign_schedule_events')
ORDER BY p.proname;

-- 8) Gatilhos que podem alterar a data (metadados somente).
SELECT trigger_name, event_object_table, action_timing, event_manipulation,
       action_statement
FROM information_schema.triggers
WHERE trigger_schema='public' AND event_object_table IN
 ('letter_rounds','campaign_calendar')
ORDER BY event_object_table, trigger_name;

-- 9) Políticas de acesso de dados temporais e correspondência.
SELECT tablename, policyname, cmd, roles
FROM pg_policies WHERE schemaname='public' AND tablename IN
 ('campaign_calendar','campaign_calendar_audit',
  'campaign_schedule_events','campaign_letters','letter_replies','campaign_records')
ORDER BY tablename, policyname;

-- 10) Verificar se a tabela global está na publicação Realtime.
SELECT schemaname, tablename
FROM pg_publication_tables
WHERE pubname='supabase_realtime' AND schemaname='public'
  AND tablename IN ('campaign_calendar','campaign_schedule_events')
ORDER BY tablename;

-- Atenção: se o histórico de migrações não conciliar com os objetos presentes,
-- NÃO aplicar migrations em produção até identificar os objetos executados fora do ledger.
