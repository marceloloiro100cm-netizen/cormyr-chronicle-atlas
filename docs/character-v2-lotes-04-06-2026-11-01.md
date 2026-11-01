# Cormyr Chronicle Atlas — Ficha V2 — Lotes 04 a 06

**Estado:** implementação em módulos puros, ainda não exposta para jogadores, sem alterações no banco. A flag CHARACTER_V2_PLAYER_UI_ENABLED permanece false.

## Lote 04 — Habilidades, especialidades e orçamento de criação
- Arquivo: src/lib/character-v2/creation.ts.
- Fonte: Guerra dos Tronos RPG (PT-BR), capítulo 3, tabelas 3-8, 3-9, 3-10; capítulo 4, tabela 4-1.
- 19 habilidades oficiais, Astúcia dentro da lista e Briga apenas como especialidade de Luta.
- Compra inicial de habilidades: grau 1 (-50 XP), grau 2 (0), 3 (10), 4 (40), 5 (70), 6 (100), 7 (130). Não usar custos militares.
- Orçamentos de habilidades/especialidades: Criança 120/40, Adolescente 150/40, Jovem 180/60, Adulto 210/80, Meia-idade 240/100, Velho 270/160, Muito Velho 330/200, Venerável 360/240.
- Tetos iniciais: 4/4/5/7/6/5/5/5; Status tem teto separado da Casa. Cada B custa 10 XP; B não pode exceder graduação; duplicados e especialidades não aprovadas são bloqueados.
- Destino inicial de faixas avançadas ainda exige conferência da fonte física e decisão expressa do Narrador. Esta entrega não recalcula idade pelo Hub Temporal.
- quoteCharacterCreation produz decomposição e violações, validateCharacterCreation bloqueia compras fora da regra.

## Lote 05 — Derivadas com decomposição
- Arquivo: src/lib/character-v2/derived.ts.
- Defesa em Combate = Agilidade + Atletismo + Percepção + defesa de escudo/arma – penalidade de armadura.
- Defesa em Intriga = Astúcia + Percepção + Status.
- Saúde = 3 × Vigor; Compostura = 3 × Vontade.
- Movimento = max(0,4 + floor(Correr B/2) - floor(Volume/2) + modificadores homologados).
- Corrida = max(0, 4 × Movimento - Volume + modificadores homologados).
- VA separado da penalidade de armadura; linhas de origem, versões e dependências DAG.
- Equipamento não verificado e bônus não aprovados não são aplicados; aplicação duplicada por stackKey é rejeitada; máximos não reescrevem danos existentes.
- Rápido, Manco e demais qualidades ainda não alteram números até os lotes 07–09. Nenhum contexto recebido pelo cliente equivale a autorização real.

## Lote 06 — XP e Destino
- Arquivos: src/lib/character-v2/economy.ts e transactions.ts.
- Ledger em memória com IDs, chave de idempotência, ator, data, justificativa, regra, versão, saldo antes/depois e replay para detectar adulteração.
- XP de criação e XP de campanha são recursos separados. Especialidade custa 10 XP por 1B; adquirir Destino custa 50 XP.
- Destino disponível, gasto temporariamente, queimado permanentemente e investido em qualidades são saldos distintos.
- Renovações, concessões, liberações e estornos de compras exigem confirmação administrativa, valor e origem. Duplicações e saldo negativo são rejeitados.
- Compra e estorno de especialidade têm operação pura que altera uma cópia da ficha e do ledger simultaneamente, jamais o original. Não há gravação no Supabase.
- Evolução de graduações após criação aguarda conferência da tabela própria, sem inventar preço. O motor não autoriza clientes: camada server + RLS + transação ficará para lote 11.

## Critérios de aceitação e limites
- Testar as 8 faixas, graus, Astúcia e Briga, limites B, Aldaeric 4+3+4=11 em Intriga, corrida/volume, equipamentos, invalidação de modificador, XP/Destino, estornos e idempotência.
- Rodar testes, TypeScript e build em GitHub Actions.
- Não publicar ficha V2, migrar legado, alterar banco, liberar compras ou aplicar qualidades antes dos lotes 07–12.
- Fonte textual do Drive tem possíveis erros de OCR; conferir edição física antes do rollout.
