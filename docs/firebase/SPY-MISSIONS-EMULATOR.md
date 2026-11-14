# Espionagem: missões (emulador)

Segunda fatia da espionagem. Roda só no Firestore Emulator (`demo-cormyr-migration`), sem endpoint público, sem produção e sem Supabase.

## O que foi portado

| SQL | Regra | Onde |
| --- | --- | --- |
| 0101 e 0102 `spy_submit_house_mission` | Início imediato: valida Casa, agente, localização aprovada, região do alvo, versões e chave; calcula rota regional e datas | `startMission` |
| 0102 | Rota por busca em largura sobre 22 ligações (vizinhos em ordem alfabética, passagem marítima preferida), no máximo 25 etapas | `missionRoute`, `LINKS` |
| 0102 `spy_cancel_house_mission` | Cancela missão planejada, em viagem, operando ou em revisão e libera o agente | `cancelMission` |
| 0102 gatilho do Hub Temporal | Viajando vira operando na chegada e revisão do Narrador no fim da investigação | `advanceMissions` |
| 0102 `spy_house_mission_timeline` | Linha do tempo da Casa | `houseTimeline` |
| 0091 e 0093 `spy_player_mission_preview` | Defesa provisória com a fórmula corrigida `6+3*floor(max(0,Lei-30)/5)+bônus` | `previewMission` |
| 0090 e 0093 `spy_resolve_agent_mission` | Resolução exclusiva do Narrador: sucesso, fracasso, fuga, prisão ou morte; promoção, histórico, decisão e evento | `resolveMission` |
| 0111 | Contraespionagem da Casa e painel de operações do Narrador | `counterintelligence`, `narratorOperations` |
| 0112 | Histórico de incidentes do Narrador | `incidentHistory` |

Valem as versões finais: 0102 substitui 0101 (a missão já nasce em viagem) e 0093 substitui a fórmula de dificuldade de 0090 e 0091.

## Dados em `migrationSpyStage/<snapshot>`

Além das coleções da fatia de agentes, o stager passa a importar `catalog` (house_catalog sem arquivo narrativo nem galeria), `nobleStats` (Lei e região importadas), `timeline` e `decisions`. As ligações regionais são constantes do código, como a migração SQL que as semeia sem função de edição. Tabelas ausentes no backup contam zero.

## Diferenças deliberadas

- Datas de eventos são ordenadas cronologicamente (`calendarOrdinal`), não por ordenação textual do banco.
- Nomes das Casas vêm só do `house_catalog`; os nomes de `campaign_houses` não estão neste domínio.
- O relógio é `advanceMissions`, idempotente sobre a data oficial atual e só do Narrador. Deve ser chamado depois de cada mudança do Hub Temporal.
- `intelligenceStatus` do painel fica vazio até a fatia de inteligência (partes 3).

## Fora desta fatia

Dossiês e achados de inteligência, prêmios, auditoria administrativa, painel do Narrador de inteligência, adaptador do app e job que chama o relógio.

## Verificação

- Unitários: `node --test scripts/firebase/spy-missions-core.test.mjs scripts/firebase/stage-spy-emulator.test.mjs`
- Emulador: workflow `firebase-spy-missions.yml` (transações, idempotência, relógio, resolução, contraespionagem e regras server-only).
- Ensaio no backup real: `node scripts/firebase/stage-spy-emulator.mjs --normalized DIR` (só contagens).
