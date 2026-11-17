# Cormyr — liberação rápida dos jogadores (preparo GitHub-only)

## Escopo da entrega

O objetivo é preparar a primeira liberação **sem Cloud Shell, sem Supabase e
sem modificar produção antes dos testes reais**. A partir deste lote,
código, contratos, build, pré-verificações públicas e PRs podem ser
conduzidos pelo GitHub. O acesso administrativo ao Firebase continua uma
etapa distinta, a ser autorizada quando estiver disponível.

O projeto oficial é `cormyr`; o portal é
`https://atlas.cormyr.com.br/firebase-access`.

## Últimas evidências reais (16/11/2026)

A última auditoria autorizada no Cloud Shell foi executada somente para
leitura e confirmou:

| Item | Evidência |
| --- | --- |
| Auth importado e vinculado ao Firestore | 14 de 14 contas |
| Contas Auth desativadas | 14 de 14 |
| Narrador com perfil estruturalmente apto | 1 de 1 |
| Jogadores com perfil estruturalmente apto | 8 de 10 |
| Editor estruturalmente apto | 1 de 1 |
| Perfis ausentes | 2 |
| Jogadores sem Casa | 2 |
| Casas em snapshot privado | 11, das quais 10 ativas na temporada 2 |
| Referências dos jogadores a Casas ativas | 8, com 0 inválidas |

Essas contagens são históricas; não demonstram que os dados estão
reconciliados com a origem mais recente, nem que as contas podem fazer
login. Os 14 usuários continuam desativados na última leitura real.

Na última observação Cloud, `migrationPublicContentStage`,
`campaignCloudRuntime` e `campaignMailRuntime` estavam ausentes.
A identidade OIDC GitHub consegue ler metadados do App Hosting, mas
encontrou HTTP 403 no Firestore e HTTP 400 na lista do Firebase Auth.
**Um workflow verde não supera essas restrições.**

## Etapa A: quatro atividades que podem ser realizadas pelo GitHub

1. **Interface do piloto.** `/firebase-access` exibe sinais limitados
   da sessão: identidade, prova de acesso, leitura da Casa, calendário e
   correio. Os sinais são descritivos, não autorizam escrita e são
   calculados sem identificadores privados ou exposição de hashes.
2. **Serviços/contratos.** `scripts/firebase/player-pilot-preflight.mjs`
   consulta por GET anônimo quatro rotas do site oficial, sem ler corpos
   HTTP, sem cookies e sem seguir redirecionamentos. O relatório jamais
   retorna `readyForPlayers=true`. Testes sintéticos verificam que
   respostas 503 e 302 não são consideradas sucesso.
3. **CI e integração.** Executar
   `Firebase player pilot — GitHub-only preflight` e os workflows
   existentes `Validate`, `Build check`,
   `Firebase cross-domain acceptance — isolated emulator` e
   `Firebase App Hosting - live revision read-only audit`.
   Fazer merge apenas com contratos e CI verdes. A revisão servida pelo
   domínio deve ser confirmada depois do rollout automático, sem
   presumir que `main` é necessariamente a versão em produção.
4. **Publicação/rollback preparados.** Publicar apenas código seguro
   em `main` com a trava `CORMYR_ARCHIVE_ONLY=true`. Sem ativação de
   login, sem flags de escrita, sem mudança de DNS e sem provisionar
   dados de campanha. Registrar PR, commit e revisão servida.

## Etapa B: portas obrigatórias para a primeira mesa jogável

Estas exigem uma identidade administradora **separada** e aceite
funcional verdadeiro; não podem ser satisfeitas pela conta OIDC atual.

- **Dados e runtime:** confirmar backup/delta real e conciliar o
  snapshot, Casas, calendário, correio e operações, sem criar um
  `campaignCloudRuntime` fictício ou `applicationEnabled=true`
  apenas para destravar interfaces.
- **Firebase Auth:** validar provedores/senhas, vínculo de perfis e
  controle de credenciais, ativando **individualmente** o Narrador e
  dois jogadores de Casas distintas para homologação. Não habilitar
  as 14 contas em lote. As duas contas sem perfil e os dois jogadores
  sem Casa permanecem bloqueados até decisão administrativa.
- **Escopo por usuário:** testar Narrador, Jogador A, Jogador B, Editor
  e anônimo. Casa própria 200; Casa alheia 403; anônimo 401;
  Editor sem ficha privada 403. Registrar somente resultados e códigos,
  nunca usuários, tokens, e-mails, nomes de Casas ou conteúdos.
- **Escritas básicas:** provar envio/leitura/resposta de missiva e
  persistência de calendário por recarga e nova sessão, sem alterar
  registros históricos; confirmar idempotência, permissões e rollback.
  Não apresentar a campanha como jogável enquanto o correio e as
  transações operacionais estiverem 503.
- **Lançamento:** após essas provas, liberar gradualmente até os oito
  jogadores com vínculo estruturalmente apto. Confirmar revisão exata
  em tráfego, funcionamento do login e autorização real por Casa.

Jornal, espionagem, batalha, Drive e traduções públicas podem ser
adicionados em fases posteriores **se permanecerem inacessíveis** até
suas homologações e não forem essenciais à primeira sessão.

## Rollback: execução sem Supabase

**Ponto de retorno é uma revisão Firebase segura, não o banco antigo.**
O sistema não deve religar Supabase como rota alternativa, nem reescrever
o histórico de Git.

1. Se uma alteração **somente de código/interface** gerar regressão,
   abrir um PR de `Revert` no GitHub contra a alteração específica,
   executar `Build check` e `Validate`, fazer merge e confirmar com o
   auditor App Hosting que a revisão segura passou a receber 100% do
   tráfego. Um merge/revert **não prova** que o rollout ocorreu.
2. Se o problema envolver autenticação, permissões ou gravações reais,
   **interromper a ampliação** para outros jogadores e desabilitar
   recursos de escrita apenas pela identidade administradora
   autorizada. O GitHub OIDC atual **não** pode mudar essas flags.
   Não anunciar rollback como concluído sem confirmar a mudança
   operacional.
3. Se dados tiverem sido escritos durante o piloto, preservar os eventos
   e versões para reconciliação antes de restaurar um snapshot. Não
   restaurar backup por cima de dados novos nem apagar contas ou
   transferências.
4. Nunca fazer force push, desligar logs, remover regras, conceder
   `roles/owner` à automação ou abrir leitura pública ao Firestore
   para contornar 403. Na dúvida, manter `NO_GO`.

## Estado atual e ação seguinte

O workflow `Firebase player pilot — GitHub-only preflight` pode
ser reexecutado na aba Actions a qualquer momento, **sem terminal**.
Ele mede disponibilidade de páginas públicas, não credenciais nem
permissões internas. A autorização de publicação continua pendente:
`readyForPlayers=false`, `readyForCutover=false`.

Quando o acesso administrativo ao Firebase retornar, a prioridade
será executar a **Etapa B** com um Narrador e dois jogadores de teste,
e não repetir a migração histórica inteira.
