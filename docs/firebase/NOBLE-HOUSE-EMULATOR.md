# Casas nobres no emulador (Fase 2, fatia 1)

Somente emulador local (`demo-cormyr-migration`). Não toca produção nem o Supabase.

## O que existe
- `noble-house-core.mjs`: regras puras de `commit_noble_house_operation` (permissão admin/editor da casa, `houseId` e `schemaVersion` 1, mês inteiro, idempotência por `operationKey`, versão otimista, ledger antes/depois).
- `stage-noble-house-emulator.mjs`: importa `noble_house_sheets`, `noble_house_ledger`, `noble_house_rule_overrides` e `noble_house_gm_notes` em `migrationNobleHouseStage/<snapshot>/...`. Valida contra `campaign_houses`; relatório agregado, sem dados pessoais.
- `noble-house-service.mjs`: `commit(idToken, pedido)` em transação Firestore; o escopo vem de `migrationDomainStage/<snapshot>/access/<uid>`.
- Regras: ficha e ledger legíveis (`get`) por narrador ou membro da casa; `ruleOverrides` por qualquer jogador ativo; `gmNotes` negado a todos os clientes; nenhuma escrita de cliente.

## Pendente de outras fatias
As ações `unit` e `unit_state` (resolução de comandante em `campaign_records`) falham fechadas até a fatia de registros. Também faltam `commit_noble_house_source`, `noble_house_export_pending`, `preview_house_time_impacts` e `get_house_character_ages`.

## Dry-run no backup privado (Cloud Shell)
```
node scripts/firebase/stage-noble-house-emulator.mjs --normalized <DIR_PRIVADO>
```
Imprime apenas contagens e problemas agregados. Com emulador ativo, acrescente `--execute-emulator`.
