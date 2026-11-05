# Módulo de batalha — baseline e fronteira de segurança

**Referência:** CCA-BATTLE-V2-2026-11-05, perfil **PTE-2.0 EXPERIMENTAL**.  
**SHA inspecionado:** `5f38db5cb2dcd4d16a83025f4cd9c398c5f455df` (`main`).  
**Lotes nesta branch:** 0–3, sem tela pública, sem conexão com SQL.

## Contexto conferido
- `README.md`, `AGENTS.md`, `package.json`, `src/routes/_authenticated/jogadores.tsx`, `src/components/players/narrator-missives-hub.tsx`.
- `src/lib/house/engine.ts`: `UNIT_TYPES` (17), `TRAINING`, `unitStats` e `createUnit`.
- `src/lib/house/military-bonuses.ts`: `unitMilitaryBonuses` é usado por `unitStats`; alguns efeitos já estão embutidos.
- `src/lib/house/military.ts`: `resolveSurvivors` e `changeUnitState` são ações **proibidas** para a arena.
- `src/lib/house/equipment.ts`: equipamento contém modificadores textuais que **não** podem virar fórmulas por suposição.
- `src/lib/house/types.ts`, `src/test` e `drizzle/migrations/`: as operações oficiais mantêm banco e políticas independentes.

## Política de isolamento — ADR-BAT-001
1. A feature flag `VITE_ENABLE_BATTLE_MODULE` é **false por padrão**; a UI só será inserida no menu protegido no lote 5.
2. Lotes 0–3 criam **somente** código TypeScript puro, validações e testes com dados fictícios.
3. Nenhum import do motor para `createUnit`, `resolveSurvivors`, `changeUnitState`, `houseOperation`, Supabase ou Hub Temporal. A integração read-only fica reservada para o lote 9.
4. Nenhuma tabela, migration, RPC, atributo de casa ou unidade oficial será modificada.
5. Não há baixas reais nem promessa de persistência/replay; os eventos do lote 3 são locais e o dano somente será introduzido no lote 4.
6. Toda regra tática será apresentada como **experimental** e versionada; não reproduz as regras oficiais do livro.

## Matriz de adaptação (somente para o futuro lote 9)

| Origem de ficha | Atributo tático proposto | Controle de segurança |
|---|---|---|
| `Unit.types` | `primaryTypeId` | Escolher um tipo original; naval bloqueado; tipo misto precisa decisão escrita |
| `Unit.strength`, `Unit.casualties` | `initialCount` | `clamp(strength-casualties,0,strength)`; sem segunda subtração |
| `Unit.training` | `trainingBonus` | +0/+1/+2/+3 no PTE; sem dupla aplicação |
| `unitStats(unit,state).movement` | `movementHex` | `clamp(ceil(metros/15),1,6)`, escala experimental |
| `unitStats(unit,state).armorRating` | `armor` | `clamp(rating,0,10)`; **não** somar base tática |
| `unitStats(unit,state).defense` | `defense` | Aplicar fórmula V2 uma vez; já pode incluir bônus militares |
| `Unit.skills`, `unitMilitaryBonuses.skillBonuses` | `attack` | Habilidade do perfil (fighting/marksmanship), sem duplicar efeitos |
| `Unit.health` | metadado de origem | Não equivale a PV por soldado; `currentHp=count*hpPerSoldier` |
| `unitMilitaryBonuses` condicionado; equipamento textual | avisos `unmapped` | Não converter efeito automaticamente |
| `houseId`, `unitId`, comandante, domínio | `source` | Somente referência imutável, nunca permissão de escrita |

## Próximos marcos
- Lote 4: fórmulas de dano, moral, retaliação e vitória; remover o placeholder de ataque.
- Lote 5: hub do Narrador, protegido pela autorização já existente, então ligar visualmente a flag.
- Lotes 9–10: revisão independente de autorização, snapshot e RLS antes de qualquer persistência.
