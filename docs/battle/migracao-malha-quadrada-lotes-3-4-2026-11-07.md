# Migração para malha quadrada — execução dos Lotes 3 e 4
**Data:** 07/11/2026 — **PR:** #322 — branch isolada, sem publicação de produção.

## Lote 3 — mapas personalizados e integridade topológica
1. Criado `src/lib/battle/geometry/map-conversion.ts`, com `previewBattleMapGridConversion` e `convertBattleMapGrid`.
2. Conversão não é redimensionamento nem redesenho destrutivo: calcula `linha, coluna` de cada célula na malha de origem e recria sua coordenada na nova malha. Preserva ordenação, identificação do mapa, legenda, terreno de cada célula, zonas A/B e dimensões.
3. Todo mapa novo passa pelo validador **antes de aplicar**. Falhas de origem ou destino recusam a conversão. Não altera mapas usados por partidas já iniciadas.
4. `BattleMapEditor` inclui **Prévia: converter para ...**; informa quantas células e zonas foram preservadas, e só oferece **Aplicar conversão validada** quando não há alertas e o mapa original não mudou. O botão **Desfazer pincel** reverte a operação.
5. Os seletores das configurações PTE convertem o mapa existente em vez de descartar terrenos personalizados. Se a conversão falhar, o mapa permanece inalterado e a UI mostra erro.
6. A conectividade de mapas quadrados agora exige passagem diagonal fisicamente possível: dois obstáculos ortogonais impedem a conexão por canto tanto no validador PTE quanto no CRZ.

## Lote 4 — integridade de replay e suíte de homologação
1. O replay **PTE** usa hash de JSON canônico; alterado para admitir os custos diagonais de **0,5 ponto** em passos exatos. Inteiros mantêm exatamente a representação antiga e preservam o hash dos replays hexagonais existentes.
2. Novo conjunto `src/test/battle-square-grid-lots-3-4.test.tsx` cobre conversão bidirecional, cenários 11×9/15×11, importação JSON, mapas inválidos, bloqueio por canto, ocupantes, controles do editor, replay PTE quadrado e CRZ quadrado.
3. Cenários de browser sintético (Playwright) verificam 99 células quadradas no mapa V3 e no laboratório CRZ e permitem retornar ao modo hexagonal de legado.
4. Marcas semânticas `data-battle-cell-shape` e `data-crz-cell-shape` separam células do mapa de elementos auxiliares (por exemplo, barra de vida), para que os testes não produzam falsos positivos.
5. A correção de coordenadas exibidas no dossiê CRZ usa `crzGridToOffset` para respeitar a malha escolhida.
6. Os testes de banco são isolados; nenhuma etapa modifica credenciais, fichas, atributos oficiais, perdas, missivas, espionagem ou Hub Temporal.

## Critérios de liberação
- [ ] Unitários e componentes (Vitest) aprovados no SHA final do PR
- [ ] TypeScript e build aprovados no SHA final do PR
- [ ] Browser desktop e celular aprovados no SHA final do PR
- [ ] Validação em ambiente de homologação com sessão real de Narrador/jogador (não substituível pelo browser sintético)
- [ ] Aprovação específica para deploy em produção

**Atenção:** esta documentação registra as alterações propostas; os critérios acima só devem ser marcados quando comprovados no GitHub Actions e em homologação. Não transformar o PR em resultado oficial de batalha e não converter mapas históricos automaticamente.
