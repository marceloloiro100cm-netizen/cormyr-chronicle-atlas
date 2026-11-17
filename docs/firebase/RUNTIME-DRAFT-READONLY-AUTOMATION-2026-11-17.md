# Pré-visualização automática — sem aprovação para leitura

O workflow de bootstrap mantém o job de gravação `protected-bootstrap` atrás da revisão obrigatória `firebase-auth-test-activation` e só o executa no modo literal `apply`. A leitura foi separada em `readonly-preview`, usando somente a conta `cormyr-gh-reader@cormyr.iam.gserviceaccount.com`, credencial temporária OIDC e o modo literal `preview`. O job de leitura executa automaticamente em pushes que alteram o bootstrap e também pode ser solicitado via `workflow_dispatch` no modo preview.

A consulta não altera documento, perfil ou flag e nunca devolve snapshot, data, uid ou nome de Casa. Se a conta de leitura não tiver autorização, deve falhar em segurança, sem elevar IAM nem usar o operador de escrita. O job protegido de criação continua aguardando aprovação humana e confirmação exata.

A separação de concorrência entre push e execução manual impede que uma aprovação de escrita pendente bloqueie o diagnóstico de leitura. A implementação não comprova criação de runtimes, homologação de dados ou liberação de jogadores.