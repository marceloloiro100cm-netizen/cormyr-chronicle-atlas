# CRZ-1.0 · Lote 3 — Fichas, catálogo curado e conversão de pilhas

## Base documental (fonte, não inferência)

Este lote implementa contratos de dados descritos em **`06-arquitetura-e-integracao-cormyr.md` §6.3.5** e regras de construção em **`03-regras-cormyr-cruzada-passo-a-passo.md` §§3–4**. A natureza dos ataques e do dano por pilha está no **`02-empilhamento-de-criaturas.md`**. O **`01-wotr-crusade-como-funciona.md`** serve apenas para comparação. A precedência normativa do documento 03 permanece.

Os arquivos externos **05 (biblioteca/ETL de criaturas)** e **07 (simulações e calibração)**, mencionados pelo material, **não foram fornecidos**. Portanto a biblioteca de criaturas começa vazia: nenhum monstro de livros ou sites foi inventado/importado. Todos os testes usam **fichas sintéticas próprias** e nunca afirmam representar SRD ou outro bestiário.

## Entregas desta fase

| Arquivo | Contrato criado |
|---|---|
| `src/lib/crusade/creatures.ts` | `CrzCreature` e `CrzAttackProfile` conforme 06: ID `nome|fonte`, ND inclusive fracionário, XP, PV, CA, seis modificadores, velocidades, ataques melee/ranged/save/area, multiattack, modificadores de dano, traços, flags e `warnings[]`. Validação Zod estrita; referência inexistente no Multiattack rejeitada. |
| `src/lib/crusade/catalog.ts` | Catálogo **local**, curado, sem tráfego de rede nem scraping, com detecção de IDs duplicados, hash do conjunto, contagem de registros utilizáveis/não suportados, avisos agregados e cópias congeladas por valor. |
| `src/lib/crusade/convert.ts` | `CrzStackSetup`, `CrzArmySetup`, conversão `CreatureTemplate → Stack` aplicando treino relativo à ficha, PV/CA, ataque, iniciativa, alcance, movimento, valor por XP e rotinas de multiataque ou melhor ataque individual. IDs/posições repetidos e excesso de pilhas geram erro. |
| `src/test/crusade-crz10-lot3-creatures.test.ts` | Testes de contrato, ND 1/8, hash alterado, licenças e proveniência, fonte oficial bloqueada, treino veteran/trained, multiattack misto, avisos de traços não executáveis e validação de exército. |
| `src/lib/crusade/index.ts` | API pública das fichas e conversor. |

### Diferenças e decisões explicitamente novas

- **Proveniência e direitos:** 06 define `origin`, `srd` e `contentHash`; este lote adiciona **`license`, `attribution` e `permissionEvidence`**, para não importar material de terceiros sem indicação de direitos. Evidência declarada é metadado, **não** prova jurídica ou autorização automática. Uma obra em 5etools, por exemplo, não é presumida SRD ou livre.
- **Hash e ND fracionário:** o hash de regras anterior admite apenas inteiros. Este lote serializa o ND fracionário como **texto apenas para calcular o hash da ficha**; na ficha, ND continua numérico (por exemplo 0,125). O hash verifica que nenhum dado foi alterado depois de lacrado.
- **Melhor rotina:** se o Multiattack combina meios incompatíveis (ex.: arma corpo a corpo e arco numa única rotina), o conversor não inventa uma sequência mista; usa um ataque válido por categoria e emite aviso para revisão/override.
- **Traços e efeitos:** `pack-tactics`, ações lendárias, magias, condições e ataque em área são **registrados com aviso, mas não executados** por este lote. O redutor de habilidades ficará no Lote 4. Criatura sem nenhum ataque corpo a corpo ou à distância é `unsupported` crítico para uso no construtor atual, mesmo que tenha apenas habilidades em área.
- **Origem oficial:** `house-readonly` existe no schema para o futuro, mas a conversão atual recusa com `E_SETUP_SOURCE`. Nenhum código consulta `HouseState`, UUID de jogador ou funções do Supabase. Uma versão futura exigirá adaptador exclusivo do Narrador com autorização e RLS.

### Fórmulas de conversão (documento 03 §4)

- `hpPerCreature = max(1, floor(template.hp.average × (100 + hpPct)/100))`.
- `acBase = template.ac + training.ac + modifiers.ac`.
- `atkMod = training.attack + modifiers.attack + leader.attackBonus` — o `toHit` da ficha será somado apenas na resolução; **não duplicar** bônus.
- `movementHex = clamp(round(max(speed.walk, fly se voa)/10),1,6)` por configuração do preset.
- `rangeHex` pelo maior alcance **normal**: até 30 pés = 2, até 80 = 3, até 150 = 4, até 300 = 5, acima = 6.
- `initiative = 2×movementHex + dexMod + training.initiative + leader.initBonus`.
- `morale = clamp(training.morale + leader.moraleAura,-100,100)`.
- `stackValue = count × template.xp`, com aritmética inteira segura.

O cálculo de `expectedPerCreatureX100` é uma **prévia estática de seleção de rotina** contra CA15 e não é ainda um evento de ataque completo. Não inclui terreno, efeitos e posição do oponente.

## Restrições de engenharia

1. A implementação cria apenas estruturas e funções puras em `src/lib/crusade/`; **não altera** `src/lib/battle/domain/*`, `v3/*`, replays PTE-2.0, banco, UI, datas ou fichas oficiais.
2. Não pode ser usada como fonte de consequências reais; `CrzPreparedArmy` é um artefato local de prévia, sem mapa/deploy validado e sem estado de batalha ativo.
3. A ordem dos registros do catálogo não altera seu SHA. IDs duplicados, uso sem evidência declarada e hashes de conteúdo divergentes são rejeitados.
4. O catálogo de testes contém apenas nomes e números sintéticos autorais. Nenhum parser/ETL de 5etools/Open5e/SRD foi adicionado, porque o arquivo 05 não foi recebido.
5. Testes de integração, revisão visual, balanceamento e prontidão de produção não são presumidos sem CI verde.

## Próximos passos

- **Lote 4:** setup completo e implantação no mapa, máquina de turnos CRZ própria, moral numérica, retaliação, leader, skills; testes de integridade da ação.
- **Lote 5:** replay CRZ com `rulesetHash`, eventos tipados e prova de determinismo com sorteios auditáveis; paridade PTE só após implementação numérica comprovada.
- **Lote 6:** lotes de simulação/calibração após obtenção do documento 07 e criação de fixtures legalmente autorizadas do 05.

**Status:** PR em rascunho, sem merge/deploy ou qualquer efeito sobre casas da campanha.
