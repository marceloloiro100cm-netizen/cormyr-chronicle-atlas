# Sincronização com o Drive no emulador (Fase 2, fatia 6)

Somente emulador local (`demo-cormyr-migration`). Não toca produção, o Supabase nem o Google Drive real: o Drive entra por um adaptador injetado (nos testes, um Drive em memória com ETag e `If-Match` de verdade).

## O que existe
- `drive-core.mjs`: porta `src/lib/drive-sync.ts` (envelope estrito, `allowed`, forma canônica, hash, `decide`, `retryDelay`, nomes de arquivo) com o mesmo formato dos arquivos que já estão no Drive, e as funções SQL `apply_drive_record`, `resolve_drive_import` e o gatilho `drive_resolution_requeue`.
- `stage-drive-emulator.mjs`: importa `drive_sync_bindings`, `drive_sync_files`, `drive_sync_inbox`, `sync_outbox` e `sync_conflicts` em `migrationDriveSyncStage/<snapshot>/...`. Leases ativos não são levados: o novo ambiente pede o seu próprio. O relatório mostra só contagens.
- `stage-records-emulator.mjs` agora guarda também o texto original dos carimbos de data (`createdAtText`, `updatedAtText`), para que o envelope de um registro não alterado continue idêntico ao arquivo já gravado no Drive.
- `drive-service.mjs`: `claimBinding` (lease de 2 minutos, só pasta autorizada), `applyDriveRecord` (só a versão seguinte, dentro do escopo da pasta, relendo tudo na transação), `resolveImport` (só administrador; pasta, site, mesclar ou rejeitar, com reenfileiramento), `listInbox`, `listBindings` e `runSync`, o executor para registros: importa mudanças do Drive, abre revisão em caso de conflito (nunca sobrescreve em silêncio) e exporta com ETag, só encerrando quando todos os destinos têm a versão.
- Regras: nenhuma coleção é acessível a clientes.

## Fora desta fatia
Cartas e respostas (exportação e importação) dependem do correio e entram na integração do app. Importar resposta pelo administrador só aceita "manter site" ou "rejeitar" por enquanto. O adaptador real do Google (credenciais) entra na integração do app.

## Dry-run no backup privado (Cloud Shell)
```
node scripts/firebase/stage-drive-emulator.mjs --normalized ~/cormyr-chronicle-atlas/.firebase-migration/inspecao-12nov-E4pokAhB/normalized
```
