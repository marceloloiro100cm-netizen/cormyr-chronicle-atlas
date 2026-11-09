# Cormyr Chronicle Atlas — Padrão métrico global (09/11/2026)

## Decisão permanente de produto

**Toda ficha, regra, tabela operacional, mapa e explicação de jogabilidade usa SI:**
- distância curta e deslocamento: **metros (m)**;
- distâncias regionais/longas: **quilômetros (km)**;
- massa/carga: **quilogramas (kg)**;
- dano, PV, ND, Riqueza, número de unidades/criaturas, rolagens e pontos de movimento NÃO são unidades físicas e não devem ser convertidos.

A norma não altera texto literário histórico, nome próprio ou citações antigas: a regra operacional nova prevalece.

### Valores operacionais (não são conversões físicas exatas)

| Situação | Regra Cormyr |
|---|---|
| D&D: célula de combate | **3 m por quadrado** |
| D&D: movimento diagonal | **1,5 quadrado de custo**, equivalente a 4,5 m de orçamento |
| D&D: deslocamento de 30 pés da fonte | **9 m na regra de mesa** |
| D&D: voo | Mesmo deslocamento em m, pode atravessar obstáculos do terreno, respeitando regras de linha de visão |
| D&D simplificado: disparos | À distância sem teto de alcance no tabuleiro; requer linha de visão |
| GOT: célula do mapa de guerra | **10 m por quadrado** |
| PTE-2.0/Adaptado e CRZ | Orçamentos de movimento e custos de terreno preservados; escala física centralizada em m |

A tabela de D&D usa convenção de mesa **5 pés ≈ 1,5 m**. Para dados físicos reais e massa, converter com os fatores exatos: **1 pé = 0,3048 m**, **1 milha = 1,609344 km**, **1 libra = 0,45359237 kg**. Não converter massa pela convenção aproximada da mesa.

## Inventário de implementação

| Arquivo | Alteração / responsabilidade |
|---|---|
| src/lib/units/metric.ts | Conversões SI exatas, conversões da escala de mesa e formatação pt-BR de m/km/kg |
| src/lib/crusade/dnd-metric.ts | Adaptador de leitura/escrita de velocidades legadas de fichas (campos speed_ft/fly_ft) |
| src/lib/crusade/dnd-mode.ts | Regra primária 3 m/quadrado, custo diagonal 1,5; constante histórica marcada legada |
| src/lib/crusade/ruleset.ts | Acesso central à escala métrica do preset sem alterar schema/hash legado |
| src/lib/crusade/convert.ts | Contagem de movimento e faixas de alcance em decímetros inteiros da regra métrica |
| src/lib/crusade/dnd-battle.ts | Validação da escala em metros; avisos operacionais de combate em m |
| src/lib/crusade/dnd-import.ts | Tabelas novas com cabeçalhos speedM/rangeM, alias metricos de CSV/JSON, voo flyM; fallback explícito para speedFt/rangeFt/flyFt de fontes antigas |
| src/lib/crusade/dnd-cormyr-300.ts | Aviso de voo provisório exibido em m (mantém fonte original) |
| src/components/battle/DndCormyr300Library.tsx e DndCustomMonsterEditor.tsx | Editores exibem metros; serialização privada antiga mantida |
| src/test/metric-system-20261109.test.ts | Cobertura de distâncias, massa, conversões e invariantes do motor |
| src/test/metric-dnd-import-20261109.test.ts | Cobertura de CSV/JSON novos e legados, voo, erro de unidade e limites |
| docs/battle/metric-system-audit-2026-11-09.md | Norma de jogo, inventário, compatibilidade, riscos e aceite |

### Regra de importação de monstros

- **CSV novo:** speedM e rangeM (m) são os cabeçalhos preferenciais. O arquivo de exemplo acompanha essa decisão. Pode-se incluir flyM em CSV ou JSON. Em JSON também são aceitos speed_m, walk_m, fly_m e range_m.
- **CSV legado:** speedFt e rangeFt continuam aceitos **apenas na entrada**, a fim de preservar tabelas antigas; flyFt e fly_ft também são compatíveis.
- A API rejeita velocidade ambígua se forem fornecidos metros e campo legado ao mesmo tempo.
- Deslocamento e voo no D&D seguem incrementos de 1,5 m; alcance métrico é quantizado para o inteiro mais próximo no campo histórico antes do motor processar.
- A estrutura CrzCreature do catálogo ainda contém **speedFt**, **rangeFt** e **reachFt** porque eles pertencem ao formato versionado/hash/replay legado. Isto é dívida de persistência, não padrão de regra nem texto da interface.

## Compatibilidade / banco de dados

O catálogo de 300 monstros de Cormyr fica no banco privado (não colocar dados proprietários no GitHub). A tabela já aplicada public.battle_dnd_cormyr_monsters tem speed_ft e o campo privado de revisão pode conter fly_ft. **Nesta entrega, nenhum dado histórico, JWT, RLS ou credencial é alterado.** Os hashes de regras e replays existentes continuam utilizando exatamente os mesmos campos históricos. O transformador métrico opera na borda, antes da apresentação ou na importação de arquivo.

### Proposta opcional, NÃO EXECUTADA, de migração aditiva

1. Adicionar campos opcionais numéricos speed_m e fly_m ao catálogo e ao banco de overrides quando a auditoria do modelo real confirmar sua estrutura.
2. Backfill verificável: speed_m = round(speed_ft * 0,3, 1) para a **escala de mesa** (e não 0,3048). Calcular fly_m do override legado quando presente. Preservar também speed_ft/fly_ft enquanto existir replay V1–V3.
3. Ler prioritariamente coluna métrica em novos contratos versionados, mantendo os adaptadores legados; rejeitar inconsistências acima do arredondamento convencionado. Restringir escritas para a conta do Narrador sob as políticas RLS existentes.
4. Fazer teste de reversibilidade e hash com cópia isolada antes de migrar produção; nunca sobrepor a tabela antiga nem reescrever o conteúdo 5etools ou antigos replays.

## Estado de qualidade e limites

- Testes específicos criados: conversão física e mesa; 3 m/célula; ida e volta; massas; compatibilidade do movimento e faixas; importações métricas/legadas; avisos de voo em m.
- A primeira implementação executou localmente 58 testes relacionados, conforme registro do executor de código da alteração inicial. **O ciclo completo de CI da ramificação de complementos deve ser confirmado independentemente depois da PR.**
- A regra de ataque sem teto de alcance **é simplificação do simulador Cormyr**, não transcrição literal de toda D&D 5e. A GUI deve deixar essa distinção evidente.
- **Sem validação manual autenticada em Android real, sem deploy e sem migração neste lote.** A flag BATTLE_PLAYERS_ENABLED permanece false.

## Pendências auditáveis

- **Migração SQL para colunas canônicas m:** somente depois de revisão técnica, plano de reversão e autorização.
- **Persistência/hashes dos motores:** alteração de schema só via versão nova, não por simples renomeação de campos.
- **kg em tabelas de equipamentos/carga:** o sistema não apresentou campos operacionais de massa a converter na revisão. Os conversores e formatadores estão disponíveis, mas não se inventou peso de itens ou criaturas.
- **UX:** criar microajuda “3 m por quadrado” e exibir alcance sem teto como texto, não campos de entrada confusos; checar legibilidade de mapas em tela móvel; alinhar persistência entre os três modos em projeto separado.
- **Teste humano:** Narrador deve verificar um cenário rápido em GOT, Adaptado e D&D e uma retomada de cada, usando preview autenticado, antes de qualquer liberação a jogadores.
