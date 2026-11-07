# Migração de mapas hexagonais para quadrados — Lotes 1 e 2
Data: 07/11/2026 · Proposta de integração, **não publicada em produção**.

## Objetivo e limites
Migrar a área tática de batalha PTE/V3 e CRZ para malha quadrada, sem tocar em fichas de casas, baixas oficiais, missivas, contas ou calendário. A migração é opt-in por instância de mapa; nos formulários novos o padrão passa a ser quadrado, com alternativa hexagonal para legado.

## Lote 1 — contrato e geometria
- `BattleMap` e `CrzMap` conservam `schemaVersion: 2` com campo opcional `grid: 'square'`.
- **Campo ausente = hexagonal legado**. Coordenadas históricas `{q,r}` não são reinterpretadas.
- Em mapas quadrados, `q` é coluna e `r` é linha. Conversão e vizinhança são funções dependentes do mapa, não substituições globais do motor.
- O motor de Cruzada valida o identificador da malha contra o conjunto de regras. Presets hexagonais mantêm hashes originais; variantes quadradas recebem hashes distintos aceitos pelo mesmo mecanismo verificável.
- Cenários, limites 11×9 / 15×11, zonas de implantação, conectividade e importação JSON preservados.

## Lote 2 — execução e interface
- Percursos em 8 direções. Movimento ortogonal: custo normal do terreno; movimento diagonal: custo do terreno + **0,5**. Com orçamento inteiro, por exemplo, o movimento diagonal numa planície custa 1,5 de 6.
- Proibido passar diagonalmente se **qualquer um** dos dois quadrados ortogonais adjacentes estiver bloqueado por rocha ou outra unidade.
- Distância de combate: Chebyshev (`max(|Δcol|,|Δrow|)`); adjacência diagonal conta para combate corpo a corpo, formação, retaliação, ZOC e poderes.
- Linha de visão: supercover conservador centro-a-centro, com bloqueio por terreno intermediário e células tocadas em cantos.
- IA, ataques, habilidades de comando e área de magia usam a distância da malha atual. Turnos são validados pelo redutor correspondente.
- `BattleBoard` (PTE/V3) e `CrzBoard` (CRZ) desenham `<rect>` para square e mantêm `<polygon>` para hex.
- PTE, V3 e CRZ oferecem seleção de tipo de malha; novos formulários iniciam em quadrado. Hexagonal permanece selecionável para testes e replays antigos.

## Compatibilidade e não regressão
- A ausência do novo campo preserva a serialização do histórico hexadecimal, inclusive assinaturas e replays existentes.
- Não há migração automática de partidas ativas, nem alteração de registros persistidos.
- Nomes internos legados `Hex`, `movementHex` e `rangeHex` permanecem por compatibilidade de API; suas unidades agora são células táticas em mapas square.
- Todos os mapas criados no modo quadrado são simulações independentes, sem escrita nas propriedades oficiais.
- Nenhum deploy é solicitado por estes commits; a integração requer CI e validação visual desktop/mobile.

## Testes acrescentados
`src/test/battle-square-grid-lots-1-2.test.tsx` cobre: quatro cenários em ambos os tamanhos, 8 vizinhos e 6 legados, custo diagonal, esquina bloqueada, tiro em esquina, elementos SVG quadrados, variante CRZ e replay SHA-256. Os testes existentes de UI foram adaptados para aceitar o nome da malha sem reduzir as validações de interação.

## Pendente para próximos lotes
- Calibração de balanceamento dos alcances e magias de área no novo tabuleiro.
- Testes completos de navegação por teclado em quadrado e inspeção visual responsiva com objetos reais.
- Decisão explícita de política para converter mapas personalizados hexagonais em quadrados, sem mover unidades de partidas já iniciadas.
- Teste integral em homologação, análise de CI e publicação controlada após aprovação.
