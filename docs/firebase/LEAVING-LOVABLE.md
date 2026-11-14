# Saída do Lovable (Fase 1)

Esta etapa tira o projeto do Lovable **sem mexer nos dados**: o app continua
usando o Supabase atual e passa a ser construído e hospedado de forma
independente, no Firebase App Hosting. A migração de dados, login e Storage
para o Firebase (Fase 2) segue em `docs/firebase/README.md`.

## O que mudou

| Antes | Agora |
| --- | --- |
| `@lovable.dev/vite-tanstack-config` (build para Cloudflare) | `vite.config.ts` próprio, com Nitro em `node-server` |
| `@lovable.dev/cloud-auth-js` (login gerenciado) | Removido; o app já usava Supabase Auth |
| Drive e Docs pelo gateway `connector-gateway.lovable.dev` | Chamadas diretas à API do Google (`src/lib/google-api.server.ts`) |
| `LOVABLE_API_KEY`, `GOOGLE_DRIVE_API_KEY`, `GOOGLE_DOCS_API_KEY` | Uma das opções de credencial abaixo |
| `LOVABLE_CRON_SECRET` | `CRON_SECRET` (o nome antigo ainda é aceito) |
| Retratos de espiões em `cormyr-chronicle-atlas.lovable.app` | Caminhos relativos `/spy-portraits/...` |
| `lovable-error-reporting.ts` | `error-reporting.ts`, sem gancho do editor |
| Publicação pelo botão do editor | Rollout do App Hosting a partir do GitHub |

Continua existindo **um** pacote `@lovable.dev`: `@lovable.dev/mcp-js`, usado só
pela integração MCP do Narrador (rota `/mcp`). É um pacote npm comum, não exige
a plataforma Lovable. Os arquivos gerados dessa integração agora são mantidos
manualmente.

## Antes do primeiro deploy

1. **Lockfile:** execute o workflow **Refresh lockfile** (Actions) nesta branch.
   Ele roda `bun install` e commita o `bun.lock` atualizado. Sem isso, o
   `bun install --frozen-lockfile` do workflow Validate falha.
2. **Build:** o workflow **Build check** compila com Node para confirmar a nova
   configuração antes de qualquer rollout.
3. **Segredos no App Hosting** (`firebase apphosting:secrets:set NOME`):
   `SUPABASE_SERVICE_ROLE_KEY` e `CRON_SECRET`, mais as credenciais do Google.
   A URL do Supabase e a chave publicável já têm padrão público no código.
4. **Credenciais do Google**, escolha uma:
   - **Conta de serviço:** crie no Google Cloud, ative as APIs Drive e Docs,
     gere a chave JSON e compartilhe as pastas do Drive com o e-mail da conta.
     Segredo: `GOOGLE_SERVICE_ACCOUNT_JSON`.
   - **OAuth da conta do Narrador:** crie um cliente OAuth, autorize os escopos
     `drive` e `documents` uma vez (por exemplo no OAuth Playground) e guarde
     `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` e
     `GOOGLE_OAUTH_REFRESH_TOKEN`. Mantém o acesso que o conector tinha.
   Depois, remova o comentário da opção escolhida em `apphosting.yaml`.
5. **Sincronização horária do Drive:** crie um job no Cloud Scheduler com
   `POST https://SEU-DOMINIO/api/public/jobs/drive-sync` e o cabeçalho
   `Authorization: Bearer <CRON_SECRET>`. Antes, o agendador era do Lovable.
6. **MCP e login do ChatGPT (se for usar):** o consentimento OAuth continua em
   `/.lovable/oauth/consent` porque o servidor OAuth do Supabase aponta para
   esse caminho. Não renomeie sem trocar a URL de autorização no painel do
   Supabase. Confirme também que o domínio novo está nas URLs permitidas de
   redirecionamento do Supabase Auth.

## Pendência no banco: retratos de espiões

As migrações antigas gravaram em `public.spy_portrait_catalog.image_url`
endereços absolutos em `cormyr-chronicle-atlas.lovable.app`. O código agora usa
caminhos relativos, mas as linhas existentes no banco precisam ser corrigidas
antes de desligar o site antigo. No SQL Editor do Supabase (Narrador/proprietário):

```sql
UPDATE public.spy_portrait_catalog
SET image_url = regexp_replace(image_url, '^https://cormyr-chronicle-atlas\.lovable\.app', '')
WHERE image_url LIKE 'https://cormyr-chronicle-atlas.lovable.app/spy-portraits/%';
```

Esta fase não executa SQL por conta própria.

## Pontos de atenção

- O repositório é público: nunca commite segredos. Tudo sensível fica em
  Secret Manager.
- O App Hosting instala dependências com `npm ci`. Sem `package-lock.json`, o
  buildpack gera um lock incompleto (falta o `rolldown`) e o build falha; por
  isso o `package-lock.json` agora é versionado, gerado com `npm install`
  completo em Node 24 e validado com `npm ci` e com o build `node-server`. O
  `bun.lock` continua sendo usado pelo CI. **Sempre que o `package.json`
  mudar, regenere o `package-lock.json`** (`npm install` e depois `npm ci` para
  conferir) e commite os dois lockfiles.
- O Supabase atual segue como fonte de verdade. Se ele for um projeto gerenciado
  pelo Lovable Cloud, confirme que você tem acesso direto ao painel e à chave
  `service_role` antes de desligar qualquer coisa no Lovable.
- Esta fase não altera dados, regras, RLS nem migrações.
