# Execução dos 18 itens da lista de migração — evidências e bloqueios

**Data:** 15/11/2026. **Escopo solicitado:** itens **6, 9 e 11–26**
(18 frentes ao todo). A revisão deste documento usa a árvore GitHub do
Cormyr e não conecta a origem Supabase nem escreve no Firebase Cloud.

## Como medir a execução sem inventar um percentual

O comando **somente leitura** `node scripts/firebase/execute-18-items-readiness.mjs`
verifica a existência dos contratos de implementação do repositório e as
invariantes da `lot9-cutover-gate.mjs`. Cada campo apresenta explicitamente:

- `sourceContractsFound/Expected`: presença física dos arquivos; **não** é teste funcional;
- `emulatorProofInThisReport=false`: o inventário não executa o emulador; a
  [suíte separada de 20 integrações](CROSS-DOMAIN-ACCEPTANCE.md) o faz em
  Auth/Firestore Emulator com dados sintéticos;
- `realCloudE2EVerified=false`: nenhum dos 18 itens possui aceite no Cloud
  definitivo por causa da ausência de migração de usuários/dados e provas
  por perfil;
- `readyForCutover=false` e `decision=NO_GO` sempre.

**Não usar a contagem de contratos existentes como percentual de conclusão.**
A produção usa Firebase App Hosting para servir a aplicação **com Supabase
como origem de login e dados**. O check do rollout mede a publicação do
frontend e servidor, não a importação de Firestore/Auth/Storage.

## Itens 6, 9, 11–26

| Item | Frente | Evidência executável disponível | Não comprovado |
| --- | --- | --- | --- |
| 6 | Missivas ambíguas | Stager e testes de histórico privado; proteção de quarentena | Conciliação das cartas ambíguas da origem viva |
| 9 | Perfis | Matriz RLS simulada + diagnóstico da própria conta | Firebase Auth Cloud com identidades e papéis reais |
| 11 | Casas, fichas e ledger | `noble-house-service.integration.mjs` | Igualdade das operações com as fichas atuais na nuvem |
| 12 | Missivas | Comandos, caixa unificada e histórico em emulador | Envio, edição e efeitos reais com contas migradas |
| 13 | Jornal | Serviço transacional e testes no emulador | Publicação no backend Firebase Cloud integrado ao site |
| 14 | Hub Temporal | `time-service.integration.mjs` e polling isolado | Avanços e consequências reais com rollback |
| 15 | Espionagem | Agentes, missões, inteligência em emulador | Dossiês e visibilidade com dados reais |
| 16 | Batalha | Serviço e testes de batalha em emulador | Simulação completa E2E com exércitos reais e IA |
| 17 | Acervo e personagens | Serviços de personagens, registros e Narrador | PDFs/documentos privados na nuvem |
| 18 | Adaptadores | Contratos de leitura, cliente e proxy local | Troca efetiva de `src/start.ts` e telas pelo Firebase |
| 19 | Realtime | Polling do calendário isolado, testes unitários | Notificações e substituição de Realtime em produção |
| 20 | Storage | Resolvers de escopo e testes de acesso | Igualdade de bytes e ACLs dos cinco buckets |
| 21 | Google Drive | Serviço de domínio e adaptador de leitura testados | OAuth real, escrita ETag e conflitos da origem |
| 22 | Agendamentos | Runner local com auth/idempotência | Cloud Scheduler real, sem duplicação de cron |
| 23 | Segurança | Matriz dos cinco papéis e revogação no emulador | Regras de segurança com usuários reais no Cloud |
| 24 | E2E | 20 testes sintéticos integrados em cinco grupos | Navegador, arquivos e contas de homologação Cloud |
| 25 | Performance | Monitor público de latência limitada e CI | Carga/custo/latência com leitura e escrita Firestore Cloud |
| 26 | Corte e rollback | Pré-validação `lot9` e runbook | Ensaio no Cloud com backup atual e aprovação do proprietário |

## Protocolo de aceite de código desta rodada

1. `node --test scripts/firebase/execute-18-items-readiness.test.mjs`
   comprova escopo exato, detecção de código ausente, resistência a falso
   progresso e bloqueio de corte;
2. `node scripts/firebase/execute-18-items-readiness.mjs` imprime
   somente nomes de frentes/arquivos, totais e estados, nunca conteúdo
   privado ou valores de variáveis;
3. O CI `firebase-18-item-execution.yml` exige os dois testes e a auditoria
   de repositório público;
4. `firebase-cross-domain-acceptance.yml` executa **separadamente**
   as 20 integrações existentes nos cinco grupos, com Auth e Firestore
   Emulator configurados apenas em `demo-cormyr-migration`;
5. `firebase-production-acceptance.yml` observa disponibilidade do
   servidor e negação anônima; não consulta identidade de usuários.

Um PR desta rodada pode ser integrado somente quando os checks executados
estiverem verdes. O merge pode gerar rollout automático do App Hosting,
mas nenhum contrato acima habilita Firebase Cloud como fonte.

## Bloqueadores específicos para concluir os 18 itens

- Acesso administrativo legítimo à origem do banco Supabase atual, conferência
  independente do `SUPABASE_SERVICE_ROLE_KEY` real e novo backup privado;
- Reconciliação de dados alterados desde o snapshot, tratamento de missivas
  ambíguas e verificação de UIDs/provedores OAuth;
- Projeto de homologação Cloud isolado, preenchido por importadores
  idempotentes após preflight e reconciliação;
- Comparação de checksum origem/destino em todos os cinco buckets;
- Integração transacional das telas reais ao backend Firebase;
- Testes reais por Narrador, Jogador A, Jogador B, Editor-chefe e acesso
  negado a visitantes não autenticados;
- Drive, Cloud Scheduler e rollback ensaiados com credenciais segregadas.

**Não revogar a origem, não alterar DNS, não criar sincronizações em duplicidade
e não migrar contas nem conteúdo de produção com base apenas no CI.**

## Estado factual de publicação ao preparar o inventário

A branch `main` estava no commit
`72e9facd567c55b3c65fc9dfb85bb023bf95b036` e os workflows
de validação, build, domínio e monitoramento público estavam verdes.
O usuário confirmou login de Jogador, Narrador e Editor-chefe **na
autenticação ativa Supabase**. Isso não comprova migração Firebase Auth.

As afirmações antigas nos docs `LOTS6-9-STATUS.md`, `PHASE2-ROADMAP.md`
e `APP-INTEGRATION-PLAN.md` sobre módulos 'nada portado' ou rota
`/api/firebase-auth-verify` com 404 foram escritas antes dos serviços de
emulador e do rollout manual de novembro. Devem ser interpretadas como
registros históricos, não como o estado atual.
