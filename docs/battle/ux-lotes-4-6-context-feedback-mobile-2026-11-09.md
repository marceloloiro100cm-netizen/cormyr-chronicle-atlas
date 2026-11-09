# Cormyr — UX de batalha, lotes 4, 5 e 6 (9/11/2026)

## L4 — regras e fases somente quando pertinentes
- GOT: guia de seis etapas intacto; cerco sem máquinas e janelas sem heróis são indicados como *sem ações*, mas não são pulados nem recalculados.
- GOT: ordens do capítulo 10 agrupadas em **Ordens comuns** e **Táticas e manobras**. Mantidas 100% das opções legais originais, com o mesmo comando `issueWarOrder`; a implementação ainda não certifica 100% de paridade com o livro.
- D&D: após **três rodadas completas sem dano nem alteração de efetivo**, o Narrador recebe um aviso **Revisar impasse**. O aviso abre o gerenciamento D&D já existente; o motor **não encerra nem elege vencedor automaticamente**. Nenhum aviso aparece no sandbox de jogador.
- CRZ e Adaptado preservam sua IA, moral, habilidades e regras independentes.

## L5 — feedback e resultados
- Componente compartilhado `BattleActionPulse` resume ataques (acertos/PV/baixas), movimento e defesa sem alterar eventos, replays ou semântica dos motores.
- `BattleOutcomeSummary` oferece um formato visual consistente de vitórias, sobreviventes, baixas e rodada em PTE, Cruzada V3, CRZ/D&D e GOT.
- GOT mostra **unidades organizadas/desorganizadas** e destruídas, não confunde contagem de unidades com soldados. Resultados de recursos continuam projeções sujeitas à decisão do Narrador.
- Detalhes técnicos e histórico auditável continuam disponíveis; não se altera nenhuma ficha oficial nem as cadeias de integridade.

## L6 — experiência móvel, acessibilidade e custo de renderização
- Regras CSS responsivas para cartões e avisos; alvos de controle min. 44 px; foco por teclado; suporte a `prefers-reduced-motion`.
- Uso de `useMemo` com busca reversa sem criar cópias grandes dos eventos PTE e CRZ em cada render.
- Regressões: 6 fases GOT, impasse D&D, textos de dano, presets rápidos, resultado PTE, navegação de tabuleiro, responsividade em Chromium sintético e flags de autorização.
- QA final exigido: Vitest, TypeScript, build, Chromium desktop/toque, bancos de batalha e missivas. Teste com Narrador autenticado e celular físico permanece distinto do CI.

## Restrições de segurança
- `BATTLE_PLAYERS_ENABLED=false` deve permanecer intacta.
- Não publicar ou alterar credenciais, Hub Temporal, fichas oficiais, recursos das Casas ou cópias privadas.
- PR incorporada à `main` não comprova que a aplicação web já recebeu um novo deploy.
