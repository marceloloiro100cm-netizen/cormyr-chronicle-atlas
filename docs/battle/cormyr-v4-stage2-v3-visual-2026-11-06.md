# Cormyr — V4, etapa 2: arena V3 no padrão aprovado

## Objetivo
Aplicar a identidade visual da nova arena unificada (PR #299) ao modo PTE-3.0-SANDBOX / V3 já usado por Narrador e jogadores, **sem trocar o motor de combate** e sem misturar persistências CRZ/PTE.

## Entregas executadas
- **Quadro do General à esquerda:** espaço quadrado para o retrato futuro; nome, título, estado do poder, habilidade de comandante, habilidades da unidade e apenas três comandos administrativos (Defender, Esperar, Fim de turno).
- **Ordem horizontal no topo:** pilha ativa primeiro, fila regular, unidades em espera e demais capazes sem duplicação. Mouse e foco de teclado marcam no mapa com anel dourado; clicar no card inspeciona, mas não transfere autorização.
- **Mapa central:** uso do BattleBoard compartilhado com variante opcional `theme="cormyr"`; lado aliado em azul e adversário em vermelho, anel verde na seleção, vermelho para ataque legal, zoom preservado. A alteração é visual e não modifica o componente quando usado em outros modos.
- **Clique contextual:** selecionar a pilha ativa habilita hexágonos legais de deslocamento e alvos de ataque; clicar em um deles manda o comando **exato** do catálogo `getLegalActions` ao motor `v3PlayCommand`. Sem botões Mover/Atacar ou bypass das regras. Clicar em uma pilha de outro lado apenas consulta. Magias de comandante e habilidades especiais permanecem em modo de seleção explícito, com botão de cancelamento.
- **Últimas ações à direita:** as últimas seis mensagens do `game.log`, com opção de histórico completo. Não altera o registro de replay nem escreve no banco de campanha.
- **Legibilidade:** fontes maiores, alto contraste, cores bronze/azul/vermelho, molduras originais, layouts fluidos de 3, 2 ou 1 coluna conforme largura e mapa rolável em telas estreitas.

## Segurança e compatibilidade
- Apenas `BattleV3Game.tsx`, `BattleBoard.tsx`, CSS exclusivo e testes são alterados. Os redutores, livros de regras, fichas das casas, Supabase e dados de jogadores permanecem intactos.
- O estilo V4 do CRZ em PR #299 e o modo V3 compartilham apenas a **identidade visual**, não dados, RNG, regras, salvamento ou habilidades.
- No jogo, o menu de jogador existente continua exibindo apenas **Batalhar**. A criação e o controle de convocações oficiais seguem como antes.
- O retrato do comandante é somente placeholder; artes de terceiros não são reutilizadas.

## Critérios de aceite antes da publicação
1. Vitest completo e novo teste da arena V3; TypeScript; build; smoke sintético e bancos de testes descartáveis.
2. Verificação de foco de teclado no topo e no mapa; clique de movimento, ataque legal, turnos de IA, poder do General e histórico.
3. Revisão visual manual em desktop (~1440px), tablet (~768px) e celular (~390px). O browser smoke sintético existente **não substitui** esse teste visual.
4. Confirmar no navegador autenticado que nenhum clique em inimigo permite movimentá-lo quando não é sua vez.
5. Publicar somente após integração revisada dos PRs #299 e do PR empilhado desta etapa; não permitir que mudanças experimentais sobrescrevam commits posteriores de segurança.

## Continuidade
Após aceitação visual, aplicar os mesmos elementos à arena PTE-2.0 genérica e ao editor de mapas, quando isso não comprometer as ferramentas de administração do Narrador. Os retratos definitivos serão vinculados em outra etapa.
