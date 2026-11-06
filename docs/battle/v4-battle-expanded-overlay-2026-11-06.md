# V4 — Arena de batalha ampliada (06/11/2026)

## Pedido do Narrador
Ao clicar **Batalhar** (V3) ou **Iniciar treinamento CRZ** (CRZ-1.0), abrir automaticamente uma visão ampliada **sobre o site**, em vez de restringir o tabuleiro à largura da coluna central do painel de Narrador. Remover o botão conceitual **Ajustes** do painel do General. A seta superior direita permite sair e voltar ao modo ampliado, sem reiniciar a batalha.

## Implementação
- `BattleExpandedView` é um portal React para `document.body` com `role=dialog`, `aria-modal=true`, teclado (Tab e Esc), foco inicial e rolagem da página bloqueada enquanto estiver aberto. Não depende de permissão para a Fullscreen API, nem altera a URL ou o histórico do navegador.
- V3: a arena se amplia assim que `createV3Game` retorna sucesso. `Sair da tela ampliada` (ou Esc) volta à visualização normal e **preserva todos os comandos executados**; `Ampliar batalha` reabre a mesma partida.
- CRZ: o laboratório também se amplia após `crzReplayBegin` e após importação verificada de replay, sem modificar RNG, regras, hash, relatório ou dados. O estado de replay permanece enquanto a janela é minimizada.
- O diálogo usa toda a largura e altura disponíveis; remove o menu do site apenas da **visualização**, não do DOM nem das permissões. Exibe a ordem de combate no topo, General à esquerda, mapa dominante e registro de ações à direita, com adaptação para desktop/tablet/celular.
- A marcação do protótipo que riscava o botão **Ajustes** foi respeitada: a nova interface não cria esse botão; os controles de zoom do mapa (reduzir, ampliar e restaurar escala) continuam funcionais porque não são configurações do General.
- Botões `Nova batalha`/`Novo treino` encerram a simulação e retornam à seleção de forças. A saída do modo ampliado **não** encerra nem altera a partida.

## Isolamento e regressões
Nenhuma mudança em motor PTE/CRZ, banco, RLS, credenciais, contas, fichas oficiais, missivas ou Hub Temporal. Testes verificam abertura automática, ausência de Ajustes, preservação do estado após sair/reabrir, Esc, foco/scroll, clique contextual, replay e viewport Chromium desktop/mobile. O acesso do Narrador e do jogador segue as permissões já existentes.

## Publicação
Abrir PR próprio sobre `main`; exigir CI TypeScript, Vitest, build, bancos de teste e navegador. Sem merge/deploy automático desta etapa até que a versão esteja validada; integração mediante autorização do Narrador.
