-- Cormyr | Hub Temporal | Lote 1
-- Auditoria REPRODUZIVEL e SOMENTE DE LEITURA no Supabase conectado ao projeto.
-- Nao cria, atualiza nem remove registros. Executar com acesso administrativo autorizado.
-- A consulta retorna agregados; nao exportar conteudo de missivas, NPCs ou fichas privadas.
-- Registrar timestamp e ambiente ao coletar o baseline.
--
-- 1. Tempo publicado: fonte atual (month zero-based).
SELECT year, month, day, festival, auto_advance, last_round, published_week,
       version, published_at, updated_at
FROM public.campaign_calendar WHERE id = true;

-- 2. Rodadas existentes: metadados temporais; sem conteudo de correspondencias.
SELECT number, status, closed, harptos_period, opened_at, closed_at
FROM public.letter_rounds ORDER BY number;

-- 3. Contagens gerais por entidade (apenas agregados).
SELECT 'campaign_houses' AS entity, COUNT(*) AS total FROM public.campaign_houses
UNION ALL SELECT 'campaign_players', COUNT(*) FROM public.campaign_players
UNION ALL SELECT 'campaign_records', COUNT(*) FROM public.campaign_records
UNION ALL SELECT 'noble_house_sheets', COUNT(*) FROM public.noble_house_sheets
UNION ALL SELECT 'campaign_letters', COUNT(*) FROM public.campaign_letters
UNION ALL SELECT 'letter_replies', COUNT(*) FROM public.letter_replies
UNION ALL SELECT 'campaign_schedule_events', COUNT(*) FROM public.campaign_schedule_events
UNION ALL SELECT 'house_memberships', COUNT(*) FROM public.house_memberships
ORDER BY entity;

-- 4. Estado mensal e atividade das Casas (sem nomes nem fichas).
SELECT (state->>'month') AS internal_month, COUNT(*) AS house_count,
       COUNT(*) FILTER (WHERE state->>'phase' = 'active') AS active,
       COUNT(*) FILTER (WHERE state->>'phase' = 'draft') AS draft,
       COUNT(*) FILTER (WHERE state->>'phase' = 'review') AS review
FROM public.noble_house_sheets
GROUP BY state->>'month' ORDER BY internal_month;

-- 5. Projetos, unidades e cargos: contagens, sem detalhes privados.
SELECT COALESCE(SUM(jsonb_array_length(
         CASE WHEN jsonb_typeof(state->'projects')='array' THEN state->'projects' ELSE '[]'::jsonb END
       )),0) AS projects,
       COALESCE(SUM(jsonb_array_length(
         CASE WHEN jsonb_typeof(state->'units')='array' THEN state->'units' ELSE '[]'::jsonb END
       )),0) AS military_units,
       COALESCE(SUM(jsonb_array_length(
         CASE WHEN jsonb_typeof(state->'court')='array' THEN state->'court' ELSE '[]'::jsonb END
       )),0) AS court_appointments
FROM public.noble_house_sheets;

-- 6. Correspondencias por estado e integridade das datas.
-- valid_campaign_date(NULL) retorna false; registros antigos sem data ficam pendentes.
SELECT 'letters' AS origin, publication_state, COUNT(*) AS total,
       COUNT(*) FILTER (WHERE campaign_date IS NULL) AS missing_date,
       COUNT(*) FILTER (WHERE campaign_date IS NOT NULL
           AND NOT public.valid_campaign_date(campaign_date)) AS malformed_date
FROM public.campaign_letters WHERE deleted_at IS NULL GROUP BY publication_state
UNION ALL
SELECT 'replies', publication_state, COUNT(*),
       COUNT(*) FILTER (WHERE campaign_date IS NULL),
       COUNT(*) FILTER (WHERE campaign_date IS NOT NULL
           AND NOT public.valid_campaign_date(campaign_date))
FROM public.letter_replies GROUP BY publication_state
ORDER BY origin, publication_state;

-- 7. Fontes de personagens e indicios textuais, sem revelar conteudo.
SELECT kind, visibility, COUNT(*) AS total,
       COUNT(*) FILTER (WHERE content ~* '(^|[[:space:]])(idade|nascimento|nascido|nascida)[[:space:]]*[:·-]') AS age_or_birth_labels
FROM public.campaign_records GROUP BY kind, visibility ORDER BY kind, visibility;

-- 8. Registro de migracoes. A contagem nao identifica por si so migracoes faltantes.
SELECT COUNT(*) AS applied_migration_rows, MIN(created_at) AS first_epoch_ms,
       MAX(created_at) AS last_epoch_ms FROM drizzle.__drizzle_migrations;

-- 9. Existencia de entidades de envelhecimento / rastreio e contagens de auditoria.
SELECT to_regclass('public.campaign_characters') IS NOT NULL AS has_campaign_characters,
       to_regclass('public.character_source_links') IS NOT NULL AS has_character_source_links,
       (SELECT COUNT(*) FROM public.campaign_calendar_audit) AS time_audit_rows,
       (SELECT COUNT(*) FROM public.campaign_schedule_event_audit) AS schedule_audit_rows,
       (SELECT COUNT(*) FROM public.campaign_migration_backups) AS migration_backup_rows,
       (SELECT COUNT(*) FROM public.noble_house_ledger) AS house_ledger_rows;

-- 10. RLS e publicacao realtime: apenas metadados de configuracao.
SELECT tablename, policyname, roles, cmd, qual
FROM pg_policies WHERE schemaname='public'
AND tablename IN ('campaign_calendar','campaign_calendar_audit','campaign_schedule_events',
                  'campaign_records','campaign_letters','letter_replies',
                  'noble_house_sheets','letter_rounds')
ORDER BY tablename, policyname;

SELECT schemaname, tablename, pubname
FROM pg_publication_tables WHERE schemaname='public'
AND tablename IN ('campaign_calendar','campaign_schedule_events','campaign_letters',
                  'campaign_records') ORDER BY tablename, pubname;
