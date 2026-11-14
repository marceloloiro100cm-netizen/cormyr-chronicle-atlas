# Motor de tempo (Hub Temporal) no emulador (Fase 2, fatia 4)

Somente emulador local (`demo-cormyr-migration`). Não toca produção nem o Supabase.

## O que existe
- `harptos-core.mjs`: calendário de Harptos (12 meses de 30 dias, festivais, Shieldmeet só em anos divisíveis por 4), ordinais, meses absolutos, alvo de `advance`/`set`/`publish` e a prévia `preview_campaign_time_change` (limite de 120 meses, festivais e anos cruzados, fichas a conferir).
- `time-core.mjs`: `publish_campaign_time_change` (versão otimista, retrocesso só com autorização e justificativa de 10 caracteres, idempotência por chave com assinatura dos parâmetros), `apply_calendar_months` (cada casa ativa avança com lançamento `calendar_advance` no livro; obras vencidas concluem em ponto fixo, órfãs cancelam; ficha inválida aborta tudo; lançamento já existente para o mês é conflito) e `preview_house_time_impacts`.
- `stage-time-engine-emulator.mjs`: importa `campaign_calendar`, `campaign_time_operations` e `campaign_calendar_audit` em `migrationTimeEngineStage/<snapshot>/...`.
- `time-service.mjs`: `preview`, `publish` e `history` (só Narrador) e `getCalendar` (qualquer acesso ativo). `publish` grava calendário, fichas, livro, snapshots da agenda, auditorias e registro de idempotência em UMA transação.
- Regras: nenhuma coleção é acessível a clientes.

## Ajuste no núcleo das casas
`noble-house-core.mjs` aceita qualquer ação, exceto `unit`/`unit_state`, e o mês do lançamento vem de `state.month`, como no SQL.

## Dry-run no backup privado (Cloud Shell)
```
node scripts/firebase/stage-time-engine-emulator.mjs --normalized <DIR_PRIVADO>
```
Imprime apenas contagens agregadas.

## Transições anuais
Cada fronteira de ano cruzada por uma mudança de data grava um evento auditável (versão do calendário, ano de origem e destino, ator) em `migrationCharacterStage/<snapshot>/transitions`, uma vez por trio, na mesma transação da publicação (equivalente ao gatilho `audit_character_year_transition`).
