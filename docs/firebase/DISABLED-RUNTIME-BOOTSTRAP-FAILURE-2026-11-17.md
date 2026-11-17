# Runtime drafts — diagnóstico protegido da falha (17/11/2026)

A execução protegida [#44143405626](https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas/actions/runs/44143405626) recebeu aprovação, iniciou o comando real e retornou falha genérica `runtime_draft_not_completed`. Esse retorno **não comprova** que a permissão IAM ou o snapshot falharam, nem que algum root tenha sido criado.

Este patch modifica exclusivamente a instrumentação diagnóstica: códigos e fases enumerados, sem mensagens do provedor, IDs de documento, dados de Casas, calendário, e-mails ou logs de credenciais. A fase indica se a falha ocorreu na leitura de snapshot, verificação histórica ou transação; o motivo distingue permissões negadas, indisponibilidade, conflito de transação, fontes ausentes e outros. O workflow continua protegendo a execução apply por revisão do ambiente GitHub e confirmação literal.

Não altera estado de jogo nem tenta contornar IAM. Até verificar o resultado real, a criação é **não confirmada** e o cutover permanece `NO_GO`.
