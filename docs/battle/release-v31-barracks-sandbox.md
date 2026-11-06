# Cruzada V3.1 — Quartel de treino independente (fase 1 da issue #269)

## Fluxo entregue nesta branch
- Antes de **Batalhar**, os dois exércitos-modelo têm quartéis locais editáveis com linhas em campo e na reserva.
- Recrutamento fictício pelos 16 perfis terrestres, com quatro níveis de treinamento.
- Ajuste de efetivo (1–1000), divisão de uma pilha com conservação exata de combatentes, fusão apenas do mesmo tipo e treinamento, remoção, reserva e escalação de até cinco pilhas por lado.
- Máximo de dez pilhas por exército contando reservas. A arena recebe exclusivamente as pilhas escaladas.
- Livro-caixa de simulação com teto de **7.000 moedas fictícias** e **1.200 unidades fictícias de suprimento por exército**. Os custos foram criados como parâmetros provisórios de jogabilidade, NÃO como regras oficiais de Cormyr.
- Mudança de casa-modelo reinicializa o quartel correspondente. Convocações existentes do Narrador continuam com seu elenco fixo original, sem edição no modal.
- As tropas do quartel só existem no estado React e nos snapshots fictícios de combate. Não há persistência, sincronização ou alteração de `noble_house_sheets`, moedas, unidade real, XP oficial ou Hub Temporal.

## Contrato
- Regras: `src/lib/battle/v3/barracks.ts`.
- Editor: `src/components/battle/BattleV3Barracks.tsx`.
- Integração: `BattleV3Game` envia `rosters` opcionais a `createV3Game`. Chamadores anteriores sem `rosters` preservam o funcionamento da V3 original.
- O motor permanece `PTE-2.0`, a simulação é `PTE-3.0-SANDBOX`; replays e convocações anteriores não são migrados nem modificados.
- Testes novos: `src/test/battle-v3-barracks.test.tsx` (conservação, fronteiras, isolamento e UI).

## Critérios de aceitação e limites
- Nunca criar soldados ao dividir ou fundir.
- Nunca permitir mais de cinco pilhas implantadas; reserva não ocupa hexágonos da arena.
- Rejeitar orçamento/suprimento excedido e tipos não terrestres.
- Garantir controle teclado/toque e leitura em mobile.
- Executar `npm test`, `npx tsc --noEmit`, `npm run build` e teste E2E real antes de merge.
- Esta PR não cobre persistência do quartel, progressão de comandantes, mapa estratégico, partidas sincronizadas nem homologação de baixas. Esses itens seguem abertos na issue #269.

> Implementação de código não equivale a publicação do Lovable. Deploy de homologação e produção precisam de confirmação independente.
