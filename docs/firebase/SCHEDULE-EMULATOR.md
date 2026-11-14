# Agenda do calendário no emulador (Fase 2, fatia 3b)

Somente emulador local (`demo-cormyr-migration`). Não toca produção nem o Supabase.

## O que existe
- `schedule-core.mjs`: `save_campaign_schedule_event` (data de Harptos válida, título 1 a 180, descrição até 4000, versão otimista, exclusão lógica), a metade de eventos da publicação (promove rascunhos alterados para o snapshot publicado e audita cada um) e `get_campaign_schedule_events` (visão pública por mês, festivais dobrados no mês correspondente).
- `stage-schedule-emulator.mjs`: importa `campaign_schedule_events` e `campaign_schedule_event_audit` em `migrationScheduleStage/<snapshot>/...`, validando datas e vínculos, com relatório agregado.
- `schedule-service.mjs`: `saveEvent` e `getDrafts` (só Narrador), `getPublished` (qualquer acesso ativo; mostra apenas o snapshot publicado) e `serverPublishEventSnapshots` (gancho de servidor, sem token, para o motor temporal).
- Regras: nenhuma coleção é acessível a clientes; rascunhos nunca saem do serviço.

## Fora desta fatia
A mudança da data do calendário (`publish_campaign_time_change`, prévia, avanço de meses nas fichas, retrocesso, auditoria e idempotência por chave) é o motor do Hub Temporal e ganha fatia própria. Ela chamará `serverPublishEventSnapshots` dentro da sua própria transação.

## Dry-run no backup privado (Cloud Shell)
```
node scripts/firebase/stage-schedule-emulator.mjs --normalized <DIR_PRIVADO>
```
