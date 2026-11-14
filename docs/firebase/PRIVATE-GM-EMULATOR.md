# Conteúdo privado do Narrador e representação no emulador (Fase 2, fatia 5)

Somente emulador local (`demo-cormyr-migration`). Não toca produção nem o Supabase.

## O que existe
- `stage-private-gm-emulator.mjs`: importa `campaign_private_gm_content`, `campaign_private_vassal_workbooks` e `campaign_admin_audit` em `migrationPrivateGmStage/<snapshot>/...`. Sessões de representação (efêmeras, 30 min) e `campaign_migration_backups` ficam de fora de propósito. O relatório mostra só contagens.
- `private-gm-core.mjs`: `start/stop_campaign_representation` e `campaign_representation_action`. Sessão de 30 minutos por Narrador, só para jogador ativo, com conta e sem troca de senha pendente, nunca para outra conta administrativa. Cada ação roda com o escopo do jogador representado, relido a cada chamada (acesso removido ou sessão vencida nega na hora).
- `private-gm-service.mjs`: `getGmContent` e `listGmContent` (só Narrador), `serverGetVassalWorkbook` (gancho de servidor, sem token, como o service_role), `startRepresentation`, `stopRepresentation` e `representationAction`. Auditoria em `representation_start`, `representation_stop` e `representation_<ação>`.
- Ações nativas: `read` (jogador, casas dele e registros que ele pode ler) e `save_record` (mesma regra de versão e escopo do jogador; autor é o jogador). `send`, `reply`, `draft` e `delete` (cartas) são recusadas até a integração do app plugar os serviços de correio via `handlers`.
- Regras: nenhuma coleção é acessível a clientes, nem ao Narrador.

## Dry-run no backup privado (Cloud Shell)
```
node scripts/firebase/stage-private-gm-emulator.mjs --normalized ~/cormyr-chronicle-atlas/.firebase-migration/inspecao-12nov-E4pokAhB/normalized
```
