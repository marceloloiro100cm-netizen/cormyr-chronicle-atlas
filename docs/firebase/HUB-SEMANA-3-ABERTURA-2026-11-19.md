# HUB Temporal — abertura da 3ª désdia e rodada 3

Decisão do proprietário em 19/11/2026: **abrir a semana/rodada 3**;
no calendário de Harptos, a 3ª désdia começa no **dia 21** (e não no
dia 20, que pertence à segunda désdia).

## Sem alteração de dados históricos

O botão do HUB `Preparar 3ª désdia e rodada 3 com a data oficial`
consulta a visão Firebase **autenticada como Narrador**, obtém o mês,
ano e versão do snapshot importado, e grava uma **proposta pendente**
com:
- `proposedDate.day: 21`;
- `proposedOpenRound: 3`;
- `expectedCalendarVersion` e `expectedDraftVersion` obtidas do
  Firestore pelo endpoint existente e verificadas de novo na transação;
- mês e ano preservados a partir do registro oficial (nunca definidos
  a partir da data do computador nem assumidos por fixtures).

A operação é recusada pela interface quando o snapshot contém festival
ou data posterior ao dia 21, para não retroceder o tempo. Não define um
mês ou ano arbitrário; o serviço exige Auth habilitado, perfil Narrador
ativo e estágio histórico completo. O formulário manual permanece
acessível para outros ciclos da campanha.

## Publicação e confirmação

A proposta **não** abre a rodada. O Narrador verifica o resumo salvo,
confirma a adoção da origem no Firebase e utiliza a publicação existente.
A transação única de inicialização preserva `migration*`, cria a versão
operacional e alinha `campaignCloudRuntime` /
`campaignMailRuntime` com a mesma rodada e versão, além de numerar
o Jornal a partir das edições históricas verificadas.

A resposta de confirmação do HUB foi reforçada: ela só diz que um
calendário foi publicado se ele é válido, foi aprovado pelo Narrador e
referencia o snapshot e versão corretos. O estado das Missivas é conferido
**independentemente**, inclusive pela versão do calendário e rodada nas
duas raízes. O HUB mostra explicitamente a data operacional e a rodada
verificadas. Flags incoerentes não podem produzir um sucesso fictício.

## Limites operacionais honestos

Este PR **não** executa uma sessão autenticada de Narrador, não
aproveita um token de terceiros, não confirma o delta da origem viva
e não contorna autorização de ambiente GitHub. Build/Validate verdes
e commit em `main` **não** provam que o Firebase App Hosting esteja
servindo essa revisão. Verificar rollout efetivamente servido; se o
acesso protegido continuar bloqueado, manter o `NO_GO` dos dados
e escritas não auditados.

Traduções continuam fora do escopo e desabilitadas.
