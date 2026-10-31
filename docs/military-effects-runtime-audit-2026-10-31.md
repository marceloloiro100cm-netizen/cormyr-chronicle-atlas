# Auditoria de aplicação de bônus militares e efeitos da Casa — 31/10/2026

## Escopo e método

Auditoria estática da branch `main` (antes dos ajustes desta auditoria) e do catálogo de **33 investimentos com efeito militar direto**, conforme `docs/military-assets-audit-2026-10-31.md`.
O código foi comparado com `src/lib/house/prosperity-catalog.json`, `src/lib/house/catalog.ts`, `src/lib/house/engine.ts`, `src/lib/house/military-bonuses.ts`, `src/lib/house/military.ts`, `src/lib/house/equipment.ts`, `src/lib/house/fortune.ts`, `src/lib/house/siege.ts`, `src/lib/house/house.functions.ts`, fichas e testes.

**Critério:** `Automático` = número ou transação consumido por rotina existente na condição apropriada (incluindo escolha/compra prévia). `Parcial` = algum efeito calculado, mas ainda há outro efeito ou etapa sem consumidor completo. `Narrador` = efeito narrativo ou operacional que ainda exige ação e registro específicos. A presença do texto num card **não** prova aplicação no combate.

## Matriz dos 33 investimentos

| # | Investimento | Situação | Aplicação verificada / limite |
|---:|---|---|---|
| 1 | Torre | Automático | Defesa +3 para unidade estacionada no domínio, se for a melhor fortificação elegível. |
| 2 | Salão | Automático | Defesa +4 nas mesmas condições. |
| 3 | Castelo pequeno | Automático | Defesa +6 nas mesmas condições. |
| 4 | Castelo | Automático | Defesa +8 nas mesmas condições. |
| 5 | Castelo superior | Automático | Defesa +12 nas mesmas condições. |
| 6 | Produção de Alcatrão | Automático | Desconto −1 Poder em navios na compra; ganho de Riqueza +1 na resolução da Sorte positiva. |
| 7 | Cães de Rastreamento | Parcial | Batedores recebem dano +1 e rastreamento +2B como valores calculados; não há resolução automática de ataque/rastreamento. |
| 8 | Cães de Guerra | Parcial | Compra de equipamento (2 Riqueza) e vínculo à unidade persistidos; dano +2 e Luta +1B calculados, sem resolvedor completo de ataque. |
| 9 | Armadilheiros | Automático | Guerrilheiros custam −2 Poder ao recrutar. |
| 10 | Cavalos de Guerra | Automático | Cavalaria custa −2 Poder ao recrutar. |
| 11 | Estaleiros | Parcial | Navios custam −2 Poder; outro efeito, desconto para artesão Construtor Naval, está apenas em `action` textual. |
| 12 | Festivais Marciais | Automático | Plebeus **novos** recebem −3 de Disciplina permanente na ficha de recrutamento; não altera tropas antigas. |
| 13 | Arqueiro/Flecheiro ou Armeiro | Parcial | Dano +1 em Luta/Pontaria depois de escolher especialidade; Sorte +1 calculada, mas efeito narrativo das armas Castle-forged não é parâmetro próprio de ataque. |
| 14 | Pedreiro | Parcial | Fortificações têm prazo −10%; Sorte +1 calculada; bônus de Guerra +1 de comunidades/fortificações não é consumido em uma rotina de Guerra. |
| 15 | Construtor Naval | Automático | Navios −2 Poder na compra e Sorte +1 calculada no evento. |
| 16 | Treinamento Militar | Narrador | Oficiais equivalentes à Guarnição Treinada mediante gasto de 1 Lei: não há ação específica para mobilizar/desmobilizar e debitar esse custo. |
| 17 | Engenheiro | Parcial | Defesa +1 da unidade em fortificação e redução de 20% do prazo de construções contempladas; duração das máquinas de cerco e desconto de aparelhos pessoais não possuem motor geral equivalente. |
| 18 | Engenheiro de Cerco | Automático | Desconto −1 Riqueza em armas elegíveis; quando cabível, duas máquinas por 1 Riqueza com limite de operadores. |
| 19 | Engenheiro Comandante | Parcial | Engenheiros custam −1 Poder; subcomandante com Guerra 4 ainda não é atribuído automaticamente à unidade. |
| 20 | Mestre de Armas | Automático | Primeira melhoria de equipamento por unidade gratuita e +1 efetivo na tabela de sobreviventes. |
| 21 | Mestre de Campo | Parcial | Especialização selecionada reduz −1 Poder ao recrutar unidade do tipo; subcomandante com Guerra 4 não é gerado. |
| 22 | Preparado para Cerco | Parcial | Absorção de Armadura +1 na unidade estacionada em fortificação; seis meses de provisões não têm contador de cerco/logística. |
| 23 | Irmandade Guerreira | Automático, condicionada | Cruzados −1 Poder; +2 Defesa para unidade designada na mesma região, somente com Abadia ativa. |
| 24 | Esportes Sangrentos | Automático | Plebeus −2 Poder no recrutamento, respeitando mínimo de custo. |
| 25 | Prisão | Automático | Criminosos/Guarnições −2 Poder, Defesa de Salão +4, rota População → Lei habilitada. |
| 26 | Carcereiros | Narrador | Equivalência à Guarnição Treinada com Percepção/Astúcia +1 ainda não é materializada como unidade operacional. |
| 27 | Academia Militar | Parcial | Conversão Riqueza → Poder 1:1 ativa; redução de perda de habilidades por dano de Guerra está documentada, sem resolvedor correspondente. |
| 28 | Treinamento Amplo | Parcial | A ação da Casa grava a quarta habilidade elegível na unidade; a validade de gasto de ação mensal precisa ser conciliada com o fluxo geral. |
| 29 | Treinamento Fundamental | Automático, condicionado | Habilidade escolhida +1 em todas as unidades como bônus derivado, sem reescrever o atributo-base. Vigor também modifica Saúde Máxima; ciclo de criação/edição/cura corrigido nesta auditoria. |
| 30 | Docas Secas | Parcial | Mitigação de até 2 na etapa Unidades e Baixas é **calculada** para navios, mas nenhum resolvedor dessa etapa consome o valor. |
| 31 | Gangues de Rua | Parcial | Desconto de recrutamento de Plebeus e mitigação de perda de Riqueza funcionam; penalidade adicional de Lei por Sorte foi ligada ao fechamento da Sorte. Confirmar com o Narrador se o desconto de Plebeus deve incidir em População (catálogo atual) ou Poder (texto genérico do suplemento). |
| 32 | Capangas de Prontidão | Narrador | Mobilização em 1d6 horas como Criminosos Treinados não é criada automaticamente como unidade temporária. |
| 33 | Estalagem Comercial | Automático, condicionada | Sorte +1 e Defesa +2 da unidade designada na mesma região; exige vinculação prévia. |

**Classificação:** 17 automáticos (alguns exigem escolha explícita), 13 parciais, 3 dependentes de ação específica do Narrador. Esta classificação mede a **cobertura da implementação**, não afirma que todos os modificadores de batalha foram executados.

## Efeitos não militares que não devem ser perdidos

Os efeitos do patrimônio são gravados em `HouseState.holdings[].effects` como **snapshot da regra na aquisição**. A mesma posse pode ter múltiplos efeitos. Não duplicar custos, não atualizar silenciosamente regras de compras antigas e não transformar bônus de evento em pontos permanentes.

| Investimento | Outro efeito | Destino/tempo correto |
|---|---|---|
| Produção de Alcatrão | `gain wealth +1` | Ganho de Riqueza em resultado positivo da Sorte, com empilhamento regulamentar. |
| Armeiro/Arqueiro | `fortune +1` | Modificador da Sorte mensal. |
| Pedreiro | `fortune +1` | Modificador da Sorte mensal; o +1 de Guerra é separado. |
| Construtor Naval | `fortune +1` | Modificador da Sorte mensal. |
| Gangues de Rua | `mitigation wealth +1` | Mitiga somente perda de Riqueza na Sorte; quando houver perda de Lei por Sorte, penalidade extra de 1 (nova correção). |
| Estalagem Comercial | `fortune +1` | Modificador da Sorte mensal. |
| Prisão | População → Lei | Habilita uma rota de Administrar Recursos; não é bônus de saldo. |
| Academia Militar | Riqueza → Poder 1:1 | Altera taxa de conversão; não é transferência automática. |
| Estaleiros | Economia de artesão | `action` textual ainda sem rotina de preços de artesãos. |
| Engenheiro | Aparelhos pessoais a 80% | `action` textual ainda sem motor de mercado pessoal. |

As **posses civis pré-requisito** também podem ter efeitos de Sorte e ganhos, independentemente de não aparecerem em Gestão Militar. Exemplo: Carvoaria registra `fortune +1` e pode coexistir com Produção de Alcatrão; ambas as fontes precisam ser consideradas.

## Cálculo compartilhado implementado nesta branch

- `src/lib/house/house-effect-ledger.ts` oferece `houseEffectLedger(state)`: `sources` com ID da posse, domínio e efeito original, totais **brutos** de Sorte, ganho e mitigação por recurso, penalidade especial de Gangues e lista de snapshots antigos que exigem conciliação.
- `resolveHouseNumericBonus(ledger, kind, resource, dice)` aplica `stackingBonus` somente quando houver dados do evento, sem inventar números quando os bônus precisam de rolagem.
- `fortune.ts` passa a usar esse mesmo cálculo tanto na prévia da Sorte quanto na sua confirmação. A aplicação econômica definitiva continua sendo lançada apenas em `state.permanent` e `state.fortunes` depois da ação; sem dupla contagem.
- Persistência canônica: `Holding.effects`, `Holding.status`, `Holding.parentId`, configurações militares e resultados históricos. Os totais derivados **não são gravados como uma segunda fonte de verdade** porque ficariam incorretos ao construir, destruir, transferir, mudar estação ou reconfigurar a posse. Um componente futuro importa o seletor e sempre recebe o valor vigente.
- `unitMilitaryBonuses(state,unit)` segue sendo a fonte compartilhada para valores numéricos militares, inclusive `meleeBonusDice`, `trackingBonusDice`, `warshipCasualtyMitigation`, dano, armadura, habilidade e defesa; itens sem resolvedor completo permanecem explícitos.

## Correções específicas desta branch

1. Defesa de fortificações dependentes agora usa `activeHoldings` e não aceita melhoria órfã de posse principal inativa.
2. Bônus +1 Vigor de Treinamento Fundamental passa a ser considerado na saúde inicial da unidade, no limite de cura e na edição de ficha.
3. O painel compacto de cada unidade exibe a graduação **efetiva** (base + bônus militar) quando há habilidade concedida por posse.
4. Gangues de Rua aumenta de fato em 1 as perdas de Lei decorrentes da Sorte, mantendo a mitigação de Riqueza em sua categoria própria.
5. Seletores de efeitos da Casa reutilizáveis e testes unitários adicionados.

## Pendências sem aplicação automática (não inventar regras)

- **Resolvedor de batalha:** consumação de dados extras de ataque/rastreamento, dano na rolagem, mitigação de Docas Secas e perda de habilidades por Guerra da Academia.
- **Subcomandantes e tropas temporárias:** Engenheiro Comandante, Mestre de Campo, Carcereiros, Treinamento Militar, Capangas de Prontidão.
- **Logística:** provisões de seis meses para Cerco, Prazo de armamentos de cerco e bônus de Guerra do Pedreiro nas comunidades/fortificações.
- **Outros efeitos não numéricos:** especialidades de artesãos, aparelhos pessoais de Engenheiro e armas Castle-forged.
- **Dados antigos:** posses importadas sem `effects` numéricos salvos devem aparecer como `unreconciled`, não receber catálogo novo implicitamente; o Narrador pode usar o fluxo já existente de conciliação.
- **Validação de campanha:** conferir individualmente históricos de Casas com importação e estados fora de sincronia; esta auditoria é de **código**, não acesso/alteração direta às fichas vivas.

## Testes propostos

`src/test/house-effect-ledger.test.ts` cobre fontes de Sorte/ganho/mitigação, empilhamento, exclusão por status, dependência de posse principal, efeito sazonal, snapshots sem efeitos, penalidade de Lei e Saúde Máxima derivada; `src/test/house-military-automation.test.ts` já cobre parte dos custos, fortificações, treinamento e combate.

**Limite da auditoria:** não há simulação automática completa de campanha/Guerra nem conciliação de todas as fichas históricas; nenhuma pendência manual foi marcada como efeito automaticamente aplicado.
