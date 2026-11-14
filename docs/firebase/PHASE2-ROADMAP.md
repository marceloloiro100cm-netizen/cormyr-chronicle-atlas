# Fase 2: roadmap de migração de dados e serviços (Supabase para Firebase)

**Atualizado em 14/11/2026.** Base: `docs/firebase/source-inventory.json`
(inventário estático: 61 tabelas e 144 funções SQL candidatas) cruzado com os
scripts de `scripts/firebase/`. Este documento não afirma que algo está pronto
para os jogadores: tudo abaixo é emulador ou plano. `readyForCutover` segue
`false` e as regras de produção (`firebase/firestore.rules` e
`firebase/storage.rules`) seguem "deny all".

Decisão do proprietário: Firestore completo para os dados do jogo. O Supabase
atual (Lovable Cloud) segue como fonte de verdade até o corte, e hoje o acesso
à chave `service_role` está pendente.

## Estado por domínio

| Domínio | Tabelas | Situação em emulador |
| --- | --- | --- |
| Acesso e identidade | `profiles`, `user_roles`, `campaign_access_profiles`, `house_memberships` | Auth e modelo `access` preparados; faltam login real (OAuth/SSO), 2 contas sem perfil e 1 vínculo customizado |
| Casas e jogadores | `campaign_houses`, `campaign_players` | Modelo tipado (11 Casas, 11 jogadores) com regras e testes |
| Missivas | `campaign_letters`, `letter_*`, `mail_submissions`, `narrator_mail_notes`, `campaign_letter_consequences` | Leitura individual tipada; histórico e serviços de envio/leitura em emulador; 15 missivas em quarentena |
| Calendário e Hub Temporal | `campaign_calendar*`, `campaign_time_operations`, `campaign_temporal_*` | Projeção Harptos e histórico privado em emulador |
| Jornal | `campaign_newspaper*` | Staging em emulador com regras de editor |
| **Casas nobres (hub)** | `noble_house_sheets`, `noble_house_ledger`, `noble_house_rule_overrides`, `noble_house_workbook_imports`, `noble_house_source_links`, `noble_house_gm_notes`, `noble_house_drive_exports`, `house_catalog` | **Nenhum modelo** |
| **Fichas de personagem** | `campaign_characters`, `character_relations`, `character_source_links`, `character_review_queue`, `character_year_transitions`, `character_registry_audit` | **Nenhum modelo** |
| **Acervo e registros** | `campaign_records`, `record_versions`, `archive_source_review`, `public_archive_roots`, `campaign_translations` | **Nenhum modelo** |
| **Agenda** | `campaign_schedule_events`, `campaign_schedule_event_audit` | **Nenhum modelo** |
| **Conteúdo privado do Narrador** | `campaign_private_gm_content`, `campaign_private_vassal_workbooks`, `campaign_representation_sessions`, `campaign_admin_audit`, `campaign_migration_backups` | **Nenhum modelo** (conteúdo narrativo privado: nunca em regra de cliente) |
| **Sincronização com o Drive** | `drive_sync_bindings`, `drive_sync_files`, `drive_sync_inbox`, `sync_conflicts`, `sync_outbox` | **Nenhum modelo** |

Placar: 30 de 61 tabelas tocadas por algum script de staging; 31 sem nenhum.
Isso conta presença em script, não correção funcional nem equivalência de
regras.

## Ordem sugerida

1. **Casas nobres (hub)**: é o centro do app (ficha, recursos, posses, ledger
   imutável, regras sobrescritas). Funções SQL a substituir por serviços
   transacionais: `commit_noble_house_operation`, `commit_noble_house_source`,
   `noble_house_export_pending`, `preview_house_time_impacts`,
   `get_house_character_ages`. Depende do modelo de acesso já existente.
2. **Fichas de personagem**: `save_campaign_character`,
   `save_character_relation`, `review_character_source`,
   `get_character_registry_hub`, `character_age_state`,
   `get_character_year_transitions`. Liga com o Hub Temporal.
3. **Acervo e registros e agenda**: `save_campaign_record`, `can_read_record`,
   `can_edit_record`, `save_campaign_schedule_event`,
   `publish_campaign_schedule*`.
4. **Conteúdo privado do Narrador e representação**:
   `start/stop_campaign_representation`, `campaign_representation_action`.
   Regra firme: nada disso é lido pelo SDK de cliente, nem pelo Narrador.
5. **Drive**: `claim_drive_binding`, `apply_drive_record`,
   `resolve_drive_import`, `drive_resolution_requeue`. Exige ETags reais e a
   fila `sync_outbox` (ver `AGENTS.md`).
6. **Integração do app**: trocar as chamadas Supabase de `src/` por serviços
   Firebase, módulo a módulo, atrás de um adaptador, com testes E2E por papel
   (anônimo, jogador, membro de outra Casa, editor, Narrador).
7. **Reconciliação, freeze, delta, DNS, rollback**, conforme
   `MIGRATION-COVERAGE.md`.

## Padrão de cada fatia

Cada domínio segue o molde já usado em `stage-typed-domain-emulator.mjs`:

1. Script de transformação sobre o backup privado normalizado (sem imprimir
   dados pessoais, só contagens e problemas por categoria), com `dry-run`.
2. Regras de emulador em `firebase/firestore.domain.rules` (ou arquivo próprio),
   negando por padrão e sem gravação por SDK de cliente.
3. Testes unitários e de integração com dados fictícios, incluindo os cinco
   papéis (anônimo, membro, outra Casa, Narrador, editor).
4. Workflow de CI dedicado, rodando só em emulador (`demo-*`).
5. Documento em `docs/firebase/` com o que ficou provado e o que falta.

## O que bloqueia ou depende do proprietário

- Chave `service_role` real do Supabase (ou transferência do banco para uma
  conta própria): necessária para qualquer reconciliação final com a origem ativa.
- Execução do dry-run de cada fatia no Cloud Shell sobre o backup privado real
  (`.firebase-migration/...`), que não fica no repositório.
- Decisão de domínio definitivo, credenciais do Google e Cloud Scheduler
  (ver `APPHOSTING-ROLLOUT.md`).
