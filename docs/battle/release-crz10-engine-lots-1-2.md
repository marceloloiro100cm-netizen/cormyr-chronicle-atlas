# CRZ-1.0 — Núcleo independente, lotes 1–2

## Fontes e hierarquia
Base normativa: **03 — Regras da Cruzada de Pilhas**, §§0–4, 7.1–7.8, 17–18, entre os quatro ZIPs fornecidos pelo Narrador; casos de cálculo conferidos contra **02 — Empilhamento de Criaturas**, T-PIL-01…10 e T-WOTR-01. **06 — Arquitetura e Integração Cormyr** define o isolamento e a compatibilidade. **01 — Como funciona o modo Crusade** é pesquisa comparativa, não tabela de valores de Cormyr.

Os anexos citam arquivos 00, 04, **05 (catálogo/ETL das criaturas)**, **07 (simulações/calibração)** e 08, que não foram recebidos. Não inventamos dados de bestiário, não importamos 5etools nem alegamos calibração concluída. Parâmetros marcados 🔧 no manual ainda são propostas.

## Entregue nesta fase

| Arquivo | Implementação efetiva |
|---|---|
| `src/lib/crusade/ruleset.ts` | Configuração tipada, validada estritamente com Zod, `rulesVersion='CRZ-1.0'`, presets `CRZ-5E`, `CRZ-WOTR`, `PTE-2.0-compat`; SHA-256 de JSON canônico e lista explícita de hashes conhecidos. |
| `src/lib/crusade/stack.ts` | Pilha com `alive`, `topHp`, `hpPool` inteiros; limites por tamanho; aplicação de dano agregado, desperdício de golpe único, cura com/sem reviver e divisão de pilha ferida com preservação de PV. |
| `src/lib/crusade/rng.ts` | PRNG PCG32 XSH-RR com seed de entrada obrigatória e estado serializável. Não utiliza `Math.random`, `Date.now` ou acesso a dados externos. |
| `src/lib/crusade/damage.ts` | `CRZ-5E` acerto d20 (piso/teto 5–95%), crítico, média de dados em centésimos, mitigação por parte, acertos esperados, overkill cap, `rolled` sem ressorteio implícito, AoE esperado por salvaguarda e fórmula **esperada** de WotR com RD antes do multiplicador. |
| `src/test/crusade-crz10-goldens.test.ts` | Referências T-PIL-01…10 e T-WOTR-01: dano 209, 53, 19 cap, 2, AoE 537, pool 120/11/10, cura 61, resistência 25, divisão 117+80, WotR 59, seed reproduzível, schema/limites. |
| `src/lib/crusade/index.ts` | API explícita da camada matemática e de configuração. |

### Regras de preservação
- **Não** altera `src/lib/battle/domain` ou `v3`. Não troca os replays `PTE-2.0` ou `CCA-BATTLE-REPLAY-1`, nem o padrão V3.4 das partidas sincronizadas.
- **Não** importa `HouseState`, Supabase, React, Hub Temporal, `resolveSurvivors`, nem toca no fluxo de homologação oficial V3.5.
- `PTE-2.0-compat` tem seus parâmetros tipados, **mas ainda não executa paridade completa** — o futuro adaptador precisa comparar toda a cadeia com os testes legados, inclusive cobertura, armadura, movimento, moral e sequência de turnos.
- `CRZ-WOTR` implementa somente a fórmula **esperada** validada por T-WOTR-01; o jogo pesquisado também usa amostras/rolagem, que não estão nesta fase.
- `CRZ-5E` possui os resolvedores matemáticos, mas **ainda não** gerencia rondas e retaliações com regras completas; a fase atual não é uma partida CRZ jogável.
- A resolução `rolled` devolve agregados e estado RNG; **replay CRZ-1.0 completo ainda precisa de redutor e verificador próprio**, com eventos e hashes. A reprodução do mesmo estado inicial/semente não equivale, sozinha, a um replay auditado.
- A divisão com baixas pré-existentes ainda é rejeitada explicitamente; o manual não define a alocação dos mortos por sub-pilha. A versão atual conserva PV na situação T-PIL-10 (20 vivos, 3 PV feridos).

## Critérios de aceite nesta PR
- Todos os goldens previstos em `02` T-PIL-01…10 + T-WOTR-01 devem passar exatamente.
- Configurações de regras devem ser autocontidas e rejeitar hashes desconhecidos.
- Aritmética deve recusar entradas não inteiras/inseguras `E_OVERFLOW`, evitar mutações dos objetos de entrada e não acessar relógio/random global.
- Verificação automática: Vitest, TypeScript, build, banco descartável e testes de navegador legados; nenhuma migração.

## Próximos lotes antes de CRZ jogável
1. **Lote 3:** esquema de `CreatureTemplate`, `AttackProfile`, `StackSetup`, leitura de catálogo permitido, licenças/proveniência e `warnings[]`. Falta o arquivo 05.
2. **Lote 4:** máquina de turnos versionada, `MOVE`, `ATTACK`, `WAIT` inverso, `DEFEND`, retaliação, efeitos, moral numérica e general. Usar `03` §§5–11, sem importar o redutor PTE.
3. **Lote 5:** replay CRZ com comandos e resultados, `rulesetHash` em cada artefato, encadeamento SHA-256, testes de adulteração, paridade `PTE-2.0-compat`.
4. **Lote 6:** simulador em lote e calibrador; completar conjunto 07 quando recebido.
5. **Lote 7+:** UI/recrutamento separado, sincronização opt-in, integração com Cormyr sob autorização do Narrador; **nenhuma escrita automática de baixas oficiais**.

**Estado de lançamento:** branch de desenvolvimento; não executar deploy ou merge sem CI e revisão.
