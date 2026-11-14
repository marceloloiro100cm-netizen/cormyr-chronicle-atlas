# Rotinas agendadas (emulador)

Fronteira para o Cloud Scheduler chamar os dois relógios que existiam nos serviços mas que nada acionava:

| Rota | Serviço | Efeito |
| --- | --- | --- |
| `POST /api/firebase-jobs/publish-due` | jornal `publishDue` | publica as edições cuja data do Reino chegou (idempotente) |
| `POST /api/firebase-jobs/advance-missions` | espionagem `advanceMissions` | avança as missões pela data oficial (idempotente) |
| `POST /api/firebase-jobs/all` | os dois | executa em sequência; um erro não impede o outro |

## Segurança

- Autenticação por Bearer `CRON_SECRET`, com `CRON_SECRET_PREVIOUS` opcional para rotação, comparação em tempo constante, mesma regra de `src/integrations/supabase/cron-auth.ts`. Sem segredo configurado a resposta é 500.
- Só `POST`, sem query string, só os caminhos acima.
- Os jobs rodam como uma conta de Narrador configurada (`actorUid`), por uma identidade interna do processo (token aleatório por execução, nunca exposto). Se a conta não for Narrador ativo, os serviços negam e a rota devolve 500.
- Resposta só com contagens. Erro de job devolve 500 sem texto de erro, para o Scheduler repetir.
- Só emulador (`assertEmulatorOnly`). Nada é criado no Cloud Scheduler: **a criação do job real continua sendo pendência do proprietário.**

## Verificação

Unitários: `node --test scripts/firebase/scheduled-jobs-handler.test.mjs`. Emulador: workflow `firebase-jobs.yml`.
