-- CCA-ESP-MVP-001 · PREFLIGHT SOMENTE LEITURA
-- Executar em uma CÓPIA RESTAURADA E SEGREGADA do banco da campanha.
-- Nenhum INSERT/UPDATE/DELETE/DDL, alteração temporal ou acesso a fatos privados.
-- Este relatório não substitui backup, ensaio de restauração ou aceite narratorial.
SELECT current_database() AS database_name,
 current_user AS database_role,
 now() AS inspected_at;
SELECT 'protecao_de_dados' AS category,
 (SELECT count(*) FROM public.noble_house_sheets) AS house_sheets,
 (SELECT count(*) FROM public.campaign_letters) AS existing_letters,
 (SELECT count(*) FROM public.noble_house_ledger) AS economic_events,
 (SELECT count(*) FROM drizzle.__drizzle_migrations) AS applied_migrations;
SELECT 'calendario_oficial' AS category,
 year,month,day,festival,version
 FROM public.campaign_calendar WHERE id=true;
SELECT 'schema_espionagem' AS category,
 name AS object_name,
 to_regclass('public.'||name) IS NOT NULL AS installed
 FROM (VALUES
 ('spy_assets'),('spy_operations'),('spy_operation_segments'),
 ('spy_mission_decisions'),('spy_intel_reports'),
 ('spy_dossiers'),('spy_dossier_facts'),('spy_temporal_deliveries'),
 ('spy_region_links')) AS t(name);
SELECT 'rpc_operacional' AS category,
 name AS rpc_name,
 to_regprocedure('public.'||name) IS NOT NULL AS installed
 FROM (VALUES
 ('spy_submit_mission(text,uuid,uuid,text,text,text,text[],integer,text)'),
 ('spy_reconcile_house_agents(text,uuid,text)'),
 ('spy_plan_operation_route(uuid,integer,integer,uuid,jsonb,text)'),
 ('spy_process_published_movements(integer,uuid,text)'),
 ('spy_resolve_mission(uuid,uuid,text,text,integer)'),
 ('spy_seal_intel_report(uuid,uuid,uuid,text,text,text,jsonb,text)'),
 ('spy_release_report(uuid,uuid,text,text,text)'),
 ('spy_get_regional_strategy(text)'),
 ('spy_add_desdias(text,integer)')) AS t(name);
SELECT 'isolamento_rls' AS category,
 c.relname AS tablename,
 c.relrowsecurity AS row_security_enabled,
 has_table_privilege('anon',c.oid,'SELECT') AS anonymous_can_read,
 has_table_privilege('authenticated',c.oid,'INSERT') AS player_can_insert,
 has_table_privilege('authenticated',c.oid,'UPDATE') AS player_can_update,
 has_table_privilege('authenticated',c.oid,'DELETE') AS player_can_delete
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind='r' AND c.relname LIKE 'spy_%'
 ORDER BY c.relname;
SELECT 'politicas_privacidade' AS category,tablename,policyname,roles,cmd
 FROM pg_policies WHERE schemaname='public' AND tablename LIKE 'spy_%'
 ORDER BY tablename,policyname;
-- Se as tabelas de espionagem ainda não existirem, registrar falha de prontidão;
-- NÃO criar tabelas por meio deste roteiro.
-- Valores pré e pós-migração precisam ser comparados com o MESMO snapshot assinado.
