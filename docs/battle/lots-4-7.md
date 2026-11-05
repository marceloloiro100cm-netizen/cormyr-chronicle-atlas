# Módulo de Batalha — Lotes 4 a 7 (PTE-2.0 experimental)

Branch de implementação: `feat/battle-v2-lots-0-3` / PR #258. Este complemento não altera regras oficiais nem o banco.

## Lote 4 — Resolução de combate
- `resolveDamage`: ordem exata de estágios `raw → attack BP → cover BP → armor BP → final`, com `Math.floor` em cada etapa.
- `moraleAfterDamage`: estados firme/abalada/debandada; perdas físicas e abandono do campo distintos.
- `RETALIATION`: somente após o golpe, com sobreviventes, máximo uma por rodada, e nunca em cadeia.
- `battleOutcome`: eliminação, debandada e derrota simultânea; `battleReport` resumo por unidade/exército.
- Regressões em `src/test/battle-combat.test.ts`; o estado oficial de `Unit` é inacessível ao reducer.

## Lote 5 — Hub do Narrador
- Menu `Módulo de batalha`, após Dossiês de Espionagem, disponível **somente** dentro da renderização `data.admin`.
- A flag `VITE_ENABLE_BATTLE_MODULE` permanece **desativada por padrão**. Para verificar em homologação, ativá-la explicitamente no ambiente do build e autenticar-se como Narrador autorizado.
- Arena sem rota nem API nova; nenhuma unidade real da casa é consultada.
- Preparação de 1–5 agrupamentos fictícios por lado, perfis terrestres, treinamento, efetivo, zonas, validação e início.

## Lote 6 — Arena
- SVG pointy-top com 11×9/15×11 hexágonos, símbolos existentes, indicação numérica de vivos, alcance e movimento.
- Teclado: Tab focaliza hexágonos, Enter/Espaço executa clique. No celular, seleção e confirmação explícita do movimento/ataque.
- Comandos de ambos os lados sob controle do Narrador; pausa e desfazer exclusivamente em memória.
- Mensagens de erro não alteram o estado. Relatórios e exportação do resultado são experimentais.
- IA e replay verificável **não estão neste lote** (lote 8).

## Lote 7 — Editor
- Quatro cenários, dimensões válidas, pincéis de terreno, zonas A/B, preenchimento, apagamento, restauração e histórico de desfazer específico do mapa.
- Validação de conectividade, implantação, rocha e formato do mapa; import/export JSON somente com schema validado.
- Editor só existe na fase de preparação; nenhuma edição do mapa ativo.

## Controle de publicação
Não fazer merge nem `Publish changes` sem revisão do Narrador. Testes executados devem ser validados no workflow GitHub Actions do PR atual. O build e o CI não verificam sozinho toque real em smartphone, permissão revogada em servidor, nem atualizam produção.

## Limites conhecidos
- A flag depende de variável do ambiente de build; se continuar desligada, o novo item permanece oculto.
- Sem persistência/replay criptográfico e sem IA (lotes 8/10).
- Sem acesso a fichas ou dados de casas (lote 9), sem baixas oficiais (fora desta V2).
- Não foi realizado E2E real em browser móvel; revisar antes de publicar.
