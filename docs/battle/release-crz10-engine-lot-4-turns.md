# CRZ-1.0 — Lote 4: motor de turnos jogável em memória

**Referências:** `03-regras-cormyr-cruzada-passo-a-passo.md` §§2–12, `06-arquitetura-e-integracao-cormyr.md` §6.3, anexos `01` e `02`. A implementação é nova e isolada do motor PTE-2.0. O catálogo 05, a calibração 07 e goldens externos completos não foram recebidos.

## Entregas efetivas

| Arquivo | Conteúdo |
| --- | --- |
| `src/lib/crusade/geometry.ts` | Tabuleiro pointy-top axial (11×9/15×11), validação das duas zonas de implantação, caminho entre elas, Dijkstra determinístico com terrenos e ZOC, linha de visão por supercover |
| `src/lib/crusade/setup.ts` | Schema do encontro, seed e hash do preset, dois exércitos, controles humano/IA, líderes fora do mapa e posicionamento inicial determinístico dentro das zonas |
| `src/lib/crusade/battle-state.ts` | BattleState CRZ e eventos tipados, iniciativa com desempate estável, pilhas vivas/debandadas, efeitos e moraI baseada em baixas |
| `src/lib/crusade/strike.ts` | Dano 5e expected/rolled/hybrid do Lote 2, cobertura, flanco, tiros, resistência por tipo, retaliação corpo a corpo e eventos de baixas |
| `src/lib/crusade/leader.ts` | Comandantes fora da grade, energia finita, restrição de ação em turno aliado, limite por rodada e subset original de sete magias |
| `src/lib/crusade/turns.ts` | Redutor de comandos: START, MOVE, ATTACK, WAIT, DEFEND, CAST, END_ACTIVATION; fila normal/espera, renovação de efeitos, limites e encerramentos |
| `src/lib/crusade/ai.ts` | IA determinística de ataque/marcha/defesa com teto de comandos, sem efeitos externos |
| `src/test/crusade-crz10-lot4-turns.test.ts` | Setup, determinismo, comandos ilegais, movimento e rochas, espera, defesa, retaliação, turno do General, vitória, RNG e IA |

## Contrato de regras e decisões provisórias

- **Jogável apenas em memória**, com pilhas fictícias do catálogo curado. Não há UI, servidor, sessão remota, replay CRZ verificado nem escrita de perdas na campanha.
- O redutor é **CRZ-5E** nesta versão. `CRZ-WOTR` e `PTE-2.0-compat` têm contratos declarados, mas são rejeitados pelo `crzStart` até que existam redutores e testes de paridade próprios. Não declarar compatibilidade integral.
- Uma pilha age por ativação, pode mover e então atacar, esperar uma vez por rodada antes de agir, defender ou finalizar. Ataque termina a ativação. Retaliação de uma pilha capaz ocorre somente se o alvo sobreviver, estiver adjacente e ainda não tiver retaliado na rodada.
- Movimento em planície custa 1, bosque/colina 2, rocha é bloqueio; ZOC encerra o deslocamento. Floresta/rocha bloqueiam linha de visão.
- `defendActive` persiste após a ordem DEFEND, terminando quando a pilha inicia sua próxima ativação.
- No fim da rodada são contados limites de 20 rodadas e 2 sem movimentação/dano; efeitos têm duração em rodadas, controlada exclusivamente pelo redutor.
- Moral sofre degradação por perdas de efetivo; em moral `shaken` há chance controlada de perder ativação; bônus em moral positiva pode conceder uma ativação extra, com teto por rodada. **Essas chances são provisórias do Lote 4**, pois o documento 07 de calibração não foi fornecido. Todo sorteio usa estado PCG32 versionado e serializável.
- O General pode agir no turno de pilha aliada, antes de ações dela. O subconjunto executável é `bless`, `bane`, `shield_of_faith`, `heroism`, `cause_fear`, `cure_wounds` e `firebolt`. `fireball`, `hold`, `slow`, `shield_wall_formation`, `volley_order` aparecem no schema, mas são explicitamente **não executáveis** neste lote. Os valores de duração, dano, cura e energia deste protótipo são adaptações experimentais, não dados garantidos de Pathfinder ou 5e.
- Alguns elementos complexos de 03 permanecem pendentes: moral detalhada e efeitos de estado; ataque em área de criaturas; retaliação com timing completo de todas as habilidades; `CRZ-WOTR` e `PTE-2.0-compat`; habilidades lendárias, feitiços de área, enfermaria, uso pleno do General, regras de retaguarda e replay CRZ com cadeia hash. Nada disso foi implementado como bônus oculto.
- Cada evento armazena `seq`, `round`, comando/resultado e dano/baixas quando relevante. Isso prepara a arquitetura para **Lote 5**, mas ainda não constitui um replay CRZ verificável.
- Segurança: `house-readonly` é bloqueado pelo conversor; `src/lib/battle/domain/*`, banco de dados, autenticação, Hub Temporal e efeitos oficiais permanecem intocados.

## Divergência normativa identificada pelo CI público (06/11/2026)

O teste T-INT-01 do documento 03 §18 descreve **78 de dano na retaliação e 11 baixas** numa pilha de 60 criaturas com 7 PV. Essa é a consequência matemática de `overkill='carry'`: 420−78=342 PV, 49 criaturas vivas.

Mas o preset `CRZ-5E` já definido no Lote 1 declara **`overkill='cap'`** (também exigido em casos como T-PIL-03). A retaliação produz 7,65 acertos esperados; o teto é `floor(7,65×7)=53` PV, restando 367 PV, 53 criaturas vivas, **sete baixas**. O dano bruto continua 78.

Os dois resultados agora são demonstrados explicitamente no teste de integração:
- CRZ-5E padrão: 78 bruto, 53 aplicado, sete baixas.
- Configuração alternativa carry **apenas no teste**: 78 aplicado, onze baixas.

**Decisão pendente do Narrador:** esclarecer no manual se a retaliação de T-INT-01 constitui uma exceção à regra de cap ou se o exemplo utiliza o preset carry. Não alteramos o hash/preset atual nem mascaramos a divergência para satisfazer o golden.

## Acompanhamento e critérios antes de integrar

1. Compilação TypeScript e Vitest do novo teste e das fases precedentes.
2. Testes de banco da V3.5 em PostgreSQL descartável, browser acceptance sintético e regressão do PTE.
3. Conferir publicamente status do Actions após o repositório passar a público; se não houver logs, não concluir que foi aprovado.
4. Revisar a moral numérica, chances de skip/extra e sete magias antes de usar resultados de uma partida de campanha.
5. Não fazer merge/deploy ou oficializar perdas a partir da camada CRZ até aceite do Narrador.

O motor CRZ usa `CRZ_RULES_VERSION='CRZ-1.0'` e `rulesetHash` próprios, sem modificar hashes, ID de partidas ou snapshots PTE existentes.
