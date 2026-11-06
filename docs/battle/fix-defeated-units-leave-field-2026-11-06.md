# Correção V4 — unidades destruídas desaparecem do campo

**Objetivo:** depois de ataque, retaliação ou magia que elimine uma pilha inteira, o ícone da unidade desaparece imediatamente do hexágono. Uma pilha que entre em **debandada** também se retira do campo, mesmo que ainda tenha sobreviventes.

## Decisão funcional
- **V3/PTE:** só desenhar no mapa os agrupamentos com `currentHp > 0` e `moraleState !== 'routed'`.
- **CRZ-1.0:** usar a mesma regra do motor para aptidão à batalha, `crzCapable` (`alive > 0` e não debandado), também na renderização e ao identificar a unidade clicada.
- Os hexágonos dos derrotados voltam a ficar **livres para deslocamento** em V3; os bloqueios de caminho agora utilizam o mesmo filtro de capacidade do campo nas verificações e execução do comando. CRZ já tratava dessa condição.
- A ordem de combate já excluía pilhas destruídas/debandadas; as fichas de inspeção agora também não exibem uma unidade ausente do campo. O histórico, o replay, os registros de dano e as baixas **continuam intactos** para apuração posterior.
- Uma unidade que perder apenas parte dos combatentes continua no mapa, com seu número atualizado. Ela desaparece somente quando a pilha inteira for eliminada ou se retirar por debandada.

## Segurança
Sem alterar dados dos jogadores, banco, senhas, missivas, Hub Temporal ou fichas oficiais. É uma correção de apresentação e coerência tática no **simulador separado**; nenhuma baixa é aplicada às casas da campanha.

## Testes de regressão
- V3: token saudável visível, token com zero PV ausente, token debandado ausente, anéis/seleção do derrotado ausentes; ataque realmente letal retira token e preserva evento.
- V3: uma tropa retirada não pode continuar bloqueando um hexágono para mover.
- CRZ: pilhas eliminadas e debandadas não produzem tokens nem destaques no mapa, enquanto os eventos permanecem registrados.
- CI completo de Vitest, TypeScript, build e bancos descartáveis antes de publicação.
