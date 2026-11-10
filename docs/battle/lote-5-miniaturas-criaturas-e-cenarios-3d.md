# Cormyr Chronicle Atlas — Lote 5: criaturas rígidas 3D e cenários avançados

Data: 10/11/2026. **Implementação visual de desenvolvimento, sem publicação, sem alterar motores, sem acesso dos jogadores.**

## Escopo implementado

### 1. Bestiário visual (25 famílias)

- A camada `src/lib/battle/visual3d/creature-visuals.ts` classifica o nome, as tags e o `creatureType` já existentes nas criaturas D&D. Não lê estatísticas protegidas, arquivos externos nem modifica fichas.
- Famílias artísticas: goblinoides, kobolds, orcs, dragões, mortos-vivos, esqueletos, zumbis, espíritos, constructos, feras, gigantes, humanoides, elementais, infernais, celestiais, aberrações, limos, plantas, feéricos, insetos, aranhas, serpentes, trolls, aquáticos e enxames.
- `src/components/battle/miniatures3d/CreatureModels.tsx` desenha formas tridimensionais **originais, estáticas e sem rigging**. Não há animação de braços, passos, esqueleto, imagem protegida ou download de modelos alheios.
- A função `creatureMiniatureKind` continua dando prioridade absoluta aos identificadores das 17 unidades militares oficiais e depois encaminha monstros ao catálogo visual. Sem reconhecimento, aparece uma peça **genérica identificada**, não um tipo inventado.
- Não implica 25 espécies individualizadas nem 300 modelos únicos. Cada uma das criaturas selecionadas no módulo D&D continua usando sua ficha real e recebe apenas uma representação por família.

### 2. Mapas especiais sem mudança de regras

- O renderizador apresenta decoração geométrica baixa para planície, floresta, colina, rocha, água, cidade, costa, deserto, pântano, estrada, ponte, ruínas e montanha. Esses são **papéis artísticos**, não novos terrenos persistidos nas regras.
- O adaptador de GOT preserva `road` e `bridge` já declarados no terreno original, inclusive ponte sobre rio, sem modificar `WAR_TERRAIN`, `terrainEffect` ou estado da batalha.
- D&D conserva sua lista de quatro terrenos persistidos, as distâncias de **3 m por quadrado**, tamanho de criaturas e trajetória oficial do motor.
- GOT conserva **10 m por quadrado**, suas formações, clima, coberturas, unidades, cerco e ordens.
- Seleção de criatura grande destaca suas células de pegada com transparência. Esses destaques não criam colisões, alcance ou bloqueios novos. Voadores continuam exibidos em bases elevadas.

### 3. Laboratório visual de Narrador (sem simulação naval)

O botão existente **Ver protótipo 3D** ganhou três opções:
1. **25 famílias de monstros**: galeria pura com 25 peças sintéticas e suas silhuetas.
2. **Costa e navios**: praia, água, três navios militares e tropas na costa. A navegação e o combate naval **não** foram implementados neste lote: o motor terrestre continua recusando navios como soldados.
3. **Ponte e fortaleza**: ponte sobre rio, ruínas, relevo, guarnição e dragão fictício ocupando 4×4 quadrados. A cena não modifica movimento/ataque e não cria edifícios de campanha.

Cada cenário é montado em `src/lib/battle/visual3d/scenic-demos.ts` com IDs artificiais, sem banco, arquivos pessoais ou dados oficiais de Casa. A versão 2D dessas cenas é apenas uma grade demonstrativa legível; o 2D real dos motores permanece inalterado.

### 4. Acessibilidade e desempenho

- O renderer 3D continua opt-in, somente Narrador, com 2D inicial e fallback por ausência/perda de WebGL.
- As miniaturas seguem o modelo rígido do lote 1: apenas a translação é animada quando a posição de jogo muda; nunca se executam regras no Canvas.
- Contadores são sprites WebGL. Identificação da unidade selecionada permanece em HTML acessível acima do canvas; suporte integral de teclado permanece no mapa 2D.
- Os novos elementos do cenário são baixos para preservar a visibilidade das peças; a opção de cena carregada aplica o mesmo controle de DPR, desenho sob demanda e modelo simplificado já existente.
- Galerias são testes artificiais; dados do Narrador não entram nos assets públicos.

## Arquivos principais

- `src/lib/battle/visual3d/tokens.ts`
- `src/lib/battle/visual3d/creature-visuals.ts`
- `src/lib/battle/visual3d/adapters.ts`
- `src/lib/battle/visual3d/scenic-demos.ts`
- `src/components/battle/miniatures3d/CreatureModels.tsx`
- `src/components/battle/miniatures3d/RigidModels.tsx`
- `src/components/battle/miniatures3d/ScenicTile3D.tsx`
- `src/components/battle/miniatures3d/MiniatureScene.tsx`
- `src/components/battle/miniatures3d/MiniatureDemo.tsx`
- `src/components/battle/miniatures3d/palette.ts` e `miniatures3d.css`
- `src/lib/battle/visual3d/lot5-scenes.test.ts`
- `tests/battle/browser/test_miniatures3d.py`

## Testes e gates de entrega

Automatizados:
- 25 famílias sem duplicatas; compatibilidade das 17 unidades militares; reconhecimento de nomes e tags; fallback genérico e ausência de mutação dos dados.
- Três cenas 15×11 com 165 casas, coordenadas válidas, navios somente na água, dragão com pegada 4×4 e preservação de pontes/estradas de GOT.
- Chromium/SwiftShader com screenshot das três novas galerias, montagem/desmontagem sem erro JavaScript, teste 2D quando WebGL indisponível, além dos 17 testes anteriores e teste de 80 miniaturas.
- Pipeline de CI com `bun install --frozen-lockfile`, TypeScript, build e testes de domínio.

**Não realizado nesta etapa:** teste de combate naval jogável, importação adicional de monstros/licenças, renderização artística GLB individual de todo bestiário, execução autenticada de todas as regras D&D/GOT, benchmarks físicos de Android e liberação para jogadores. Estes itens exigem projetos e testes separados.

Não publicar em produção nem fazer merge em main antes da revisão dos screenshots do lote 5, dos gates de CI e da aceitação manual em dispositivo real.
