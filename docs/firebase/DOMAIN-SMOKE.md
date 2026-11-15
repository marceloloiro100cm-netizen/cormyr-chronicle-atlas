# Verificação pós-DNS — `atlas.cormyr.com.br`

O domínio oficial foi **configurado pelo proprietário** no Firebase App Hosting. Configuração no painel não comprova automaticamente HTTPS, resolução universal de DNS, build publicado nem funcionamento do banco.

## Auditoria segura de publicação

O script `scripts/firebase-apphosting-smoke.mjs` realiza **somente requisições GET**, com redirecionamentos limitados ao mesmo HTTPS do domínio oficial. Não transmite autenticação, cookies, dados de jogador, chave de API ou tokens. Ele confere:

- `/cormyr/index.html`: HTML da parte pública;
- `/auth`: página SSR de login;
- `/spy-portraits/tillet.jpg`: uma imagem estática do repositório;
- `/api/firebase-auth-verify`: **deve recusar** acesso não autenticado (401) ou estar desativado explicitamente (503), com JSON.

Executar em ambiente com DNS e HTTPS públicos:

```bash
node scripts/firebase-apphosting-smoke.mjs
```

Também existe o workflow **Firebase App Hosting domain smoke (read-only)** em **Actions → Run workflow → main**, sem segredos. Ele roda automaticamente nos PRs que modificam o verificador e no merge desses arquivos na `main`. A checagem HTTP em Actions é *informativa*, pois a propagação DNS ainda pode estar pendente: a etapa registra falhas e avisos sem bloquear a aprovação do código. Em execução direta pela CLI, o comando retorna código de saída 1 se não verificar publicação; o JSON mantém apenas códigos HTTP e nomes de verificações. Se DNS ou certificado estiverem pendentes, aparecerá `transport_unavailable`; repetir a verificação após a propagação.

## Limitações

Um resultado `publicationSmokePassed=true` **não comprova** que logins, Casas, missivas, calendário, jornal, espionagem e batalha estejam migrados. Esses fluxos exigem dados reais reconciliados, importação Auth/Firestore Cloud, regras por perfil e testes E2E.

A saída mantém `firebaseCloudMigrationVerified=false` e `readyForCutover=false`, inclusive quando todas as rotas públicas respondem corretamente. O app continua com `attachSupabaseAuth` até a homologação; nunca desligar o Supabase antes dos portões do `CUTOVER-RUNBOOK.md`.

### Próximos bloqueadores

1. Confirmar **Connected** e certificado SSL no painel Firebase (não apenas domínio cadastrado).
2. Confirmar URLs de retorno/redirecionamento no provedor de autenticação efetivamente usado.
3. Obter acesso autorizado à origem atual e reconciliar backup recente sem mostrar dados no Git.
4. Testar Firebase Cloud com identidade de homologação e serviços realmente conectados; somente então preparar corte.
