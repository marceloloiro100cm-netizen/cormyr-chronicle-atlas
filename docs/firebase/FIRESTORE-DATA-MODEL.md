# Modelo de dados do Firestore (opção A)

Decisão: o jogo roda em Firestore, sem Postgres. Este documento fixa os princípios
e o mapa de domínios; cada domínio ganha seu detalhamento na própria fatia.

## Princípios

1. **Tudo passa pelo servidor.** Leitura e escrita usam o Admin SDK dentro das
   server functions. As regras do cliente seguem `deny all`, exceto projeções
   públicas explícitas (acervo). Substitui o papel do RLS.
2. **Identidade não é autorização.** O ID token prova quem é a pessoa. Papel e
   Casas vêm de `access/{uid}`, lidos no servidor a cada requisição, sem claims.
3. **Cada RPC vira um comando transacional.** Um arquivo por domínio em
   `src/server/commands/`, com transação do Firestore, campo `version` para
   concorrência otimista, chave de idempotência e linha de auditoria imutável.
4. **IDs de origem preservados** como ID do documento (ou campo `sourceId` quando
   o ID precisar de hash), para reconciliar com o Postgres e manter vínculos.
5. **Sem joins.** Cada tela define a consulta e o índice; o que precisar de soma
   ou contagem usa agregação `count()` ou um documento de resumo mantido pela
   mesma transação.
6. **Limites do Firestore:** 1 MiB por documento e 500 escritas por transação.
   Textos grandes (registros, missivas, fichas) vão em subdocumentos em partes ou
   no Cloud Storage, como já feito no arquivo bruto (registro de 6 fragmentos).
7. **Históricos são append-only** (versões, auditoria, livro-razão), em
   subcoleções que o cliente nunca grava.
8. **Tempo canônico único.** O calendário Harptos é um documento por campanha
   alterado só por transação, e consumidores o leem de lá.

## Mapa de domínios

Tabelas do app (89 em `types.ts`; as do jornal estão em `drizzle/migrations`
0111 e 0119 e faltam em `types.ts`, que está desatualizado).

| Ordem | Domínio | Tabelas | Desenho Firestore (esboço) | Ponto difícil |
| --- | --- | --- | --- | --- |
| 0 | Login | contas Auth (14) | Firebase Auth, UIDs preservados | 2 contas sem perfil, vínculo `custom:` |
| 1 | Arquivos | bucket `campaign-images` (986) | Cloud Storage privado, URLs assinadas | Permissão de leitura por Casa |
| 2 | Acesso e Casas | `campaign_players`, `user_roles`, `campaign_houses`, `house_catalog`, `house_memberships` | `access/{uid}`, `players/{id}`, `houses/{id}` (modelo tipado já existe em emulador) | `is_campaign_admin` (43 usos) e `campaign_access_active` viram uma função de servidor única |
| 3 | Registros | `campaign_records`, `record_versions` | `records/{id}` + `versions` | Conteúdo grande e `save_campaign_record` |
| 4 | Missivas | 9 tabelas (`campaign_letters` tem 33 colunas) | `letters/{id}` + `replies`, `receipts`, `versions`; rodadas em `rounds` | Entrega por semana, sigilo de rascunho; motor de comandos já existe em emulador |
| 5 | Calendário e Hub Temporal | `campaign_calendar`, eventos, 7 tabelas `temporal_*` | `calendar/{campaign}`, `events`, `deliveries` | 21 RPCs só de calendário; relógio único |
| 6 | Hub de Casa | 7 tabelas `noble_house_*` | `houseSheets/{id}` + `ledger` append-only | Regras do livro e prosperidade; exportações |
| 7 | Personagens | 6 tabelas | `characters/{id}` + relações e fila de revisão | Referências entre Casas |
| 8 | Jornal | `campaign_newspaper*` (9) | `newspapers`, `staff`, `engravings`, `storyModels` | 13 usos de Storage |
| 9 | Batalha | 10 tabelas | `battleSessions/{id}` + `events`, convites | Partidas ao vivo e persistência |
| 10 | Espionagem | 27 tabelas | 6 a 8 coleções (`agents`, `operations`, `dossiers`, `intel`...) | Maior volume de regras em SQL |
| 11 | Drive | 5 tabelas de fila e vínculos | `driveBindings`, `outbox` + Cloud Tasks/Scheduler | Segue a Fase 1 (credenciais do Google) |

## Como cada fatia entra em produção

1. Modelo e regras no emulador, com testes de acesso (anônimo, membro, outra Casa,
   Narrador, editor) rodando no CI.
2. Comandos e consultas do servidor, com testes de transação e idempotência.
3. Backfill do Postgres para o Firestore, conferido por contagem e hash.
4. Troca do módulo na interface atrás de uma chave de ambiente, com o Postgres
   ainda como origem de rollback.
5. Período de leitura dupla (comparar Postgres e Firestore) antes de desligar o
   caminho antigo daquele módulo.
