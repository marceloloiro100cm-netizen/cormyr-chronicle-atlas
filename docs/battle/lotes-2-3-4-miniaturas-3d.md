# Cormyr Chronicle Atlas — Miniaturas rígidas 3D, lotes 2, 3 e 4

Data: 10/11/2026. **Protótipo no código, em revisão, sem publicação nem acesso liberado aos jogadores.**

## Objetivo e decisões imutáveis

- Um token é uma pilha tática de unidades; não se criam um modelo por soldado, bones, rigging ou animações corporais.
- Os três motores de batalha (GOT, Adaptado V3 e D&D/CRZ) continuam independentes. A camada 3D é estritamente uma **projeção visual de estados imutáveis**, que apenas chama os handlers existentes.
- O mapa 2D permanece padrão e é fallback; o Narrador precisa habilitar miniaturas na sessão e escolher “Miniaturas 3D (teste)”. Nenhum modo 3D é habilitado para o sandbox de jogadores.
- Distâncias físicas: GOT = **10 m/quadrado**, D&D = **3 m/quadrado**. Coordenada gráfica unitária do renderer não é uma nova medida de distância e não modifica regras, hashes, seeds, replays, saves, banco nem fichas.

## Lote 2 — Catálogo Cormyr

`src/lib/battle/visual3d/tokens.ts`: `CORMYR_MINIATURE_TYPES` contém os 17 identificadores oficiais, com `classifyMiniature` explícita e fallback seguro.

`src/components/battle/miniatures3d/RigidModels.tsx` cria miniaturas originais em geometria sólida (sem download externo), distinguindo:
- apoio (caixa de suprimentos), arqueiros (arco e aljava), batedores (capuz e bolsa), cavalaria (cavalo e montaria);
- criminosos (adagas), cruzados (escudo com cruz), engenheiros (ferramentas), especial (cajado e esfera);
- guarda pessoal (armadura ornamentada), guarnição (escudo alto), guerrilheiros (armamento leve);
- infantaria (espada e escudo), marinheiros (chapéu naval), mercenários (machado e equipamento misto);
- navios de guerra (casco e vela, peça naval), plebeus recrutados (equipamento simples), saqueadores (machado e tocha).

Cores do exército provêm do lado e nomes de Casas são exibidos apenas quando já fornecidos pelo sistema. Não foram inventados brasões oficiais nem modificadas as imagens das Casas. A galeria **Ver protótipo 3D → 17 unidades** é artificial e isolada.

## Lote 3 — GOT e D&D

`src/lib/battle/visual3d/adapters.ts` transforma em leitura:

- GOT: cria tabuleiro quadrado com dimensões **reais da partida** (não exige formato 11×9), tradutor gráfico de terrenos incluindo água e povoações, peças por unidade viva, Saúde como indicador. Navegar/toque preserva `selectMapCell` que escolhe destino/unidade/alvo, sem executar ordens automaticamente. Condições do livro, moral, clima e ações continuam no motor GOT.
- D&D: usa tabuleiro CRZ existente, mapeia identidades militares via `dndMilitaryType` e criaturas em famílias visuais (goblin, dragão, morto-vivo, constructo, fera, gigante, humanoide e genérico), com rótulo. Criaturas grandes, enormes ou gigantes recebem a **pegada do motor**, usando `crzFootprintCells`; o toque sobre célula coberta se converte na âncora original. Voo recebe haste visual sem calcular física ou liberar novo movimento.
- `MiniatureBoardToggle` é uma camada reutilizável de alternância; GOT e D&D mantêm as interfaces 2D anteriores e o Narrador precisa ligar explicitamente o 3D na preparação. Os modos de jogadores não veem o controle.
- O Adaptado V3 agora exibe os 17 tipos e o nome da Casa quando já autorizado; a seleção/comandos continuam no motor V3 e `BattleBoard`.

Os estados de jogo não contêm `kind`, materiais nem cenas 3D; a projeção não é serializada.

## Lote 4 — Desempenho e acessibilidade

- Three.js/React Three Fiber são importados sob demanda pelo viewport 3D, sem custo WebGL inicial no 2D.
- Câmera ortográfica e dois ângulos; pan com botão esquerdo/um dedo, zoom por botões/roda/pinça, controle de centralização. Arrastar não executa movimento de peça quando o ponteiro deslocou-se acima do limiar.
- Desenho sob demanda (`frameloop='demand'`) e DPR limitado. Batalhas acima de 24 tokens usam geometria simplificada e minimizam rótulos não selecionados. Iluminação simples dispensa assets HDR e pré-processamentos caros.
- Em ausência ou perda de contexto WebGL, retorna ao 2D com aviso. O renderer não é pré-requisito para qualquer batalha.
- `prefers-reduced-motion` desliga a interpolação de posição e não há animações corporais.
- O 2D existente preserva navegação por teclado e leitura de quadrados. **A interação teclado completa diretamente sobre o canvas ainda é uma melhoria futura**, não esconder essa limitação. O botão 2D permanece acessível.
- Botões de câmera com alvo mínimo de 44 px; rótulos de contagem e categoria recebem limites de largura.

## Testes e validação

Cobertura incluída:
- `src/lib/battle/visual3d/tokens.test.ts`: 17 tipos, fallback, posição, isolamento e acesso.
- `src/lib/battle/visual3d/adapters.test.ts`: GOT dimensões/terrenos/condições, D&D pegada e voo, famílias, não mutação.
- `src/components/battle/miniatures3d/miniatures3d.test.tsx`: 2D default, falha WebGL, acesso Narrador, demo V3.
- `src/components/battle/miniatures3d/miniatures-lots-2-4.test.tsx`: galeria 17, opt-in GOT e D&D Narrador, fallback inicial.
- Continuam necessários testes reais Chromium com WebGL e validação manual Android intermediário; o pipeline browser sintético nem sempre cria uma GPU virtual para validar material, pose e câmera.

Checklist para aceitação:
1. CI `bun install --frozen-lockfile`, testes Vitest, `bun run build` e navegador sintético aprovados no commit final.
2. Narrador: iniciar e retomar uma partida em cada modo; abrir 2D e 3D, selecionar, mover, atacar, verificar resultado e comparar replay. Nenhum símbolo/modelo aparece no arquivo do replay.
3. D&D: criatura de tamanho G (4×4), ataque sobre célula de pegada e voo sobre obstáculos; comparar com os mesmos comandos no 2D.
4. GOT: mapa 12×7, água, muralhas, clima, navio e tropas destruídas; assegurar que o 3D não decide ação.
5. Android e desktop: zoom, pan, clicar após arrastar, touch, perda WebGL, letras e fluidez com 40/80 tokens. Metas de desempenho só devem ser afirmadas após medição.
6. Jogador: não recebe habilitação 3D em GOT/D&D/Adaptado, dados privados não são incluídos em assets públicos.

## Pendências e riscos aceitos nesta fase

- A animação visual desliza diretamente entre posições validadas, sem seguir rota intermediária; não altera cálculo do caminho.
- Modelos são protótipos geométricos originais, não GLB artísticos finais. Texturas, detalhes, brasões autorizados e modelos de criaturas específicas poderão ser adicionados sem alterar motores.
- Os monstros que não têm uma família reconhecida usam peça genérica com rótulo verdadeiro, sem inventar identidade.
- A cena não mostra todos os terrenos e construções de GOT em modelos físicos exclusivos: faz agrupamentos de **aparência**, não de regras.
- Não há otimização de instanciamento geométrico completa. Futuro lote deve medir draw calls/GPU real antes de fixar limites.
- Nenhuma migração, mudança de login/senha, RLS, data, banco, deploy, merge em main ou liberação a jogadores faz parte deste PR.
