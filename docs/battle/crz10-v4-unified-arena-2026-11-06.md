# Cruzada CRZ V4 — Arena unificada de combate

**Primeira etapa do novo padrão visual aprovado em 06/11/2026.**

## Estrutura
- Uma arena responsiva: retrato vazio do General e habilidades à esquerda, ordem de combate horizontal no topo, mapa hexagonal dominante no centro, últimas ações no canto inferior direito.
- Abas secundárias Ações, Marcos, Relatório e Replay dentro da arena; nenhuma remoção de relatórios ou replay SHA-256.
- Design original em CSS e SVG: fundo escuro, molduras bronze, facções azul/vermelho, foco dourado, seleção verde, ataque vermelho, contraste alto, zoom de mapa e tipografia legível.
- Retrato apenas como quadrado reservado, sem imagem até o Narrador enviar os arquivos.

## Contrato de interações
- Clicar na pilha ativa seleciona e ilumina em verde; clicar em hexágono legal executa MOVE; clicar no inimigo com ataque legal executa ATTACK. Botões Mover e Atacar removidos.
- Clique em unidade fora de turno apenas inspeciona; ação ilegal não modifica estado. Nenhuma jogada contorna o redutor nem a lista de comandos legais.
- Hover ou foco pelo teclado nos cards de ordem de combate destacam a pilha correspondente com anel dourado no mapa; clicar no card inspeciona a pilha.
- Os comandos Esperar, Defender, Encerrar ativação, Conjurar, Preparar carga/salva/evasão e Executar turno da IA seguem sujeitos às regras originais.
- Teclado Tab, setas, Enter/Espaço, replay por etapas, importação/exportação JSON e modo de alto contraste preservados.

## Limites de segurança
Esta primeira etapa altera somente a interface de treino CRZ do Narrador. Não escreve no Supabase, não cria endpoints, não altera o calendário, contas, senhas, missivas, fichas de casas ou o motor PTE/V3. Nenhuma baixa da simulação impacta a campanha oficial. A apresentação usa CSS/SVG próprios; imagens de outros jogos são referências conceituais, não assets copiados.

## Aceite e continuidade
- CI completo: Vitest, TypeScript, build e testes PostgreSQL descartáveis.
- Testes visuais desktop/mobile e Navegação com mouse/teclado antes de publicação.
- A próxima etapa poderá estender a identidade visual ao modo V3 e às interfaces de jogador, mantendo seus motores isolados e exigindo revisão específica.
