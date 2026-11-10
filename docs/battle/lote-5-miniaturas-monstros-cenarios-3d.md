# Cormyr Chronicle Atlas — Lote 5: monstros e cenários avançados 3D

Data: 10/11/2026. **Somente branch de desenvolvimento; não publicar, não liberar para jogadores e não alterar banco/regras.**

## Escopo

O Lote 5 amplia a camada de visualização rígida 3D criada nos lotes 1–4, usando dados que os motores GOT e D&D já produzem. Nenhuma criatura, batalha, estado de jogo ou atributo é adicionado ao catálogo ou à campanha por esta tarefa.

### Monstros — 30 arquétipos visuais

- 7 famílias-base herdadas dos lotes anteriores: goblin, dragão, morto-vivo, constructo, fera, gigante e humanoide.
- 23 silhuetas procedurais novas: hobgoblin, bugbear, orc, ogro, troll, kobold, dragão jovem, dragão ancião, dracolich, esqueleto, zumbi, espectro, lich, vampiro, golem de pedra, golem de ferro, armadura animada, lobo, urso, aranha, elemental, ínfero e celestial.
- Modelos geométricos de postura fixa; nenhuma animação de partes do corpo, arquivos de malha externos, licenças de terceiros, texturas proprietárias ou esqueleto.
- O adaptador `creatureMiniatureKind` continua **somente de leitura**; agora usa tipo e nomes/tags autorizados em português/inglês, com prioridade ao ID de unidade militar original do D&D. Se nenhum tipo casar, usa peça genérica **explicitamente marcada**.
- Dragões reconhecem cores vermelho, azul, verde, preto, branco, dourado, prateado, bronze, cobre e latão. Isto altera **apenas cor da malha**, não CA, PV, dano, resistência, voo ou qualquer outra regra.
- Os **300 monstros privados** existentes são lidos pela aplicação apenas nos fluxos privados que já existiam: o Lote 5 não copia nem gera um catálogo JSON público. Uma família pode representar várias criaturas; não prometemos 300 miniaturas específicas.

### Criaturas grandes, voo e regras

- D&D conserva a área real calculada por `crzFootprintCells`: L 2×2, H 3×3, G 4×4 na malha quadrada; o 3D apenas centraliza e escala a base visual e seu anel.
- Criaturas voadoras continuam recebendo haste de exibição; movimentação, custos, terreno e impedimentos permanecem estritamente no motor D&D.
- Monstros derrotados, debandados ou retirados desaparecem conforme os filtros já existentes em `crzVisualTokens`, sem duplicação de lógica.
- Sistema de medidas preservado: D&D 3 m/quadrado, GOT 10 m/quadrado. Unidade gráfica do renderer não é unidade física.

### Terrenos especiais e navegação

- Adaptador GOT mapeia campos de terreno **sem alterar** `terrainEffect` ou ordens: estrada, ponte sobre rio, muralha, ruínas, pântano, costa e ilha, além dos tipos de superfície anteriores.
- `MiniatureScene` desenha pontes baixas, estradas, costões, pequenas ilhas, pântanos, pedras e barreiras com geometria estática. São **marcadores visuais**, e jamais geram custo, altura, cobertura ou navegação próprios.
- Galeria fictícia **Costa naval** usa água, ilhas e quatro embarcações rígidas distintas por lado e marinheiros na costa. Não implementa combate naval oficial. O motor GOT já pode fornecer unidade `naval` e terreno `coast`, mas não há um módulo naval de ações novo.
- Galeria fictícia **Terrenos especiais** contém ponte, rio, ruínas, muralha, estrada, miniatura voadora e base de criatura de 4×4 quadrados. São demonstrativos; não salvam nem criam fichas.
- O mapa 2D continua padrão nos três sistemas e permanece disponível em falha de WebGL. As novas galerias têm fallback 2D com nomes, seleção acessível e superfícies diferenciadas.

### Controles / acesso

- `MiniatureDemo` segue exclusivamente ao Narrador e isolado dos redutores de batalha. Botões principais “4 protótipos” e “17 unidades”; seletor único “Monstros e cenários” oferece Monstros I, Monstros II, Costa naval e Terrenos especiais.
- Nenhuma dessas prévias executa ataque, cálculo de alcance, criação de batalha, salvamento ou alteração de patrimônio; são **maquetes de visualização**.
- Regras GOT, Adaptado e D&D, data do HUB Temporal, espionagem, Supabase e todos os acessos de jogadores permanecem intactos.

## Arquivos principais

- `src/lib/battle/visual3d/monster-kinds.ts` — taxonomia visual própria e cores de dragão.
- `src/lib/battle/visual3d/adapters.ts` — classificação dos metadados D&D e marcações decorativas de terreno GOT.
- `src/lib/battle/visual3d/tokens.ts` — contratos somente visuais com detalhes de superfície/tinta.
- `src/components/battle/miniatures3d/AdvancedMonsterModels.tsx` — silhuetas autorais em Three.js.
- `src/components/battle/miniatures3d/RigidModels.tsx` — integração dos 23 modelos adicionais.
- `src/components/battle/miniatures3d/MiniatureScene.tsx` — decoração de terrenos; 30 modelos ainda detalhados, modo compacto para mais de 40 tokens.
- `src/lib/battle/visual3d/advanced-demos.ts` — mostruários de 30 criaturas, costa e obstáculos.
- `src/components/battle/miniatures3d/MiniatureDemo.tsx` — seleção simples das galerias.
- `src/components/battle/miniatures3d/VisualGalleryFallback.tsx` — fallback 2D para cenas não suportadas pelo `BattleBoard`.
- `src/lib/battle/visual3d/advanced-demos.test.ts` e `tests/battle/browser/test_miniatures3d.py` — regressões e screenshots WebGL2.

## Homologação

A evidência automatizada corresponde somente aos runs associados ao commit final do PR. É obrigatório verificar:

1. `bun install --frozen-lockfile`, testes unitários/componentes, `bunx tsc --noEmit` e `bun run build`.
2. Playwright com Chromium/SwiftShader: duas páginas de 15 monstros, costa naval, pontes/muralhas, seleção, troca de cena sem erro JS e fallback 2D com WebGL desligado.
3. Android real (meta inicial 30 FPS, sem medição ainda) e computador com GPU física, incluindo 40/80 modelos, rotação/zoom e toque.
4. Simulações reais em homologação com Narrador: um dragão G 4×4, goblinoides, mortos-vivos, constructos e unidades navais se o motor subjacente suportar tais regras. Comparar comandos/saídas 2D vs. 3D.
5. Continuar restringindo 3D ao Narrador em sessão opt-in, mantendo 2D por padrão. Jogadores não recebem controles de teste.

### Limitações declaradas

- 30 silhuetas não são 300 modelos artísticos exclusivos; criaturas não classificadas exibem um token genérico.
- Os cenários de costa/naval e especiais não substituem um sistema naval oficial, não simulam marés ou física e não definem alcance/restrição de terreno.
- Nenhum desempenho de GPU física foi medido, e o navegador emulado não é prova de fluidez em Android.
- As geometrias originais são protótipos de arte para inspeção visual e podem receber acabamentos sem modificar os dados de jogo.
- A implementação é uma **PR empilhada**, não mesclada em main, e não publicada em produção.
