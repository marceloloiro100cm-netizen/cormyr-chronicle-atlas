# Runbook de corte: freeze, delta, DNS, deploy e rollback

Plano para a troca definitiva da origem (Supabase) pelo Firebase. **Nada aqui foi executado.** `readyForCutover` continua `false` e só muda quando todos os portões da seção 1 estiverem cumpridos e registrados. Este documento não autoriza nenhuma ação em produção: cada etapa precisa da confirmação do proprietário.

## 1. Portões (todos precisam estar cumpridos)

| # | Portão | Como se verifica | Estado em 14/11/2026 |
| --- | --- | --- | --- |
| 1 | Todos os domínios com serviço transacional no emulador | Workflows `firebase-*` verdes em `main` | Casas, missivas, calendário, jornal, espionagem (agentes, missões, inteligência) e batalha prontos |
| 2 | Toda tabela de dado com stager e sem perda | `audit-stager-coverage.mjs`: lista `unconsumed` só com infraestrutura | Resta Storage (fluxo próprio) e infraestrutura (`cron`, migrações, `realtime`, `vault`, sessões do Auth) |
| 3 | Identidade completa | Contas, provedores OAuth, duas contas sem perfil, UIDs preservados | Emulador ok; **importação para a nuvem é decisão do proprietário** |
| 4 | Aplicativo lendo do Firebase | Adaptadores por domínio atrás da trava `selectAuthBackend`; costura de auth cliente e servidor | **Não feito**: só a costura de autenticação existe, sem ligar |
| 5 | Testes E2E por papel | Anônimo, jogador, membro de outra Casa, editor e Narrador, por domínio | **Não feito** |
| 6 | Storage verificado | Objetos, hashes e permissões (`STORAGE-EXPORT.md`, `STORAGE-SCOPED-ACCESS-HOMOLOGATION.md`) | Parcial |
| 7 | Rotinas agendadas | Job de `publishDue` (jornal) e `advanceMissions` (espionagem) no Cloud Scheduler | **Pendência do proprietário** |
| 8 | Segredos e credenciais | `SUPABASE_SERVICE_ROLE_KEY` real, credenciais do Google Drive | **Pendência do proprietário** |
| 9 | Domínio definitivo e URLs de redirecionamento do Supabase Auth | Domínio decidido e URLs cadastradas | Domínio definido: `https://atlas.cormyr.com.br` (smoke externo de 15/11: estático, login e retrato 200). **Falta** a revisão publicada incluir a rota de Auth (issue #472) e confirmar as URLs de redirecionamento do Supabase Auth |

Enquanto os portões 3 a 9 não forem cumpridos, o corte não deve ser agendado.

## 2. Preparação (D-7 a D-1)

1. Ensaio completo no emulador com o backup mais recente: todos os stagers com `--execute-emulator`, depois todos os workflows de integração. Registrar só contagens.
2. Reconciliação por contagem e hash, tabela a tabela, entre o backup e o estágio: cada stager já devolve `sourceCounts` e `stagedCounts`; a diferença precisa ser zero e `coverageComplete` verdadeiro.
3. Congelar a lista de segredos e o inventário de acessos (`campaign_access_profiles`, `house_memberships`).
4. Definir a janela de corte com a Mesa (jogadores avisados) e o responsável pelo rollback.
5. Confirmar que o rollback da seção 6 foi ensaiado no emulador.

## 3. Freeze (T0)

1. Colocar o app atual em modo somente leitura: bloquear escrita pelo Supabase (RLS temporária ou chave de escrita revogada), sem apagar nada.
2. Pausar os jobs que escrevem: sincronização do Drive, entregas semanais, avanço do Hub Temporal.
3. Registrar o instante do freeze e a contagem de linhas por tabela na origem.

## 4. Backup final e delta

1. Gerar o backup completo após o freeze e validar o SHA-256 (`BACKUP-EXECUTION.md`).
2. Rodar `audit-migration-coverage.mjs` e `audit-stager-coverage.mjs` sobre esse backup: nenhuma tabela nova sem stager.
3. O delta é a diferença entre o último backup ensaiado e o backup final. Como o freeze impede novas escritas, o caminho seguro é **repetir os stagers inteiros** sobre o backup final, não aplicar diffs linha a linha. O dry-run precisa devolver `planValid: true` em todos.
4. Importar na nuvem na ordem: Auth, domínio tipado, missivas, calendário e tempo, casas e fichas, jornal, espionagem, batalha, resíduo. Cada passo só com contagens.
5. Storage: copiar os objetos e conferir hash e contagem (783 objetos em `storage.objects` no backup de 12/11).

## 5. Verificação antes de apontar o tráfego

1. Contagens e hashes da nuvem iguais às do backup final, domínio a domínio.
2. E2E por papel contra o backend real de homologação (portão 5).
3. Regras do Firestore e do Storage publicadas e testadas: leitura anônima negada, jogador de outra Casa negado.
4. Fumaça com a conta do Narrador e uma conta de jogador: login, ficha, missiva, jornal, missão, batalha.
5. Só então: trocar a trava para Firebase no ambiente de homologação, depois em produção.

## 6. DNS, deploy e rollback

1. Reduzir o TTL do DNS para o mínimo em D-2.
2. Deploy da versão com a trava em Firebase (`apphosting`), mantendo a versão anterior disponível.
3. Apontar o domínio e as URLs de redirecionamento do Auth. Observar logs e taxa de erro por 30 minutos.
4. **Critério de rollback** (qualquer um): falha de login em massa, divergência de contagem, erro de permissão em papel esperado, perda de escrita. Decisão do proprietário.
5. **Rollback**: reverter a trava para Supabase, reapontar o DNS, reabrir a escrita na origem (que ficou intacta). Qualquer escrita feita no Firebase após o corte é exportada e reconciliada à mão antes de reabrir; por isso a origem não é apagada.

## 7. Desativação da origem

Só após um período de observação combinado (sugestão: 14 dias sem rollback) e um backup final arquivado: revogar chaves do Supabase, desligar os jobs antigos e guardar o backup verificado. Nunca antes.

## 8. O que este plano ainda não cobre

Mapeamento dos UIDs do Auth para a nuvem, adaptadores por domínio e E2E por papel (portões 3 a 5), e a decisão do proprietário sobre domínio e hospedagem final.

## Registro de 15/11/2026: domínio e revisão publicada

- O domínio `atlas.cormyr.com.br` responde (home, `/auth`, retrato e rota pública 200 ou 400 previsto).
- A auditoria somente leitura do App Hosting encontrou um único backend, `cormyr-preview` (us-east4), com o domínio associado, branch `main`, último rollout `SUCCEEDED` e **rollouts automáticos desativados**. A API não permitiu provar qual commit recebe o tráfego (`domainServingCommit: null`).
- `/api/firebase-auth-verify` continua 404 no domínio, embora a `main` tenha a rota. O quadro é compatível com uma revisão antiga em tráfego. A ação é do proprietário: criar um novo rollout a partir da `main` (Console do App Hosting, ou `firebase apphosting:rollouts:create cormyr-preview --git-branch main`) e repetir o smoke do domínio. Nada foi alterado por esta auditoria.
