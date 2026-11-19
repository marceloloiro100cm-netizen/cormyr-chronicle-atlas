# Gestão de contas do Firebase, etapa 3

## Estado de liberação

A rota `POST /api/firebase-accounts` utiliza Firebase Admin Auth e Firestore no
projeto `cormyr`. O acesso de escrita é condicionado à variável
`CORMYR_FIREBASE_ACCOUNTS_ENABLED`, definida como `false` em `apphosting.yaml`
até o aceite de ponta a ponta. O código não substitui a migração imutável.

## Estrutura

- Autorização histórica: `migrationDomainStage/{snapshot}/access/{uid}`,
  preservada. O administrador não pode editar esse snapshot.
- Acesso atual: `campaignCloudRuntime/{snapshot}/accountAccess/{uid}`.
- Idempotência: `campaignCloudRuntime/{snapshot}/accountRequests/{digest}`.
- Auditoria: `campaignCloudRuntime/{snapshot}/accountAudits/{digest}`,
  com ator, ação, alvo, versão e data, sem senha.
- O Firebase Auth mantém as credenciais e o estado de desabilitação.
- O Narrador só escreve depois de verificar o próprio token, escopo ativo,
  raiz operacional reconciliada e Casa da temporada 2.
- Uma Casa escolhida no formulário não concede acesso: o servidor compara
  suas referências com a coleção privada de Casas autorizadas.

## Funcionalidades preparadas

- Cadastrar jogadores e Editor-Chefe com e-mail e senha inicial.
- Editar nome, atividade, Casas e permissões de edição, preservando o perfil.
- Desativar e reativar a autenticação com conferência no Firebase Auth.
- Exigir troca de senha antes da primeira leitura privada da campanha.
- Evitar conflitos usando `expectedVersion` e `requestKey`.
- Manter o painel antigo fora do Firebase; no Conselho novo, a revisão de
  contas e o gerenciamento operacional aparecem em área restrita.

## Restrições deliberadas

Alterar o e-mail ou transferir entre perfis existentes exige outra revisão
de identidade. As permissões importadas do Narrador nunca são promovidas
por essas rotas. O Auth e o Firestore não oferecem uma única transação
atômica entre provedores: uma falha na autorização mantém uma nova conta
desabilitada, e a repetição da chave pode reconciliar a habilitação.

Os leitores de permissões são atualizados gradualmente para resolver a
autorização operacional atual, com recusa por padrão de qualquer perfil
inconsistente. O código ainda necessita de um aceite real de isolamento
de dados entre Casas antes de ativar a flag.

## Aceite exigido antes da ativação

1. Login do Narrador, criação de conta de teste e obrigatoriedade de senha.
2. Login da conta de teste após a troca de senha, sem acesso a outra Casa.
3. Editar vínculo, desativar, testar bloqueio imediato e reativar.
4. Confirmar ausência de permissões indevidas em Missivas, Jornal, Ficha,
   Tesouro e consultas de economia operacional.
5. Repetir a mesma chave para comprovar idempotência; usar versão antiga
   para comprovar recusa, sem alteração de dados.
6. Conferir auditorias e que nenhum documento da migração foi alterado.
7. Só então alterar a flag em novo PR, passar CI, merge e confirmar
   a revisão efetivamente servida no Firebase App Hosting.
