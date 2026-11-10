# Auditoria UX — Pendências dos lotes 1–5 (continuação)
Cormyr Chronicle Atlas · 10/11/2026 · branch `fix/battle-3d-ux-p0-navigation-actions` · PR #366

## Objetivo
Avançar os lotes UX-1/2/3 do relatório 60/100 sem criar um segundo motor
de regras e sem modificar batalhas reais, Hub Temporal, fichas, saves ou acesso
dos jogadores. A visão 3D continua experimental e opt-in, somente para Narrador.

## Concluído em código
- **UX-1 / P0:** estabilidade do alvo de câmera em pan/zoom, foco da peça,
  perspectivas superior/isométrica e confirmação de ação (PR #366 já continha).
- **UX-2 / P1:** inspeção de célula com terreno, ponte/estrada, ocupante e
  notas de regras recebidas do motor GOT. O renderer não inventa custos de
  movimento ou cobertura em Adaptado/D&D quando o motor não fornece notas.
- **UX-2 / P1:** ação não legal em casa vazia/hostil não despacha callback
  enquanto o motor está em modo de comando; selecionar aliado continua
  permitido; ações legais dependem de confirmação P0.
- **UX-2 / P1:** bases diferenciadas por geometria (atacante circular,
  defensor quadrada), legenda por formas, contorno externo contínuo para
  ocupação de criaturas grandes, marcas discretas de terreno por forma.
- **UX-2 / P1:** resumo compacto com ronda/lado ativo, saúde/defesa/moral
  (quando existentes), atributos adicionais sob demanda.
- **UX-2 / P1:** resumo de preparação separado do combate em GOT e CRZ/D&D.
  Posições de preparação do GOT continuam no editor existente. Sem
  posicionamento manual por padrão nem alteração dos motores.
- **UX-3 / P1:** visão móvel map-first, barra de câmera rolável com alvos de
  toque 44 px, resumo abaixo do mapa, confirmação visível, layout paisagem.
  A interface 2D e seus controles originais continuam disponíveis.
- **UX-3 / P2:** navegação acessível por combobox de quadrados no 3D (teclado
  e leitores de tela), mesma validação/confirmar; teclado por setas continua
  disponível no 2D.
- **UX-3 / P2:** perfis sintéticos 40/80 miniaturas e medidor opt-in de FPS
  por 5 segundos usando quadros realmente renderizados; métricas de draw
  calls/triângulos e DPR mais baixo a partir de 40/60 peças.

## Testes e verificações a executar/confirmar
- Testes puros: `terrain-inspection`, `footprint`, `performance`,
  `ux-audit-regression`; testes de componentes: `miniatures-p0`,
  `miniatures-p1-toggle`, `miniatures-preflight`.
- Navegador Chromium WebGL2: gestos, câmera, e teclado/confirmar,
  40/80 peças. CI com SwiftShader **não** é benchmark Android real.
- Executar `Validate` (testes, TypeScript, build) e
  `Battle browser acceptance (synthetic)` no SHA final, corrigindo
  regressões antes de qualquer merge.

## Gates de homologação ainda externos ao código
- [ ] Comparar ações, estados, replays e resultados no Narrador autenticado
  GOT / Adaptado / D&D (mapas 11×9 e 15×11).
- [ ] Android intermediário físico: 40/80 peças; coletar ao menos 3 amostras
  de FPS em cada cenário, gestos de pan/pinça, orientação retrato/paisagem,
  revisão 320–390 px, queda de renderização e fallback 2D.
- [ ] Critério inicial: mediana de pelo menos 30 FPS **em ação**, sem ordens
  acidentais e sem dados essenciais encobertos. A medição ainda não existe
  até que o Narrador a execute em dispositivo real.
- [ ] GOT: conferir o preview de posições iniciais no editor já existente;
  D&D/Adaptado: validar posições automáticas após criar a batalha. Não
  apresentar como prévia exata antes de a rotina de entrada calcular os locais.
- [ ] Liberar produção/jogadores somente após aceite explícito e guardrails
  de autenticação. Esta entrega não faz merge nem publica.

## Estimativa de maturidade
Não recalcular percentual de usabilidade com base somente em número de
commits ou testes sintéticos. A meta 85/100 continua alvo de avaliação em mesa,
não certificação do estado atual.
