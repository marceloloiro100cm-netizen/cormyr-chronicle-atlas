# Rede de Espiões — evidência de ensaio na cópia Lovable isolada (02/11/2026)

**Projeto de homologação:** `41028f68-4fe7-4ed0-b123-c820522a0a3b` — `Cormyr — Homologação Isolada (sem dados reais)`.
**Projeto de produção:** `bdc007de-2bdf-4e28-8df8-b09ce46f884c` — **não modificado**.

## Procedimento realmente executado

1. Confirmado por SQL que a cópia tinha **0 Casas, 0 fichas, 0 missivas e 0 entradas do ledger**, com apenas **1 linha em `drizzle.__drizzle_migrations`**.
2. Inspecionados pré-requisitos `campaign_houses`, `noble_house_ledger`, `campaign_calendar`, `campaign_time_operations`, `campaign_temporal_consumers` e funções de Harptos/permissão.
3. Executado **somente na cópia** o SQL candidato `docs/espionage/sql/0075_spy_core_REVIEW_ONLY.sql`; verificados `spy_assets`, `spy_operations`, `spy_intel_reports`, `spy_submit_mission` e **8 políticas RLS** específicas.
4. Executado **somente na cópia** `docs/espionage/sql/0076_spy_temporal_REVIEW_ONLY.sql`; verificada a existência de `spy_process_published_movements` e `campaign_temporal_consumers.code='spy-movements'` com **enabled=false**.
5. Após detectar posses legadas com IDs textuais como `hold-ashkar-spy`, os contratos TS e o SQL candidato foram corrigidos. Na cópia, as duas colunas ainda vazias `spy_assets.source_holding_id` e `spy_contract_receipts.holding_id` foram ajustadas para `text`, confirmado em `information_schema.columns`.
6. Inspecionadas as 13 tabelas `spy_%` na cópia: **todas com RLS**, `anon` sem SELECT, `authenticated` sem INSERT/UPDATE, e dados sensíveis (decisões, eventos, regras privadas, recibos, entregas temporais) sem SELECT direto para `authenticated`.
7. A cópia permaneceu sem agentes, operações ou cartas reais. Nenhum usuário/identidade real foi simulado na cópia.
8. Independente desta cópia, o CI `Espionagem Marco C — PostgreSQL descartável` passou nos testes de RLS por Casa, cartas seladas, liberação autorizada, replay e retrocesso.

## Limitações da prova

- O procedimento foi uma **aplicação manual de SQL em homologação vazia**; não atualizou `drizzle.__drizzle_migrations`, portanto **não é ensaio de execução do migrador oficial**.
- Não demonstra restauração física, recuperação de anexos, reconciliação das 40 entradas reais de Drizzle, login com credenciais de jogadores reais, nem integridade de fichas após migração.
- Não substitui a aprovação do Narrador, o aceite funcional de 20 cenários, a revisão independente nem o backup completo.
- As ações server-side de matrícula, validação de itinerário, adjudicação e cartas ainda precisam ser conectadas antes do go-live; montar componentes de prévia não significa disponibilizar operações reais.

## Estado

**ESQUEMA STAGING: executado e conferido.**  
**RESTAURAÇÃO DA PRODUÇÃO: não realizada.**  
**HOMOLOGAÇÃO COM USUÁRIOS REAIS: não realizada.**  
**PUBLICAÇÃO: NO_GO, produção inalterada.**

O procedimento para concluir depende de acesso a mecanismo gerenciado de backup/restore ou conexão administrativa segura ao Supabase; a integração Lovable disponível na conversa fornece consultas SQL, mas não um comando de backup/restauração completo.
