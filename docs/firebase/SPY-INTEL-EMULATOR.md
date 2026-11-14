# Espionagem: inteligência (emulador)

Terceira fatia da espionagem. Roda só no Firestore Emulator (`demo-cormyr-migration`), sem endpoint público, sem produção e sem Supabase.

## O que foi portado

| SQL | Regra | Onde |
| --- | --- | --- |
| 0104 gatilho `spy_intelligence_on_decision` | Missão bem-sucedida gera prêmio: capacidade `3+min(4,floor(margem/5))`, revela atributos novos e atualiza os já conhecidos, na mesma transação da resolução | `awardOnDecision`, chamado por `resolveMission` |
| 0104 envio com objetivo | O objetivo (`house_resources`, `army`, `possessions`) é gravado na missão; replay com objetivo diferente é recusado | `startMission` |
| 0105 `spy_intelligence_source_items` | Inventário oficial por objetivo (balanços informados, unidades, domínios e posses ativas) | `sourceItems` |
| 0105, 0106 e 0110 `spy_intelligence_finalize` | Confirmação do Narrador quando o prêmio aguarda o catálogo; vale a 0110 (data observada do Hub, bloqueio se o Hub é anterior à missão) | `finalize` |
| 0105 e 0107 `spy_intelligence_read` | Dossiês: o Narrador vê tudo; o jogador só os da própria Casa e, no histórico, apenas conhecimento ainda mantido, sem valores | `readDossiers` |
| 0105 `spy_intelligence_admin_action`, `_options`, `_pending` | Revelar, revalidar e revogar com motivo e auditoria; opções e pendências | `adminAction`, `adminOptions`, `adminPending` |
| 0110 `spy_intelligence_operation_status` | Estado da inteligência de uma operação | `operationStatus` |

A escolha dos itens usa a mesma ordenação por `md5(operação:chave)` do SQL, então a mesma operação revela os mesmos itens.

## Dados

`migrationSpyStage/<snapshot>`: `dossiers`, `findings` (id derivado de dossiê, objetivo e chave), `awards`, `intelEvents` e `adminAudit`. `nobleStats` passou a carregar os sete atributos (defesa, influência, terras, lei, poder, população, riqueza).

## Diferenças e limites

- O gatilho do SQL vira uma etapa da própria transação de `resolveMission`; o retorno traz `intelligence` com o estado do prêmio.
- Alvo com ficha operacional, ou objetivo `army`/`possessions`, aguarda a confirmação do Narrador (`finalize`), como no SQL.
- O painel de operações já mostra o estado da inteligência.
- Fora desta fatia: adaptador do app, job que chama o relógio das missões, Storage.

## Verificação

- Unitários: `node --test scripts/firebase/spy-intel-core.test.mjs scripts/firebase/stage-spy-emulator.test.mjs`
- Emulador: workflow `firebase-spy-intel.yml`.
- Ensaio no backup real: `node scripts/firebase/stage-spy-emulator.mjs --normalized DIR` (só contagens).
