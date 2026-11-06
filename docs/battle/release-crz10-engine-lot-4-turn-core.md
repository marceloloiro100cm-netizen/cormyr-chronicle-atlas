# CRZ-1.0 — Lote 4A: núcleo de turnos, combate e comandos do general

## Origem normativa

Esta fase segue o arquivo **`03-regras-cormyr-cruzada-passo-a-passo.md`**, documento normativo do pacote enviado pelo Narrador: §§3 (setup), 4 (pilhas), 5 (iniciativa), 6.1–6.7 (comandos e retaliação), 6.8–6.9 (frente, flanco), 7.1–7.7 (dano, PV), 9 (general), 10 (moral), 11 (visão), 12 (vitória) e 17–18 (casos-limite e golden). A arquitetura foi delimitada por **`06-arquitetura-e-integracao-cormyr.md`**, que pede núcleo apartável e preservação do PTE-2.0. A matemática do dano dos lotes 1–2 segue **`02-empilhamento-de-criaturas.md`**.

**Aviso de alcance:** isto é um **núcleo de batalha por comandos, não uma interface jogável de CRZ-1.0 nem uma implementação de todos os recursos do documento 03**. O catálogo externo 05 e a calibragem 07 ainda não foram fornecidos. A tabela de valores 🔧 do 03 ainda está sujeita a ajuste.

## Arquivos implementados

| Arquivo | Responsabilidades |
|---|---|
| `src/lib/crusade/battle.ts` | `CrzBattleSetup`, `CrzBattleState`, `CrzBattleUnit`, resultado e eventos; validação de mapa, hash, seed e implantação; iniciativa, moral por baixas, condições de derrota e placar por PV. |
| `src/lib/crusade/geometry.ts` | Busca de caminhos determinística e de custo mínimo; planície 1, floresta/colina 2, rocha intransponível, hexágono ocupado bloqueado e ZOC ao entrar; alcance, cobertura e linha de visão. Reutiliza apenas `battle/geometry/*` e tipos públicos, nunca o redutor PTE. |
| `src/lib/crusade/combat.ts` | Rotina 5e, d20/esperado/híbrido, dano em partes com mitigação de tipo, bônus de treino, dano adicional de habilidades, cobertura, flanco/Pack Tactics e frente opcional; retaliação uma vez por rodada e revisão de moral imediatamente após dano. |
| `src/lib/crusade/turns.ts` | Máquina de estados de turno: `MOVE`, `ATTACK`, `WAIT` (inverso), `DEFEND`, `END_ACTIVATION`, `ABILITY` e `LEADER_CAST`. Rodadas, energia limitada do general, efeitos temporários, estados de moral com RNG seedado, vitória e impasse. |
| `src/lib/crusade/selectors.ts` | Seletor puro de opções disponíveis para integrar futuramente à HUD. **O redutor continua sendo a autoridade** para validar a ação. |
| `src/test/crusade-crz10-lot4-turns.test.ts` | Testes de setup, legalidade, iniciativa, bloqueios, espera inversa, defesa, energia, efeitos, derrota/impasse e T-INT-01. |
| `src/test/crusade-crz10-architecture.test.ts` | Proteção contra imports do redutor PTE, Supabase, componentes e funções de mutação oficial; tipos/geometria PTE permitidos. |

## Fluxo implementado

1. `crzPrepareBattle(input)` exige **preset CRZ-5E conhecido** e hash aprovado, cenário validado, criaturas de catálogo curado e origem não oficial, identificadores únicos, implantação legal e **seed hexadecimal explícita**. Não gera uma seed silenciosa.
2. `crzStartBattle(state)` inicia a rodada 1 e escolhe pilha por iniciativa decrescente; desempates: atacante, DEX e ID.
3. `crzApplyCommand(state, cmd)` só aceita comandos Zod estritos da pilha ativa; efeitos são imutáveis e auditados em eventos. MOVEs usam Dijkstra e encerram imediatamente na ZOC que acabaram de entrar.
4. Cada pilha pode mover uma vez e atacar uma vez, nessa ordem; após atacar não movimenta. `WAIT` só antes de agir; pilhas adiadas retornam em ordem inversa, sem novo WAIT. `DEFEND` encerra e aumenta CA até a próxima ativação da pilha.
5. Ataque aplica entrada de dados/CA, cobertura, flanco e imunidade/resistência/vulnerabilidade; dano reduz o pool, recalcula moral e permite **retaliação corpo a corpo de sobreviventes não debandados** uma vez por rodada.
6. No modo `hybrid` e `rolled`, a moral negativa pode perder ativação e a positiva pode conceder uma extra imediata, ambas via PCG32, com limite de uma extra por rodada. No modo `expected`, a moral numérica não consome RNG nem muda a iniciativa.
7. General opcional **não é token**; atua antes da unidade aliada, uma vez por rodada, com energia que não regenera. Primeiro conjunto implementado e validado na interface de comando: `bless`, `bane`, `shield_of_faith`, `cure_wounds`. A cura do modo esperado usa média inteira dos dados, e a do modo rolado usa PCG32.
8. Habilidades inicialmente acionáveis: `CHARGE` (exige traço, movimento reto de pelo menos dois hexágonos) e `VOLLEY` (atiradores, uso por batalha limitado). O motor não atribui habilidades inexistentes às fichas.
9. Vitória por eliminação, debandada e derrota mútua; empates por dois ciclos sem MOVED/dano; limite de rodadas com comparação de PV não debandados.

## Testes críticos do manual

Golden **T-INT-01** (§18): 60 goblins sintéticos contra 30 orcs sintéticos adjacentes, todos treinados; iniciativa A=8, D=7. Dano esperado A→D = **208**, D 17 vivos, 13 baixas, PV 242/topo 2, moral abalada. Retaliação D→A = **78**, A 49 vivos, 11 baixas, PV 342/topo 6. Teste vinculado aos novos redutores, não só à função matemática isolada.

Outros testes cobrem bloqueio de teleporte, turno de outro ator, apenas um movimento por ativação, tempo de espera, energia e alvos do general, RNG preservado no modo esperado, roteamento e alerta de divisão.

## Fases não implementadas nesta PR — não ocultar

- **Somente CRZ-5E é executável pelo redutor** neste lote. `CRZ-WOTR` e `PTE-2.0-compat` permanecem presets matemáticos; o setup de partida para esses presets é **rejeitado explicitamente** até que existam redutores compatíveis. Não declarar paridade com PTE.
- Ações `BREATH`/`AREA_ATTACK`, `SHIELD_WALL`, `REGENERATION`, `NIMBLE_ESCAPE`, efeitos de veneno/atordoamento avançado e todos os demais traços/feitiços do §8–9 ainda não têm comando; as fichas continuam apresentando avisos.
- `frontage=sqrt` existe no cálculo, mas o preset oficial continua em `off` conforme o §2.3.
- Ataque à distância além do alcance **normal** e sua penalidade de longo alcance não estão habilitados. A cobertura e linha de visão já estão conectadas.
- **Sem IA CRZ autônoma, replay verificável de CRZ, eventos com agregados assinados, sincronização multiplayer, interface gráfica CRZ ou efeitos em unidades reais.** Esses são entregáveis de lotes seguintes.
- O manual §17.16 sugere gerar seed quando vazia, mas esta variante **rejeita** seed ausente. É uma escolha explícita de segurança: o cliente deverá gerar e **registrar** seed fora do motor; nunca usar aleatoriedade implícita no redutor.
- `PTE-2.0`, replays das versões V3.4, oficiais V3.5, casas, missivas, recursos, XP real e Hub Temporal permanecem intocados.

## Aceite

Testes Vitest, TypeScript, build e smoke de banco descartável precisam passar no CI. **Até existir validação comprovada, não fazer merge, deploy nem chamar a variante de homologada.** Validar visual e comportamento com o Narrador após a futura HUD.

Próximo lote: completar habilidades pendentes, regras adicionais de WotR e PTE quando auditadas, motor de replay CRZ com `rulesetHash`, limites e encadeamento de comandos, mantendo o pacote separado.
