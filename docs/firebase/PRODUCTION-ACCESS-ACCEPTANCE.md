# Aceite de produção — autenticação, Casas e missivas

**Estado:** Firebase App Hosting está publicado em https://atlas.cormyr.com.br, mas a implementação em `src/routes/auth.tsx` ainda usa **Supabase Auth**, enquanto `src/start.ts` anexa o bearer de Supabase aos server functions. Firestore e Storage Cloud ainda não foram homologados com dados reais. **O cutover permanece NO_GO.**

## Verificação automatizada sem credenciais

O workflow `Firebase production public data and anonymous access acceptance` executa `node scripts/firebase-production-acceptance-smoke.mjs`. Sem cookies, JWT, chaves privadas, contas de jogadores ou dados sensíveis, verifica:

- `/auth` — HTTP 200 HTML;
- `/api/public/time` — HTTP 200 JSON (a RPC pública precisa estar disponível);
- `/api/public/catalog` — HTTP 200 JSON;
- `/api/public/translations?locale=en` — HTTP 200 JSON;
- `/api/public/gm-content` — HTTP 401 JSON sem Authorization;
- `/api/public/jobs/drive-sync` — HTTP 401 sem Authorization; envia deliberadamente um POST com `kind` **inválido**, que não pode iniciar sincronização, mesmo em caso de falha da checagem de autorização;
- `/api/firebase-auth-verify` — HTTP 503 JSON, pois só a homologação do Firebase está desativada;
- Health GET do Supabase Auth legado, apenas como sinal **informativo**.

**Nenhum corpo HTTP retornado é lido ou registrado em logs.** O resultado mostra apenas nome do teste, método, status HTTP e booleano de aceite. Falhas reais ficam explícitas no resumo do workflow, mesmo quando o job de diagnóstico é informativo.

`publicReadinessPassed` exige todos os testes essenciais verdes; `readyForPlayers`, `readyForCutover`, `serviceRoleSecretProven`, `userLoginProven`, `houseScopedAccessProven` e `mailboxAndCalendarWritesProven` permanecem **false** por construção.

## Portões manuais obrigatórios antes de convidar jogadores

1. **Validar a chave privilegiada real**: `docs/firebase/APPHOSTING-ROLLOUT.md` registra um segredo `SUPABASE_SERVICE_ROLE_KEY` provisório. A presença de uma versão no Secret Manager não comprova que seja válido. O proprietário precisa obter acesso autorizado à origem e substituir pelo segredo real via `firebase apphosting:secrets:set SUPABASE_SERVICE_ROLE_KEY --project cormyr`, sem mostrar o valor em chat, Actions ou GitHub. Realizar rollout explícito após mudança de segredo e validar uma operação administrativa **com uma conta de teste**. Não usar o token administrativo em browser. Caso a origem continue inacessível, não anunciar o portal completo.
2. **Permissões Auth**: entrar em `/auth` no domínio definitivo com um jogador de homologação; sair; repetir com outro jogador e Narrador. Verificar que a seleção de Casa e de perfil não concede direitos por si só e que cada conta vê apenas a própria Casa.
3. **Missivas e calendário**: em homologação autorizada, criar uma missiva teste entre duas Casas e confirmar envio, leitura, cópia para Narrador, isolamento da terceira Casa e reabertura após reload. Conferir calendário do Narrador e do jogador, sem alterar eventos históricos.
4. **Jornal e espionagem**: com contas de teste, provar visibilidade conforme perfil. Simulação de batalha não pode modificar dados das Casas reais.
5. **Integrações**: testar fontes reais do Drive e do Cron, URLs de callback Supabase Auth, OAuth, dados/arquivos, regras Firestore/Storage, logs e rollback antes de habilitar agendadores. Nunca disparar jobs reais para sondar autenticação.
6. **Conferir migração Cloud**: contagens/hashes e UIDs de Auth/Firestore/Storage precisam coincidir com backup privado atual, com teste E2E de papel; o simples deploy de interface não satisfaz esse requisito.

## Como interpretar falhas

- `campaignTime`, `publicCatalog` ou `publicTranslations` com **503**: rota publicada mas a origem pública Supabase/RPC não está atendendo; verificar disponibilidade do projeto, variáveis públicas, RLS e erro do backend, sem conceder acesso amplo.
- `privateGmAnonymousDenied` diferente de **401**: investigar imediatamente fronteira de autorização; não expor conteúdo privado.
- `cronAnonymousDenied` **500**: CRON_SECRET provavelmente ausente ou falha de configuração; não ativar Cloud Scheduler.
- Supabase Auth health fora do ar: diagnóstico do provedor; não provar login apenas pela presença da página `/auth`.

O site pode ser anunciado como **portal publicado para testes** após o smoke público, não como migração 100% completa enquanto os portões funcionais não passarem.
