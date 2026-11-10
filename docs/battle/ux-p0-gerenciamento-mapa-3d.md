# P0 — Gerenciamento do mapa de batalha 3D
**Cormyr Chronicle Atlas · revisão 10/11/2026**

## Intenção e fronteiras
Melhorar o **controle da batalha em andamento** sem modificar o motor GOT, Adaptado V3 nem D&D, os dados da campanha, o Hub Temporal, os salvos, as regras métricas ou as permissões. O 2D permanece padrão, o 3D continua experimental e disponível apenas ao Narrador.

## P0 implementados

### Câmera: preservar contexto
- `CameraRig` mantém o `OrbitControls.target` depois de arrastar o mapa quando se clica em +/− zoom ou alterna entre vista Superior e Isométrica.
- A projeção ortográfica usa os mesmos quadrados visuais sem qualquer conversão indevida de 3 m ou 10 m.
- **Focar tropa** centraliza a unidade ativa (ou a selecionada se não houver unidade ativa). No D&D, considera o centro de todas as células ocupadas por uma criatura grande.
- **Centralizar câmera** é a única ação que deliberadamente retorna ao centro do mapa, perspectiva isométrica e zoom padrão.
- Zoom de roda/pinça é preservado de maneira relativa ao mudar perspectiva, sempre dentro dos limites de segurança do renderer.

### Seleção: segurança de ação
- Selecionar e inspecionar um token é imediato.
- Em Adaptado e D&D, quando o motor **já forneceu** destinos legais ou IDs de alvos legais, o primeiro toque apenas cria a prévia; o motor recebe o comando **somente após o botão Confirmar movimento / Confirmar ataque / Confirmar habilidade**.
- Cancelar, perder a vez, perder permissão, trocar unidade ou invalidar a lista de comandos legais descarta a prévia sem alterar o estado do motor. Não existe novo cálculo de legalidade no renderer.
- A célula da prévia recebe um contorno de confirmação. Destinos legais continuam verdes; alvos legais, vermelhos.
- Clicar em casa inválida ou tropa sem ação legal preserva o comportamento de inspeção do modo original.
- GOT usa o toque 3D apenas para inspecionar/selecionar destino; as ações continuam nos botões originais do livro. A rota planejada passa a ficar visível em dourado no 3D e a casa escolhida tem destaque. Alvo selecionado não é falsamente representado como ataque legal.

### Informação tática imediata
- Quando disponível no estado original, o 3D mostra valores atuais (PV/CA/Defesa/Saúde, moral, movimento e equipamento) em um painel compacto.
- O painel identifica a unidade ativa e o nome da Casa somente se essa informação já é autorizada e recebida do motor. Não inventa atributos nem serializa dados extras.
- Uma instrução curta informa quantas casas de movimento e alvos foram marcados; um aviso específico confirma cancelamento, seleção ou foco da câmera.
- A interface apresenta o resumo fora do canvas para funcionar com leitores de tela e continuar legível quando WebGL falha.

## Riscos conhecidos e limites
- Confirmação explícita acrescenta um toque para efetuar movimento/ataque, mas evita uma ordem involuntária enquanto o usuário arrasta ou inspeciona o mapa.
- A vista 3D continua opt-in do Narrador; não foi adicionada seleção completa por teclado diretamente no canvas. O 2D preserva a acessibilidade funcional.
- Nenhuma regra, resultado de ataque, movimentação, cálculo de terreno, turno, iniciativa, ficha oficial ou conteúdo do replay mudou.
- A projeção de GOT desenha a **rota planejada** em dourado e não a interpreta como uma lista universal de movimentações legalmente confirmadas.
- A visão tática é de leitura; ajustes de unidades e parâmetros de terreno permanecem nos painéis administrativos originais.
- Animação visual de peça permanece translação direta; não implementa interpolação por rota ou movimentos corporais.

## Testes
- `src/lib/battle/visual3d/interaction.test.ts`: autorizações, ataques em criaturas com múltiplas células, invalidação de proposta e foco matemático.
- `src/components/battle/miniatures3d/miniatures-p0.test.tsx`: envio somente após confirmação, cancelamento, habilidade, seleção simples, troca de turno, foco e fallback WebGL.
- `tests/battle/browser/test_miniatures3d.py`: câmera com mouse, zoom e foco em Chromium/WebGL2 SwiftShader, sem execução de comandos ao arrastar, além das galerias, 80 tokens e fallback 2D anteriores.
- `Validate`: tests, TypeScript e build; `Battle browser acceptance`: navegação real em Chromium com renderização por software.

## Aceitação antes de produção
- [ ] Ambos os workflows CI aprovados no commit final.
- [ ] Teste manual autenticado do Narrador em homologação (Adaptado, GOT e D&D), com seleção, ataque, cancelamento, mudança de turno e confronto de resultados com 2D.
- [ ] Teste em celular Android físico: toque, arrastar, zoom de dois dedos, leitura do resumo, ação de confirmação e nenhuma ação involuntária.
- [ ] Testar troca de perspectiva e foco nos mapas 11×9 e 15×11.
- [ ] Nenhum merge/publicação no site e nenhum acesso novo dos jogadores antes dessa homologação.
