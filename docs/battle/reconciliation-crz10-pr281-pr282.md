# Conciliação técnica CRZ-1.0 — PR #281 × PR #282

**Data:** 06/11/2026. **Linha canônica:** PR #282, seguido de #283 (replay). O PR #281 é uma implementação alternativa divergente, não uma dependência a mesclar diretamente. Esta reconciliação está empilhada após #283 em PR próprio e deve ser integrada somente depois do CI e revisão.

## Matriz de decisões

| Tema | PR #281 | PR #282 | Decisão |
| --- | --- | --- | --- |
| Estado e redutor | `battle.ts`, `combat.ts`, `turns.ts` com APIs próprias | `battle-state.ts`, `strike.ts`, `turns.ts` | **Manter #282**; não importar o segundo redutor |
| Geometria | Reutiliza tipos/geometria públicos PTE | Motor geométrico CRZ próprio | **Manter #282**, preservando isolamento integral |
| Comandos | ABILITY CHARGE/VOLLEY, LEADER_CAST | MOVE/ATTACK/WAIT/DEFEND/CAST/END | **Portar CHARGE/VOLLEY para API de #282**, sem mudar CAST |
| Seletores de UI | `crzLegalActions` tipado | `crzLegalCommands` | **Portar seletor somente leitura**, derivado da autoridade #282 |
| Magias | 4 | 7 executáveis em protótipo | **Manter #282**; sem prometer magias não executáveis |
| IA | Não incluída | IA determinística | **Manter #282** |
| Moral no modo expected | Não consome RNG/turnos extras | Podia consumir RNG | **Adotar comportamento de #281** quando `expectedIgnoresNumeric` |
| Limite de rodadas | Pontuação percentual de PV válidos | Empate direto | **Adotar critério de pontuação de #281**, empate só se iguais |
| T-INT-01 | 78 de dano aplicado/11 baixas | 78 bruto/53 aplicado/7 baixas | **Manter CRZ-5E cap de #282**; errata em documento separado |
| Replay | Não incluído | Complementado em #283 | **Manter #283**, testando ABILITY na cadeia |

## Contrato das habilidades conciliadas

- **CHARGE:** pilha com o traço `charge`, rotina corpo a corpo, caminho registrado com pelo menos dois passos axiais seguidos **na mesma direção**; só a primeira rotina de corpo a corpo da ativação recebe um dado extra. Comando explícito `ABILITY`, não bônus automático.
- **VOLLEY:** exige rotina de ataque à distância, usa contador `usage.volley` com teto no ruleset e acrescenta um dado na primeira parte da rotina do ataque à distância da ativação; nenhuma munição, custo de campanha ou recarga adicional foi inventada.
- Nenhuma habilidade é aplicada à retaliação. No turno ativo, depois de preparar CHARGE, só ataque corpo a corpo é permitido; depois de preparar VOLLEY, somente ataque à distância.
- Os seletores nunca executam comandos, nunca retornam opções sem base em `crzLegalCommands` e não substituem a validação final de `crzPlay`.

## Riscos e preservação

A adição dos campos opcionais `movedPath` / `preparedAbility` ao estado CRZ experimental registra o caminho e a habilidade usada. O histórico do PTE-2.0 e os hashes dos três presets anteriores ficam intocados. Replays CRZ anteriores ao patch ainda precisam de validação por reexecução; o replay local CRZ-1.0 ainda não foi publicado ou persistido para jogadores e, portanto, não se deve alegar compatibilidade retroativa de arquivos experimentais sem teste.

As regras **não** integram servidores, multiplayer, Supabase, aplicação de baixas, armas oficiais, economia ou calendário. O catálogo 05 e calibração 07 permanecem ausentes. Nenhum merge para `main` ou deploy é autorizado por este relatório.

## Portões

1. Executar Vitest (incluindo o T-INT-01 completo, CHARGE, VOLLEY, selector, replay e moral), TypeScript, build e PostgreSQL descartável pelo GitHub Actions.
2. Marcar PR #281 como supersedido em **comentário e fechamento sem merge**, referenciando este PR depois que o CI validar a conciliação.
3. Manter PRs #282 → #283 → reconciliação em pilha; integrar à `main` em ordem e mediante revisão dos portões de homologação.
