# Espionagem — Lote 0: diagnóstico e congelamento de regras
**Projeto:** Cormyr Chronicle Atlas  
**Referência funcional:** CCA-ESP-MVP-001 v1.0, 02/11/2026  
**Baseline do GitHub:** `main` @ `e9d551b39226fea0033aca93f408af40dc167ba3`  
**Estado:** EXECUTADO — diagnóstico documental; MATRIZ AGUARDANDO APROVAÇÃO do Narrador  
**Limite:** sem SQL, sem persistência, sem rota inventada, sem agentes criados, sem acesso a dados de outra Casa.

## 1. Evidência de código e fronteiras
- `src/lib/house/prosperity-catalog.json` é o catálogo existente; `src/lib/house/source-audit.json` distingue fonte recuperada de lacunas (inclusive OCR). Não substituir a fonte por suposição.
- `src/lib/house/engine.ts`: `balances(state)` calcula `total`, `allocated`, `committed` e `available`. O custo das posses abaixo é **alocação** de recursos da Casa, não moeda e não cobrança recorrente por missão. `activeHoldings(state)` exige status ativo e cadeia de pais ativos; posse `building` reserva recursos mas não habilita uma célula.
- `src/lib/house/house.functions.ts`: `houseOperation` já registra operações da Casa com chave idempotente no ledger; os futuros atalhos de compra devem reutilizar o fluxo `quote/purchase`, sem segundo lançamento financeiro.
- `src/components/house/gm-notes.tsx` guarda `spyCells` como linhas livres nas notas sigilosas do Narrador. **Não apagar nem converter automaticamente** estas linhas em agentes de missão; cada vínculo precisa de conciliação por Casa/domínio e ID.
- `src/components/house/hub.tsx`: navegação atual `army` → `court`. A futura seção `spy` entra entre as duas no Lote 8, e **não** agora.
- `src/lib/calendar/temporal-engine.ts` fornece `getHarptosOrdinal` e `fromHarptosOrdinal`. `temporal-consumers.ts` não equivale a um processador de viagens persistentes já homologado.
- `docs/hub-temporal-homologacao-isolada-2026-10-31.md` mantém **NO_GO de produção**, por dependências de migração, restauração e acesso. A espionagem herda esse bloqueio, sem afirmar que o CI verde equivale a publicação.

## 2. Matriz canônica do catálogo
**Custos e duração como registrados no código; indicação de 'reconstruído' NÃO constitui confirmação da regra impressa.** A cópia verificável por máquina está em `docs/espionage/lote-0-matriz-canonica.json`.

| ID da posse | Custo em recursos | Prazo no catálogo (meses) | Efeito útil / status |
| --- | --- | --- | --- |
| `pros-spy-network` | 10 Riqueza | 12+2d6 **reconstruído** | Libera Infiltração de Célula; **quantidade inicial desconhecida** |
| `pros-spy-network--expanded-network` | 5 Riqueza | 1d6 | **+2 células por compra ativa**, no domínio próprio; repetível, exige rede ativa |
| `pros-spy-network--expert-spies` | 5 Riqueza | 1d6 | Detecção por Astúcia sofre −1D |
| `pros-spy-network--plausible-deniability` | 5 Riqueza | 1d6 | Proteção contra perda de Influência/exposição em falhas cabíveis; não apaga incidentes |
| `pros-dog-kennels--guard-dogs` | 5 Riqueza | 1d6 | Dificuldade de Astúcia de agentes inimigos +3 na área aplicável |
| `pros-bailiffs--investigative-training` | 5 Riqueza | 1d6 | Dificuldade +3 a hostis na área; captura descrita na fonte exige adjudicação |
| `pros-secret-police` | 3 Poder + 10 Riqueza | 12+2d6 **reconstruído** | Segurança/Lei; corpo básico da regra parcial |
| `pros-secret-police--special-detachment` | 5 Riqueza | 1d6 | Habilita Infiltração da Polícia Secreta; não é uma célula da Rede |
| `pros-street-gangs--eyes-everywhere` | 5 Riqueza | 2d6 | Contatos locais e informação comparável à Rede, com decisão de escopo |
| `pros-tournament-master--herald` | 5 Riqueza | 1d6 | Inteligência heráldica e informações elegíveis; limite territorial pendente |
| `pros-minstrel-s-seat` | 10 Riqueza | 2d6 | Informações entre artistas por Status, sem tabela completa de dificuldades |
| `pros-sewer--secret-tunnels` | 5 Riqueza | 1d6 | Entradas/saídas discretas locais; não reduz automaticamente o tempo entre regiões |

**Regra com evidência explícita em `source-audit.json > acoes`:** Infiltração de Célula é uma *ação da Casa* com Status (Steward), dificuldade 9; cada grau de sucesso desloca uma célula; o deslocamento ocupa um mês inteiro, sem Connections nesse intervalo; falha implica perda de célula. Não é o mesmo procedimento que o deslocamento narrativo comum por estrada. O responsável e os efeitos do fragmento de descoberta da Rede (dificuldade 6 até Lei 30, +3 por 5 pontos acima) estão incompletos/contraditórios; **não automatizar como dificuldade geral de espionagem**.

## 3. Matriz de Lei e autoria player/NPC
| Tipo de alvo | Fonte verificável | Situação operacional |
| --- | --- | --- |
| Casa de jogador com ficha estruturada | `noble_house_sheets.state` + `balances(targetState).total.law` **sugerido**, não aprovado | Apenas servidor; não enviar Lei bruta nem estado privado ao atacante |
| Casa NPC com ficha canônica | Fonte NPC versionada e aprovada pelo Narrador | Não foi confirmada cobertura completa de dados NPC no runtime; cadastrar e vincular antes de simular |
| Região com várias autoridades | Parâmetro explícito do Narrador para segurança regional | Ainda não cadastrado nem aprovado |
| Ficha narrativa/arquivo legado | `house_catalog`, `campaign_records` e material regional | Não equivale automaticamente à Lei, NPC operacional, sede georreferenciada ou permissão de leitura |

`src/lib/house/regions.ts` define onze regiões e **bônus de criação regional**, nunca Lei efetiva de cada alvo. O sistema possui `campaign_houses`, `house_memberships`, `noble_house_sheets` e registros narrativos: a vinculação player/NPC e a seleção de fonte autorizada devem ser feitas no servidor por IDs, não por comparação textual de nomes ou por ausência de associação.

Sem Lei confirmada, regra de dificuldade por missão aprovada e contramedidas contextuais classificadas: **`pending_narrator_review`**; não exibir chance numérica. Cães de Guarda e Treinamento Investigativo têm efeitos +3 contextuais; o catálogo não autoriza somar ambos sem regra de acumulação aprovada.

## 4. Rede mínima de rotas: inventário, não geografia inventada
A referência de regiões em `src/lib/house/regions.ts` contém onze identificadores: `crownlands`, `veilstone`, `shieldmark`, `helmlands`, `horselands`, `dragoncoast`, `swordmark`, `ferlin`, `stonelands`, `elfhold`, `volkumburgh`.

- **Nós conhecidos:** somente os IDs regionais acima como candidatos a nós `region`. Uma sede, domínio ou povoado requer ID próprio de fonte canônica e validação de seu vínculo com a Casa.
- **Arestas de viagem aprovadas:** **zero** na matriz. A descrição narrativa em `public/cormyr/regions/*.json` menciona estradas, rios e portos, mas não constitui arestas com duração, direção, modal ou autor da validação.
- **Tempos/distâncias:** indeterminados. Sem aresta validada, a única resposta correta é **Rota não cadastrada**. Não calcular quilômetros a partir de mapas ilustrativos, nem inferir tempo do deslocamento de unidades militares.
- **Protocolo futuro:** Narrador aprova origem/destino, direção, modalidade, dias-base, fonte, versão e bloqueios; viagens usam ordinais do Hub Temporal, inclusive dias intercalares, e não relógio real.
- **Percursos mínimos que precisam ser cadastrados posteriormente:** sede→região; região→sede de outra Casa; região→região; retorno. Nenhum dos quatro é executável nesta etapa.

## 5. Decisões congeladas — estados de aprovação
| Decisão | Estado | Comportamento seguro até decisão |
| --- | --- | --- |
| Número inicial de células e distribuição da Rede básica | **Pendente de fonte** | Não gerar células por compra da Rede base |
| Preço/contabilidade/duração/limite do contratado avulso | **Pendente do Narrador** | Contratação desligada, sem custo inventado |
| Lei de alvo jogador: total da Casa ou por domínio | **Pendente do Narrador** | Proposta `balances().total.law`, não aplicada automaticamente |
| Lei de NPC e segurança regional | **Pendente de cadastros/fonte** | Dificuldade não calculada |
| Dificuldade por classe da informação | **Pendente do Narrador** | Não simular chance de sucesso |
| Acumulação de contramedidas +3 | **Pendente de conciliação** | Não somar automaticamente |
| Rede de nós, arestas e tempos | **Pendente de homologação** | Rota não cadastrada |
| Envio antecipado de carta antes do retorno | **Pendente do Narrador** | Não divulgar automaticamente |
| Campos familiares reveláveis | **Pendente do Narrador** | Negar por padrão dados privados |
| Consumidor temporal e homologação do banco | **NO_GO existente** | Sem SQL, sem produção |

**Resolução de escopo nesta etapa:** não inventar números; manter os pontos pendentes como `null` ou estado explícito de revisão; manter blocos de confidencialidade e compatibilidade com a ficha histórica.

## 6. Riscos e critérios para avançar ao Lote 1
1. **Confidencialidade:** jamais consultar JSON integral da Casa-alvo para entrega ao cliente; futura API filtrará fatos autorizados por Casa mandante e Narrador.
2. **Contabilidade:** compra de posse, manutenção, reserva, tarifa avulsa e moedas são conceitos distintos; futuras operações com `operation_key` idempotente.
3. **Temporal:** não tratar invalidação de queries como conclusão de deslocamento; consumidor durável virá no Lote 11.
4. **Fonte:** número de células, regras de detecção e prazo reconstruído não ganham autoridade por constar no catálogo.
5. **Legado:** anotações `spyCells` preservadas, sem criar ativos operacionais automaticamente.
6. **Geografia:** sem arestas aprovadas, nenhum algoritmo pode devolver dias ou data de chegada.
7. **Homologação:** respeitar NO_GO existente, backup, RLS e revisão de PR antes de qualquer liberação a jogadores.

**Critérios auditáveis do Lote 0:** todas as entradas canônicas referenciam IDs do catálogo; custos/modos/prazos correspondem à versão do código; onze IDs regionais estão presentes; nenhuma aresta de rota ou tarifa avulsa foi fabricada; decisões pendentes estão listadas; nenhuma migração ou componente de produção foi alterado.

**Aprovação:** o diagnóstico pode receber revisão em PR. O Narrador ainda precisa confirmar a tabela de decisões e disponibilizar fontes ausentes para destravar automações posteriores. Esta entrega **não** afirma o aceite funcional final do módulo nem autorização de produção.

## 7. Sequência futura
Lote 1: tipos TypeScript, Zod, enums, testes de contrato, sem acesso a dados privados de outras Casas. Lotes 2–5: economia/capacidades, cadastro administrativo de geografia, motor temporal e ativos após aprovação das fontes aplicáveis. Manter cada lote em PR próprio conforme `AGENTS.md`.
