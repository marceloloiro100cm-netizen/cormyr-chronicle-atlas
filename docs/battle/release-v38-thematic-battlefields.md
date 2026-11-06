# Cruzada V3.8 — Campos de Batalha Temáticos de Cormyr

**Escopo:** uma nova camada **opcional** de cenários geográficos e apresentação visual para as batalhas locais de treinamento. Não é mapa político, não reivindica a posição histórica das casas e não transfere consequências à campanha.

## Teatros criados

| Teatro | Paisagem e experiência | Tipos que efetivamente afetam as regras |
| --- | --- | --- |
| Terras da Coroa | Estradas do reino, estandartes, bosques e paliçadas | Planície, floresta, colina, rocha |
| Stonelands | Gargantas de fronteira, afloramentos rochosos e marcos de pedra | Planície, colina, rocha |
| Dragon Coast | Vegetação úmida, troncos tombados e destroços costeiros | Planície, floresta, colina, rocha |
| Volkumburgh | Bosques do interior, fogueiras de vigia e paredes de pedra | Planície, floresta, colina, rocha |
| Terras de Ashkar | Savana vulcânica, rochas de basalto e dunas baixas | Planície, floresta, colina, rocha |

Os elementos são SVGs originais gerados pelo próprio código (sem imagens ou ativos de Pathfinder/Owlcat). **Apenas o tipo `tile.terrain` tem efeito tático.** Paliçadas, paredões e basaltos aparecem sobre hexágonos de `rock`, impedindo movimentação e visão. Dunas são `hill`, com custo de movimento 2. Floresta tem custo 2 e bloqueia visão. Tendas, carroças e fogueiras em `plain` são apenas cenográficas, sem bloqueio invisível.

## Comportamento e isolamento
- Escolha de região em `BattleV38TheatreChooser` aparece somente na preparação **livre** do treino, nunca em convocações bloqueadas.
- Cada região combina com os quatro cenários existentes (`plain-open`, `contested-woods`, `border-hills`, `narrow-passage`).
- Motor gera `BattleMap` determinístico, com ID `v38-<região>-<cenário>` e mantém `schemaVersion:2`, dimensões oficiais 11×9 e 15×11, zonas de implantação inalteradas, corredores atravessáveis e regras PTE-2.0.
- A variante é opt-in via `V3ScenarioOptions.theatre`; sem o campo, `createV3Game` produz exatamente o mapa, seed, pilhas e regras que produzia na V3.7.
- O mapa desenha gradientes, cores regionais, árvores, paliçadas, rochas, dunas, troncos e objetos cenográficos em SVG com acessibilidade. Os controles de zoom, visão tática e alto contraste continuam.
- Sem API, banco, migração, persistência, Realtime ou alterações em `HouseState`, missivas, espionagem, inventário, economia, unidades reais ou Hub Temporal.
- O protocolo sincronizado V3.4 não é migrado nem recebe novos teatros; jogos V3.4 continuam íntegros com `createV3Game` sem `theatre`.
- A homologação oficial V3.5 não lê nem aplica resultados da Cruzada de treino.

## Verificação necessária
- Testes `src/test/battle-v38-theatres.test.tsx`: 5 teatros × 4 cenários × 2 tamanhos = **40 mapas**, com validação estrutural e caminho entre zonas; decoração coerente com terreno; mapa imutável; início com tropas fictícias; controles de escolha e legenda visual.
- Regressão de V3.1–V3.7, TypeScript e compilação; aceitação sintética no navegador e SQL de banco descartável.
- Homologar visual desktop/mobile e contraste com narrador e jogador. Antes de qualquer merge, testar seleção do teatro, todos os botões e desempenho no Android.
- **Não publicou em produção.** Branch de revisão encadeada após #276.

## Próxima fase sugerida
V3.9 poderá introduzir *campos de batalha objetivos* (ponte, colina de comando, pontos logísticos), mas precisará de versão nova do motor e de logs para os novos critérios de vitória. A V3.8 não inclui bônus ocultos por cenário, turnos extras nem captura de propriedades reais.
