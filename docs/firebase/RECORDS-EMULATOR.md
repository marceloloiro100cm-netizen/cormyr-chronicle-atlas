# Acervo e registros no emulador (Fase 2, fatia 3)

Somente emulador local (`demo-cormyr-migration`). Não toca produção nem o Supabase.

## O que existe
- `record-core.mjs`: `can_read_record`, `can_edit_record`, `save_campaign_record` (versão otimista, `sync_state` volta a `pending`), a política de inserção de registros e `save_imported_source` (só sobrescreve importações do Drive ainda na versão 1). O perfil editor do Jornal não lê registros de Casa nem de jogador.
- `stage-records-emulator.mjs`: importa `campaign_records` e `record_versions` em `migrationRecordStage/<snapshot>/...`. Valida visibilidade, vínculos com Casa e jogador, duplicidade de arquivo de origem e relatório agregado sem conteúdo.
- `record-service.mjs`: `createRecord`, `saveRecord`, `getRecord`, `listRecords` (lista só o que a pessoa pode ler, sem o conteúdo) e `serverSaveImportedSource` (uso interno do sincronizador).
- Regras: `get` por Narrador, dono do registro de jogador ou membro da Casa; versões herdam o mesmo acesso por campos copiados; nenhuma listagem nem escrita de cliente.

## Fora desta fatia
Agenda (`campaign_schedule_events`), `archive_source_review`, `public_archive_roots`, `campaign_translations` e as ações `unit`/`unit_state` das Casas nobres (resolução de comandante) seguem em PRs próprios.

## Dry-run no backup privado (Cloud Shell)
```
node scripts/firebase/stage-records-emulator.mjs --normalized <DIR_PRIVADO>
```
