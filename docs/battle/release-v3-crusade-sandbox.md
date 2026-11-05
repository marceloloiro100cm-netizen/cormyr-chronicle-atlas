# CORMYR — Cruzada Tática V3 · Entrega de teste independente

## Escopo e segurança
- Menu dos jogadores ativos: **Batalha → Batalhar**, com seleção de **casas MODELO**, controle de IA ou hotseat, tropas fictícias, comandante e mapa. Não fornece `Criar batalha` nem acesso a fichas reais.
- Menu do Narrador: **Batalhar** (V3) e **Criar batalha** (laboratório oficial de preparação PTE-2.0) em botões distintos. Importação somente leitura das casas reais permanece apenas no laboratório do Narrador.
- As seis casas-modelo têm soldados demonstrativos fixos. Não são fichas das casas reais, mesmo quando reutilizam nomes do cenário.
- **Dez arquétipos de comandantes originais** inspirados no design de jogos de batalha tática, sem copiar nomes, sprites, ícones, regras licenciadas ou materiais de Pathfinder: Mestre Tillet, Lady Mirena Arundel, Sir Roderic Vael, Vespera dos Sete Véus, Capitã Elira Thal, Ronan Olho-de-Falcão, Irmã Caela de Helm, Brokk dos Caminhos, Seris do Conclave e Kael das Cinzas.
- Um bônus passivo por comandante (aplicado apenas aos snapshots fictícios) e um poder ativo de uso único por encontro (Rally, Juramento, Investida, Lança Arcana, Formação, Fumaça, Cura, Sabotagem, Rações e Intimidação). Sem evolução automática de XP.
- Habilidades diferenciadas das tropas no terreno: Investida (cavalaria após movimento), Salva Coordenada (atiradores), Muralha de Escudos (linha), Emboscada (batedores e guerrilheiros em cobertura) e Desmantelar Armadura (engenheiros).
- A geometria, custo por terreno, iniciativa, ataques normais, retaliação, moral e IA são executados pelo motor PTE-2.0 já validado. A V3 adiciona efeitos localmente: `PTE-3.0-SANDBOX`, **não é replay oficial PTE-2.0**.
- **Nenhuma chamada de escrita**, endpoint Supabase ou alteração de `HouseState` na V3. A exportação JSON do laboratório não é enviada ao banco.
- Interface original do Cormyr: painéis de estandartes, comandante, lista de pilhas com barras de PV, estado da rodada, ações contextuais e habilidades. Sem copiar imagens da Owlcat.

## Testes / aceite
- Modelo com quatro pilhas por lado, controle IA ou dois jogadores no mesmo aparelho, até cinco categorias por lado no motor já existente.
- Habilidade indisponível não pode ser executada. Nenhum poder de comandante pode ser executado duas vezes no mesmo encontro.
- Movimento usa as regras PTE-2.0 e é recusado quando ilegal. Combate por pilhas recalcula o efetivo e o dano.
- Narrador conserva importação de tropas reais somente leitura no laboratório antigo e dados de batalha persistidos anteriores.
- A UI do jogador é acessível somente após o escopo autenticado da rota `/_authenticated/jogadores`, sem menus de admin.
- Testes Vitest + tsc + build + Chromium de aceitação existentes devem passar antes de merge.

## Fora desta PR e dependências futuras
- O **segundo botão do jogador para uma batalha convocada pelo Narrador** dependerá de um registro de convite com destinatário e RLS próprios. Não basta o Narrador criar um laboratório PTE-2.0: os dois fluxos devem estar associados explicitamente.
- Batalhas multiplayer entre navegadores, progressão de comandantes, mapa estratégico das 11 regiões, cerco, magia de múltiplos alvos e baixas oficiais exigem contratos/versionamento e lote independente.
- Antes de criar convites vinculados às casas, fazer revisão de RLS da associação `user_roles`/`campaign_members`, e testes de acesso cruzado. Não usar tabela admin-only para leitura por jogadores.
- O modo V3 não usa os snapshots oficiais nem aplica perdas. Esse isolamento é intencional até aceite de migração, replay versionado V3 e segurança de múltiplas casas.

## Disponibilidade
A integração com a branch `main` e a publicação são etapas separadas; só declarar implantado depois de CI, merge e confirmação do Lovable.
