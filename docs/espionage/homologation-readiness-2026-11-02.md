# CCA-ESP-MVP-001 — Homologação: evidências, lacunas e controle de publicação

**Data da preparação:** 02/11/2026. **Decisão:** `NO_GO` para produção.  
**Linha de código:** `feature/espionage-homologation-gates` empilhada sobre `feature/espionage-desdia-temporal` (PR #217).

## Evidências técnicas de partida

O PR #217 executou com **sucesso** os três jobs na revisão `f0aebd679e6021fccf9ad14c07a6da0be4ab7397`:
- [Validate](https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas/actions/runs/41555745604)
- [Marcos A+B / contratos, interface e TypeScript](https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas/actions/runs/41555745544)
- [Marco C / PostgreSQL 16 descartável](https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas/actions/runs/41555745438)

**Essas provas são de contrato em banco descartável**, não de aplicação homologada com backup da campanha. A promoção de SQLs `0075–0083` não está autorizada.

## Matriz de aceitação real H01–H20

Fonte única de assinatura: `docs/espionage/homologation-signoff.json`. Nenhum caso está marcado como aprovado sem evidência do Narrador.

| Cenário | Prova automatizada já disponível | Lacuna para aceite real |
|---|---|---|
| H01 | Contrato da capacidade 1 base | Compra de 10 Riqueza e criação em ficha real restaurada |
| H02 | Contrato 2 por melhoria, teste de 1+2+2 | Compras repetidas, 4 agentes e histórico de Riqueza |
| H03 | SQL reconciliação e comprovação do ledger | Duas contratações reais, valor e idempotência |
| H04 | Motor de custos/recursos | Saldo insuficiente e não alteração de ledger |
| H05 | Operações isoladas | Sessões reais e dois agentes em paralelo |
| H06 | Rotas, 1 désdia = 10 dias, ano/festivais | Percurso com mar, retorno e fechamento durável no Hub |
| H07 | Rotas ausentes e Lei pendente | NPC alvo sem fonte homologada e interface sem valor falso |
| H08 | RLS SQL e tentativas de outra Casa | Tráfego real e JWT de A/B |
| H09 | Lei regional base e consulta privada de alvo | Regra aprovada para contramedidas e NPC |
| H10 | Fórmula de cobertura pura e materialização | Carta 4/8 revisada pelo Narrador |
| H11 | Testes SQL carta selada e liberada | Verificação em interface, cache e export |
| H12 | RLS e RPCs de leitura da própria Casa | Requests por ID de carta alheia com JWT |
| H13 | RPC de conclusão excepcional | Autoria/motivo e Hub imutável em clone |
| H14 | SQL dois trechos, salto e replay | Avanços de désdias usando consumidor regional **durável** |
| H15 | SQL retrocesso preserva entregas | Reconciliação real após mudança de data e desconexão |
| H16 | RPC decisão e guardas de posses | Captura e custos em ambiente restaurado |
| H17 | Contratos RLS e projeção seletiva | Export, busca, logs e notificações com identidades reais |
| H18 | Testes unitários de UI | Playwright mobile, teclado e acessibilidade |
| H19 | Revogação em PG isolado (novo) | JWT real revogado com cache e sessão viva |
| H20 | Dossiê materializado/histórico | Retorno real e preservação da versão anterior |

## Pendências bloqueadoras verificadas

1. **Backup real e ensaio de restauração:** sem evidência restaurável do banco gerenciado. A antiga cópia de homologação tinha 0 Casas, 0 missivas, 0 ledger e apenas 1 migração registrada, enquanto a última inspeção da produção identificou 8 fichas, 111 missivas, 30 lançamentos e 40 migrações. Os números são históricos e devem ser **recontados** num snapshot restaurado; não copiar apenas tabelas de `public`, preservar também `auth`, `storage` e `drizzle`.
2. **Reconciliação de Drizzle:** o journal tem 42 entradas e a produção registrava 40; `0042` já deixou 6 evidências de importação e **não deve ser repetida cegamente**. O alinhamento final deve acompanhar hashes e cargas SQL. O SQL novo é `REVIEW_ONLY`, fora do migrador.
3. **Integração durável de rodadas regionais:** `0083_spy_harptos_desdia_REVIEW_ONLY.sql` e `round-calendar.ts` projetam corretamente 10 dias ordinários, mas `0076_spy_temporal_REVIEW_ONLY.sql` ainda processa segmentos físicos e `0078_spy_mission_routes_REVIEW_ONLY.sql` usa `base_days` legado. **Não declarar H06/H14 aceitos** até unir a agenda em désdias à persistência/consumer e testar replay, cancelamento, feriados e retrocesso.
4. **Dados de navegação:** fronteiras terrestres e atalhos marítimos ainda requerem aprovação do Narrador a partir de mapa-fonte; não inventar distâncias ou rotas.
5. **Dificuldade por Casa e NPC:** a Lei basal **pública** de região é implementada. A Lei-alvo privada, contramedidas, dificuldade efetiva e política de sucesso ainda requerem regra aprovada. Não inventar porcentagens.
6. **Homologação de UI e assinaturas:** nenhum dos 20 cenários foi executado e assinado em cópia restaurada com identidades reais; faltam exportação, mobile, recuperação, revogação e evidência de rollback.

## Como executar e registrar

1. Obter backup gerenciado e restaurá-lo num PostgreSQL segregado. Comparar tabelas, registros de migração, ledger, missivas e vínculo de anexos; gerar evidência com localização/ID verificável.
2. Aplicar scripts **somente** após reconciliar o journal e revisar políticas e assinaturas. Rodar `docs/espionage/sql/homologation_preflight_READ_ONLY.sql` no clone e guardar saída. Repetir após a migração homologada.
3. Executar H01–H20 com logins reais A/B, Narrador e NPC. Anexar artefatos concretos e commit exato a cada entrada de `homologation-signoff.json`. Não usar resultados sintéticos de CI como prova.
4. Rodar `node scripts/espionage-homologation-report.mjs --markdown` para consultar lacunas. `node scripts/espionage-release-gate.mjs --enforce` **deve falhar** até todas as evidências serem aceitas.
5. Confirmar rollback ensaiado, janela de migração, revisão independente de código/RLS, consentimento explícito do Narrador e `GO`. O script nunca executa produção.

### Política de evidência

As 20 entradas precisam ter `status: ACCEPTED`, `reviewerId`, `executedAt`, `reviewedCommit` e **URL distinta de evidência real**. O objeto geral deve identificar o staging **restaurado de produção**, seu backup e assinatura do Narrador. Links de exemplo, estados pendentes, commits divergentes, registros duplicados ou checklists incompletos dão `NO_GO`.

**Resultado deste lote:** preparação de controles automatizados e auditoria, sem migração, merge ou publicação real.
