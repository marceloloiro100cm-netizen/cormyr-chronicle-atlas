# Cormyr — Módulo de batalha: lotes 4 a 6 (9/11/2026)

## Objetivo
Concluir a segunda etapa da auditoria de UX e jogabilidade, respeitando três
motores independentes e a preferência por poucos comandos e textos curtos.
Não altera regras matemáticas, migrações, autenticação ou dados oficiais.

## Lote 4 — Regras contextuais
- **GOT:** guia de seis fases não salta nenhuma etapa do motor. A fase corrente
  informa quando o confronto não tem armas de cerco ou heróis. O atalho para
  comandos só aparece nas fases de cerco ou ordens.
- A navegação da preparação abre automaticamente as configurações recolhidas
  dos lotes 1–3, quando necessário.
- **D&D:** após três rodadas de estagnação, mostrar uma revisão opcional.
  O sistema não força empate ou vitória: reposicionamento e encerramento
  continuam sob decisão auditável do Narrador.
- **Adaptado:** preserve a validação dos comandos legais e a ação direta no mapa.

## Lote 5 — Respostas e resultados
- `BattleActionFeedback`: resumo curto de uma ação resolvida, com rodada,
  dano e baixas quando disponíveis; sem recalcular resultados.
- Ações recentes aparecem no PTE, Cruzada V3, CRZ/D&D e GOT; o log detalhado
  e os replays continuam intactos.
- `BattleOutcomeSummary`: resumo de vencedor, rodada e perdas exibido com
  composição visual comum. Diferencia unidades destruídas de baixas individuais
  no GOT.
- Nenhum efeito de resultado altera a campanha.

## Lote 6 — Usabilidade técnica e regressão
- Estilos para controles de toque (44px nas ferramentas), foco visível,
  responsividade do resumo e respeito a `prefers-reduced-motion`.
- Componentes usam regiões semanticamente identificadas e anúncio discreto
  (`aria-live=polite`) para o retorno da jogada.
- Vitest: contexto GOT, impasse D&D, resumo de ação e resultado, movimento
  no mapa PTE, CSS e bloqueio dos jogadores.
- A suíte padrão de CI inclui Chromium sintético, testes, TypeScript, build e
  bancos isolados. Esses testes não substituem a sessão de Narrador real no
  celular após publicação.

## Invariantes de segurança
- `BATTLE_PLAYERS_ENABLED=false` permanece.
- Não publica no site nem altera fichas, tropas, recursos, Hub Temporal,
  missivas, autenticação, senhas, RLS ou banco de dados.
- Saves e replays anteriores preservam os formatos e versões.
- As decisões de impasse são somente orientações na interface.

## Limites
A revisão de impasse é orientativa e não reescreve a regra do D&D simplificado.
Acessibilidade e responsividade foram verificadas em código e testes
sintéticos; uso manual em dispositivos físicos continua recomendado.
