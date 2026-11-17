# Revisão dos workflows do GitHub Actions (17/11/2026)

O repositório tem 60 workflows, 52 deles do Firebase. A maioria roda em todo
push e pull request (com filtro de caminhos). Entre 14 e 17/11 houve 249
commits, e quase metade deles foram auditorias, diagnósticos ou testes de
verificação. Vários auditores têm `releaseDecision=NO_GO` fixo no código, ou
seja, nunca podem aprovar nada sozinhos. Isso cria um ciclo: cada rodada
acrescenta mais checagens, e a migração em si não avança.

Este documento só recomenda. **Nenhum workflow foi apagado ou desligado
neste PR**: a decisão é do proprietário.

## Manter (essenciais)

| Workflow | Por quê |
|---|---|
| `validate.yml` | Build, TypeScript, testes e privacidade do repositório |
| `build-check.yml` | Confirma a saída Node usada pelo App Hosting |
| `firebase-cross-domain-acceptance.yml` | As 20 integrações em emulador, num lugar só |
| `firebase-lot5-security-e2e.yml` | Matriz de permissões por perfil no emulador |
| `firebase-apphosting-domain-smoke.yml` | Confere se atlas.cormyr.com.br responde |
| `firebase-cloud-operator-readiness.yml` | Auditoria protegida usada para acompanhar vínculos e estágios |
| `refresh-lockfile.yml` | Regera o `bun.lock` em branches de migração |

## Consolidar (sobrepostos)

Rodam testes de emulador de um domínio que já estão cobertos pelo
`firebase-cross-domain-acceptance.yml` ou pelo `firebase-unified-emulators.yml`.
Sugestão: passar para `workflow_dispatch` (só manual) ou apagar.

- Missivas: `firebase-mail-commands`, `firebase-mail-history`,
  `firebase-mail-inbox`, `firebase-mail-unified`, `firebase-read-receipts`
- Espionagem: `firebase-spy-agents`, `firebase-spy-intel`, `firebase-spy-missions`
- Jornal: `firebase-newspaper`, `firebase-newspaper-staging`
- Calendário: `firebase-time-engine`, `firebase-temporal-staging`
- Casas e registros: `firebase-noble-house`, `firebase-characters`,
  `firebase-records`, `firebase-private-gm`, `firebase-schedule`, `firebase-residual`
- Storage: `firebase-storage-access`, `firebase-storage-offline-coverage`,
  `firebase-storage-scoped-audit`

## Passar para manual (`workflow_dispatch`)

Auditorias de prontidão que rodam em todo push sem filtro de caminhos ou
consultam o Cloud repetidamente, sempre com o mesmo resultado `NO_GO`:

- `firebase-apphosting-live-revision-readonly.yml`
- `firebase-apphosting-release-convergence.yml`
- `firebase-player-pilot-preflight.yml`
- `firebase-production-acceptance.yml`
- `firebase-domain-bridge.yml`
- `firebase-18-item-execution.yml`
- `firebase-lots-6-9-readiness.yml`
- `firebase-coverage.yml`
- `firebase-auth-14-readonly-diagnostic.yml` (roda em push e PR usando OIDC
  no Cloud; o operador já tem a auditoria protegida)

## Regra para as próximas rodadas

Não criar novos auditores, diagnósticos ou documentos de prontidão. Cada
nova rodada deve fechar uma operação concreta da lista:

1. ativar o piloto de leitura (`ATIVAR-PILOTO-LEITURA.md`);
2. corrigir os vínculos (`VINCULOS-PENDENTES-FORMULARIO.md`);
3. teste real, parte A (`ROTEIRO-TESTE-REAL-POR-PERFIL.md`);
4. criar os runtimes de gravação e fazer a parte B;
5. remover o código Supabase por domínio (`MAPA-DEPENDENCIAS-SUPABASE-2026-11-17.md`).
