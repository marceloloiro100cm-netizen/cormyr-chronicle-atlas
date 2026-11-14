# Registro de personagens no emulador (Fase 2, fatia 2)

Somente emulador local (`demo-cormyr-migration`). Não toca produção nem o Supabase.

## O que existe
- `character-core.mjs`: regras puras de `save_campaign_character` (validações, versão otimista, conflito idade/nascimento), `save_character_relation` (sem ciclos, sem duplicatas ou simetria repetida), `review_character_source` (link/ignore/conflict/reopen, casa divergente, fonte já vinculada) e `character_age_state` (portas de status e cálculo de idade).
- `stage-characters-emulator.mjs`: importa `campaign_characters`, `character_source_links`, `character_review_queue`, `character_relations`, `character_registry_audit` e `character_year_transitions` em `migrationCharacterStage/<snapshot>/...`. Converte arrays `text[]` do Postgres, valida vínculos e imprime só contagens agregadas.
- `character-service.mjs`: comandos transacionais exclusivos do Narrador (`saveCharacter`, `saveRelation`, `reviewSource`, `ageDashboard`), com trilha de auditoria. O escopo vem de `migrationDomainStage/<snapshot>/access/<uid>`.
- Regras: no Supabase todo o registro é leitura só do Narrador, então aqui nenhuma coleção é acessível a clientes (nem Narrador); tudo passa pelo serviço.

## Pendente de outras fatias
`get_house_character_ages` (projeção por Casa) depende de `campaign_records` e fica para a fatia de registros. O painel anual usa o ano informado no pedido; o ano padrão vem do calendário, que será ligado na integração do app.

## Dry-run no backup privado (Cloud Shell)
```
node scripts/firebase/stage-characters-emulator.mjs --normalized <DIR_PRIVADO>
```
