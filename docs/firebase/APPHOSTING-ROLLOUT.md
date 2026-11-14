# Rollout no Firebase App Hosting (Fase 1)

**Atualizado em 14/11/2026.** Continua `LEAVING-LOVABLE.md`. O código foi
integrado na `main` pelo PR #431 e o CI está verde; o que falta é a
configuração autenticada no projeto Google Cloud `cormyr`. O Supabase segue
como fonte de verdade: nada aqui migra dados, altera regras ou publica regras
do Firestore e do Storage (continuam "deny all").

## O que o repositório já garante

- `apphosting.yaml` na raiz, com `NITRO_PRESET=node-server` no build.
- `scripts.buildCommand` e `scripts.runCommand` explícitos (o framework não é
  detectado automaticamente pelo App Hosting). A saída do Nitro é
  `.output/server/index.mjs`, a mesma do `npm run start`.
- `SUPABASE_SERVICE_ROLE_KEY` e `CRON_SECRET` referenciados só em tempo de
  execução. Credenciais do Google ainda comentadas (escolha pendente).
- Retratos de espiões locais em `public/spy-portraits/`.
- Node `>=22` em `engines`.

Isto **não** prova que o backend na nuvem está configurado.

## Passos no Cloud Shell (projeto `cormyr`)

Nunca cole valores de segredos em chats, issues ou commits (o repositório é
público). Os comandos abaixo pedem o valor de forma interativa.

### 1. Identificar o backend

```bash
firebase apphosting:backends:list --project cormyr
```

Já existe um backend de preview (`cormyr-preview`) cujo primeiro build falhou
antes das correções do PR #431. Duas opções: reaproveitá-lo ou criar outro.
Para criar, siga o assistente:

```bash
firebase apphosting:backends:create --project cormyr
```

No assistente, conecte o repositório
`marceloloiro100cm-netizen/cormyr-chronicle-atlas`, **branch ativa `main`** e
**pasta raiz `/`**. Para um backend existente, confirme isso no console em
App Hosting > backend > Settings > Deployment.

### 2. Criar os segredos obrigatórios

```bash
# Gere o CRON_SECRET localmente e guarde em um gerenciador de senhas
openssl rand -base64 32

firebase apphosting:secrets:set SUPABASE_SERVICE_ROLE_KEY --project cormyr
firebase apphosting:secrets:set CRON_SECRET --project cormyr
```

Quando o CLI perguntar, conceda acesso ao backend escolhido no passo 1. Se o
segredo for criado pelo console do Secret Manager, use depois:

```bash
firebase apphosting:secrets:grantaccess SUPABASE_SERVICE_ROLE_KEY --backend BACKEND_ID --project cormyr
firebase apphosting:secrets:grantaccess CRON_SECRET --backend BACKEND_ID --project cormyr
```

### 3. Credenciais do Google (Drive e Docs)

Escolha **uma** das opções descritas em `LEAVING-LOVABLE.md` (conta de serviço
ou OAuth da conta do Narrador), crie os segredos correspondentes com
`firebase apphosting:secrets:set` e descomente o bloco da opção escolhida em
`apphosting.yaml` por PR. Sem isso, a sincronização com o Drive não funciona,
mas o restante do site sobe.

### 4. Rollout

Com a branch ativa em `main`, cada push na `main` cria um rollout. Para o
primeiro, use o console (App Hosting > backend > Rollouts > novo rollout) e
acompanhe o Cloud Build. Se o build falhar, copie apenas o trecho do erro (sem
valores de variáveis) para diagnóstico.

### 5. Supabase Auth

No painel do Supabase (Authentication > URL Configuration), inclua o domínio do
novo backend nas URLs de redirecionamento permitidas. O consentimento OAuth
continua em `/.lovable/oauth/consent`; não renomeie sem trocar a URL de
autorização no painel do Supabase.

### 6. Cloud Scheduler (sincronização horária do Drive)

```bash
gcloud scheduler jobs create http cormyr-drive-sync \
  --project cormyr --location REGIAO \
  --schedule "0 * * * *" --time-zone "America/Sao_Paulo" \
  --http-method POST \
  --uri "https://SEU-DOMINIO/api/public/jobs/drive-sync" \
  --headers "Authorization=Bearer VALOR_DO_CRON_SECRET"
```

O valor do `CRON_SECRET` fica gravado na configuração do job; use o mesmo valor
do segredo do passo 2 e restrinja quem pode editar jobs no projeto.

### 7. Retratos de espiões no banco

Só depois do rollout validado, no SQL Editor do Supabase (Narrador/proprietário).
Antes, confira quantas linhas serão afetadas:

```sql
SELECT count(*) FROM public.spy_portrait_catalog
WHERE image_url LIKE 'https://cormyr-chronicle-atlas.lovable.app/spy-portraits/%';
```

Depois aplique o `UPDATE` de `LEAVING-LOVABLE.md`. Este repositório não executa
SQL por conta própria.

## Verificação após o rollout

1. `/` redireciona para `/cormyr/` e o arquivo estático carrega.
2. Login com e-mail e senha e com Google funciona no novo domínio.
3. `/spy-portraits/tillet.jpg` e um retrato qualquer carregam (200).
4. Uma rota protegida responde 401 sem sessão e 200 com sessão.
5. O job do Scheduler retorna 2xx (e 401 sem o cabeçalho `Authorization`).
6. Os logs do Cloud Run não mostram erro de segredo ausente.

## Rollback

O Lovable e o Supabase atuais continuam intactos. Para voltar, reverta o
rollout no console do App Hosting para o anterior ou aponte o domínio de volta
para a origem antiga. Não desligue nada no Lovable até confirmar acesso direto
ao painel e à chave `service_role` do Supabase.

## Fora do escopo desta fase

Migração de dados, Authentication, Storage e regras de produção do Firebase
(Fase 2, em `README.md` e `MIGRATION-COVERAGE.md`). O corte dos jogadores só
acontece depois dos critérios de aceite documentados ali.
