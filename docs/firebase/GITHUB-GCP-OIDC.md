# Conectar GitHub Actions ao Google Cloud `cormyr` — sem chaves permanentes

**Estado:** preparação em PR. Nenhum acesso Cloud Shell ou Google Cloud foi recebido por esta conversa. Nenhuma credencial, usuário, Firestore, Storage ou app foi alterado por este PR.

## Objetivo

Permitir que workflows *aprovados*, executados no branch `main` deste repositório, se autentiquem no projeto Google Cloud `cormyr` via GitHub OIDC/Workload Identity Federation, sem JSON de conta de serviço.

O pool confia **somente** na identidade imutável do repositório GitHub ID `1436424408` e em `refs/heads/main`. O usuário concede a uma conta de serviço apenas o direito de ser representada por esse GitHub workflow. **A conta de serviço não recebe papéis de acesso aos dados**, que serão adicionados em etapa específica e com escopo mínimo.

## A única intervenção inicial no Cloud Shell

No Cloud Shell, autenticado com uma conta capaz de configurar IAM no projeto Google Cloud `cormyr`:

~~~bash
cd ~/cormyr-chronicle-atlas
git fetch origin feat/firebase-gcp-oidc-readonly-20261113
git worktree add --detach /tmp/cormyr-gcp-setup FETCH_HEAD
bash /tmp/cormyr-gcp-setup/scripts/firebase/configure-github-oidc-readonly.sh
~~~

O script pode criar e ativar as APIs de IAM, um pool/provedor OIDC e a conta de serviço **sem permissões de dados**. Repetir a configuração reconhece os recursos existentes e recusa uma condição de confiança incompatível. Exige privilégios IAM do proprietário; não solicitar senhas nem JSON privados ao ChatGPT.

A saída exibirá duas variáveis **não secretas**:

- `CORMYR_GCP_WIF_PROVIDER` — caminho do provedor WIF
- `CORMYR_GCP_READONLY_SA` — e-mail da conta de serviço

Configure em **GitHub → repositório Cormyr → Settings → Secrets and variables → Actions → Variables → New repository variable**. Estas são variáveis, **não** os valores de senha ou de uma chave de serviço.

Depois de revisar e integrar o PR, abra **Actions → Cormyr Firebase - verify GCP identity (no data access) → Run workflow (branch main)**.

A verificação troca o token OIDC por credenciais Google temporárias, valida o projeto esperado e descarta o token. Ela não enumera usuários, não lê Storage, não cria dados Firestore e não altera produção.

## Etapa seguinte, depois de autenticação comprovada

1. Criar permissões **somente leitura**, restritas aos recursos privados necessários para a auditoria, e um workflow separado de inspeção com saídas agregadas.
2. Preparar scripts idempotentes para migrar Auth e Firestore para um destino de homologação, preservando UIDs, vínculos de Casa, registros sensíveis e caminhos de mídia.
3. Exigir revisão humana antes de permissões de escrita, importação parcial, publicação de regras ou corte de produção.
4. Após testes de acesso por personagem/Casa, narrador/editor, missivas, Hub Temporal, espionagem e jornal, fazer um último backup da origem e reconciliar o delta antes do corte.

**Atenção:** GitHub Actions não é o Cloud Shell pessoal. A autorização permite que o workflow aprovado aja no Google Cloud com os papéis concedidos; a conversa continua sem terminal remoto interativo. Não fornecer `roles/owner`, `roles/editor` nem chaves permanentes à conta de serviço. Nunca publicar dumps, usuários, senhas ou hashes no repositório público ou logs.

Fontes: https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines e https://github.com/google-github-actions/auth.
