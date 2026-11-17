# Liberação de todas as 14 contas existentes — somente Firebase Auth

## Decisão autorizada em 17/11/2026

O proprietário mudou o escopo de homologação: **habilitar todas as 14
contas importadas**, em vez de liberar apenas Narrador e dois Jogadores.
A finalidade é testar todos os acessos. Isso **não é autorização
automática para ampliar os direitos de Casas, perfis ou escrita**.

Na última auditoria real, 14 contas estavam desativadas e 14 documentos
Auth–acesso vinculados, com 1 Narrador, 10 Jogadores, 1 Editor e 2 sem
perfil; oito vínculos com Casas ativas estavam íntegros, dois Jogadores
não possuíam Casa. Algumas contas também tinham acesso inativo ou troca
de senha pendente. Essas situações **não são corrigidas** ao apenas
mudar disabled para false no Auth.

O projeto público mantém o modo archive-only; os endpoints operacionais
de Casas, missivas, Jornal e Tesouro retornaram HTTP 503 na última
auditoria. **Permitir login não significa liberar a campanha para jogar.**

## Operação criada e limites

Workflow manual:
`.github/workflows/firebase-auth-enable-all-test-accounts.yml`

Script:
`scripts/firebase/auth-enable-all-test-accounts.mjs`

- Trabalha apenas no projeto fixo **cormyr** e somente em um único
  snapshot privado completo; exige estágio Auth historicamente completo.
- Reconsulta **todas as 14 contas Auth atuais**, verifica os 14 vínculos
  correspondentes e valida Casas referenciadas antes de qualquer mudança.
  Se houver novo usuário, conta sem vínculo, catálogo divergente, dado
  inválido ou falta de permissão, **não faz nenhuma ativação**.
- `preview` lista somente **totais agregados**, sem alteração.
- `activate` exige texto exato
  `ENABLE_ALL_14_CORMYR_TEST_ACCOUNTS`, habilita somente as contas
  previamente desativadas com `updateUser(uid,{disabled:false})`,
  uma a uma, confirmando cada atualização e o inventário final.
- É idempotente: uma conta já habilitada não recebe nova atualização.
  Falhas parciais são contabilizadas sem UIDs e **não** são declaradas
  sucesso; nunca se atribuem contas, senhas, roles, claims, Casas ou
  privilégios automaticamente.
- Nunca grava Firestore, Storage, App Hosting, DNS, IAM, Supabase,
  backups, conteúdo de missivas ou configurações de runtime.

## Pré-requisito administrativo — OIDC validado, inventário ainda bloqueado

A identidade de **somente leitura** do GitHub,
`cormyr-gh-reader@cormyr.iam.gserviceaccount.com`,
não deve receber permissão de atualizar usuários. O teste read-only de
17/11/2026 confirmou autenticação OIDC, mas a listagem Auth falhou com
`auth_inventory_permission_denied` nessa identidade específica.

A variável protegida `CORMYR_FIREBASE_AUTH_TEST_OPERATOR` já foi
observada apontando para uma identidade distinta,
`cormyr-technical-admin@cormyr.iam.gserviceaccount.com`. Na execução
#2, a autenticação OIDC dessa operadora foi bem-sucedida; o teste estava
em modo **preview**, falhou no preflight de inventário e não habilitou
nenhuma conta. O log antigo não distinguia a fase do erro. Não inferir
que a falha de permissão da *leitora* seja também a causa da falha da
*operadora*.

É necessário comprovar que a operadora possui as permissões estritamente
necessárias para `firebaseauth.users.get`,
`firebaseauth.users.update` e leitura do Firestore histórico usado
no pré-teste, sem conceder papéis amplos. Referências oficiais:
- Firebase Auth IAM: https://firebase.google.com/docs/projects/iam/permissions
- Gerenciar usuários Firebase: https://firebase.google.com/docs/auth/admin/manage-users

A identidade dedicada já está vinculada ao provedor GitHub OIDC do
projeto **cormyr** e está configurada via variável
`CORMYR_FIREBASE_AUTH_TEST_OPERATOR`. O workflow usa credenciais
temporárias por OIDC, **não** chave permanente de service account.
Autenticação OIDC confirmada não equivale a autorização no Auth/Firestore.

Recomenda-se configurar em **Settings → Environments** a proteção do
ambiente `firebase-auth-test-activation`, exigindo revisor autorizado
e restringindo à branch `main`. Não presumir que o nome do ambiente
já implica proteção; confirmar a configuração no GitHub.

Nenhum desses acessos foi criado por esta mudança. **Não executar
`activate` enquanto a identidade e o ambiente não estiverem
corretamente preparados.**

## Execução pelo navegador/GitHub Actions

1. Abrir **Actions → Firebase Auth — enable all 14 existing accounts
   for testing → Run workflow**, branch `main`.
2. Executar primeiro `mode=preview`. Conferir no resumo que são
   **14 contas e 14 vínculos** e que a lista passou pela validação
   de Casas sem dados privados ou identidades.
3. Executar `mode=activate`, com a confirmação literal
   `ENABLE_ALL_14_CORMYR_TEST_ACCOUNTS` e a revisão do ambiente
   protegido.
4. Conferir `activationComplete=true`,
   `accountsAfter=14`, `remainingDisabled=0`. Caso o job falhe
   no meio, consultar contagens agregadas e reconciliar antes de repetir.

Mesmo com as 14 habilitadas, 2 contas sem perfil e 2 jogadores sem Casa
continuam sem autorização completa de campanha, e perfis com `active=false`
ou troca de senha pendente continuam barrados pelo serviço. As rotas privadas
precisam passar pelo aceite de Narrador, Casas diferentes, Editor e anônimos,
além de missivas e calendário persistidos, antes de liberar jogo de verdade.

**Status verificado em 17/11/2026:**
- Workflow #2: aprovação de ambiente e OIDC administrativo funcionaram;
  `mode=preview` falhou no preflight (código específico ocultado pela
  versão anterior do script). Nenhum sucesso de ativação foi verificado.
- Workflow #3: ainda à espera de aprovação e usando a revisão antiga.
  Não confundir essa execução com o diagnóstico novo.
- Diagnóstico read-only #1: contratos sintéticos passaram; OIDC da conta
  leitora funcionou e a consulta real de Auth retornou
  `auth_inventory_permission_denied`. Essa conta não é a operadora.
- A correção `460ac8b` e o teste `02afad7` expõem somente códigos fixos
  de fase, sem mensagens do provedor. Novo preview real da operadora
  depende da revisão do ambiente protegido.
- Contas habilitadas: **não confirmado**; lançamento de jogadores:
  **NO_GO**.

Nunca declarar 14/14 habilitados com base somente em PR ou testes
sintéticos, nem desproteger o ambiente para contornar aprovação.
