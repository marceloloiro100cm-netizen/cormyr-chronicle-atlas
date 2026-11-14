# Batalha (emulador)

Fatia de batalha da migração. Roda só no Firestore Emulator (`demo-cormyr-migration`), sem endpoint público, sem produção e sem Supabase.

## Decisão de projeto

As regras do jogo continuam no motor TypeScript (`src/lib/battle/domain` e `v3`). A fatia portada cobre o que o banco e as funções de servidor decidiam: persistência, concorrência (CAS), idempotência, encadeamento de hash e permissões. O motor entra por injeção (`engine`): `verifyReplay`, `applyCommand`, `replayLive`, `applyLiveStep` e `captureLive`. O JSON canônico e o hash (`sha256` do JSON canônico) seguem a mesma definição do TypeScript.

## O que foi portado

| SQL e função | Regra | Onde |
| --- | --- | --- |
| 0076 `battle_sim_commit_replay` | Só o Narrador; encadeamento de recibos (`cmd-N`, hash anterior, hash final); limites de 1200 comandos e 800000 bytes por estado | `commitReplay` |
| 0076 `battle_sim_commit_step` | Comando repetido com o mesmo payload devolve o recibo; payload diferente é conflito; CAS em versão e hash; sequência e limite | `commitStep` |
| `applySavedBattleCommand` | Recusa comando que não seja `MANUAL_FINISH` quando a unidade ativa é da IA; reaplica o motor e grava | `planSavedCommand`, `applySavedCommand` |
| `readSavedBattle` | Remonta o replay, o motor verifica e o estado salvo precisa coincidir com o hash | `assembleReplay`, `checkSavedIntegrity` |
| 0078 partidas V3 | Só o Narrador cria (casas distintas, ativas, temporada 2); visível ao Narrador e aos membros das duas casas; jogar exige controle da casa do turno, CAS em versão e hash, recusa passos de IA e comandos de fora do Narrador, `MANUAL_FINISH` só do Narrador | `createLive`, `liveView`, `playLive` |
| 0077 convites V3 | Narrador cria e encerra; jogador lê só convites abertos da própria Casa (limite 30) | `createInvitation`, `listInvitations`, `closeInvitation` |
| 0080 rosters | Narrador lê por Casa, ordenado por linha (limite 100) | `rosterFor` |
| 0081 a 0084 D&D | Tudo só do Narrador: sessões privadas por dono, bestiário de 300 criaturas, ajustes, criaturas extras (ids `custom-`, máximo 200) e fontes verificadas | `dnd*` |

## Dados

`migrationBattleStage/<snapshot>`: `sessions`, `states` (`initial:<id>` e `current:<id>`), `events` (`<sessão>:<seq>`), `scenarios`, `invitations`, `live`, `liveReplays`, `roster`, `monsters`, `dndSessions`, `overrides`, `custom` e `verified`. Todo jsonb vira texto JSON, porque o Firestore não aceita arrays aninhados e os estados grandes ficam em documentos próprios. As regras negam tudo; a autorização vem do documento de acesso no servidor.

## Verificação do stager

O dry-run só imprime contagens. Ele confere os CHECKs do DDL, duplicidades, vínculos órfãos e a cadeia de hash de cada sessão (eventos contínuos, do hash inicial ao atual, com a contagem igual à versão).

```
node scripts/firebase/stage-battle-emulator.mjs --normalized DIR
```

## Diferenças e limites

- Tabelas ausentes no backup contam zero e não bloqueiam.
- A validação de casa ativa lê os documentos de casa do estágio tipado.
- Fora desta fatia: adaptador do app, adaptador `readonly-source` das fichas, ligação do motor V3 real e as partidas V3 seguem atrás da trava de lançamento do Narrador.

## Verificação

- Unitários: `node --test scripts/firebase/battle-core.test.mjs scripts/firebase/stage-battle-emulator.test.mjs`
- Emulador: workflow `firebase-battle.yml`.
