# Cormyr — UX de batalha, lotes 1, 2 e 3 (9/11/2026)

## Objetivo
Reduzir ações visíveis e textos longos sem alterar motores, regras de dados,
fontes oficiais, save/replay, estado da campanha ou autorização.

## Lote 1 — Entrada simples
- O Narrador escolhe GOT, Adaptado ou D&D, seguido de um único CTA "Criar batalha".
- A variante Adaptado Cruzada V3 continua disponível em "Mais opções" como
  "Cruzada com comandantes", junto das ferramentas técnicas.
- Os três motores permanecem independentes e seus status de laboratório
  continuam declarados.

## Lote 2 — Arena PTE contextual
- O campo PTE destaca deslocamentos e alvos legais assim que a unidade ativa
  está selecionada. Clicar/toquear um destino destacado emite MOVE; clicar um
  inimigo destacado emite ATTACK.
- As ações continuam validadas pelo redutor puro `applyBattleCommand`; não
  há novo atalho de permissão ou alteração de movimento/dano.
- Três controles principais: Defender, Esperar e Fim do turno.
- Para acessibilidade, existe "Controles por botões" com os modos Mover,
  Atacar, confirmação e cancelamento originais.
- `BattleTurnCue` orienta também o PTE e permite focar a unidade ativa.
- O inspetor traz um resumo de PV, efetivo, Ataque e Defesa; informações
  completas permanecem em "Ficha completa".

## Lote 3 — Preparação rápida
- GOT: "Batalhar agora" utiliza as unidades-modelo e o mapa já configurados,
  sem exigir abrir o formulário do livro. "Personalizar tropas, heróis e mapa"
  contém a preparação completa, guia de fases e importações opcionais.
  Salvamento do navegador fica em "Salvar ou retomar".
- D&D: "Batalhar agora" usa as quatro pilhas-modelo, d20, tabuleiro quadrado e
  posicionamento automático. "Montar exércitos e ajustar cenário" expõe
  biblioteca privada, composição, filtros, mapa e controles avançados.
- Adaptado: preparação rápida existente conserva fontes, terreno e adversário;
  campo desativado de malha quadrada deixa de competir com decisões úteis.
- CRZ experimental (outro fluxo do Adaptado) permanece com opções detalhadas
  abertas e sem alteração do motor.

## Invariantes
- `BATTLE_PLAYERS_ENABLED=false` continua aplicado.
- Nenhuma mutação de casas, armamentos, fichas, missivas, hub temporal,
  auth, banco ou credenciais.
- PTE, GOT e D&D preservam tipos de comandos, hash dos replays e cálculos.
- Campos avançados são progressivamente exibidos; não foram removidos.

## Teste/aceite
- Render de três sistemas, CTA rápido GOT e D&D e arena PTE;
- Teclado/toque no mapa, ataque legal, movimento legal, desfazer e
  confirmações avançadas;
- CI Vitest, TypeScript, produção, bancos isolados e Chromium sintético;
- Teste manual de Narrador autenticado em tela pequena e grande antes
  de uma nova publicação de produção.
