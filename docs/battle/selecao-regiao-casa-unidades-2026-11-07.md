# Seleção de Região → Casa → Unidades militares
**Módulo:** Batalha, Narrador (PTE-2.0/V3) · 07/11/2026

## Fluxo implantado na branch da auditoria
1. Narrador entra em **Criar batalha → Casas cadastradas · Região e Casa** (PTE) ou **Batalha rápida com comandantes → Carregar unidades · Região → Casa → Exército** (V3).
2. Define o **lado** (Atacante/Defensor), escolhe uma das **regiões do catálogo de Cormyr** e escolhe a Casa.
3. O módulo consulta automaticamente as **unidades militares cadastradas na ficha mecânica autorizada**. A lista apresenta nome, treinamento, efetivo restante, indisponibilidade e perfil misto.
4. Narrador marca até cinco unidades terrestres e escolhe **Carregar unidades na batalha**. O sistema constrói snapshots independentes no servidor, com tipo e características reais mapeadas pelo adaptador PTE; no PTE, a zona de implantação é preenchida automaticamente no início rápido, ou manualmente na configuração detalhada.
5. Ambos os exércitos podem ter Casas diferentes. Na V3, as Casas escolhidas aparecem nos cards e no histórico, com os Generais escolhidos pelo Narrador.

## Fonte dos dados e limitações
- Catálogo regional: `house_catalog` **revisado** (permite selecionar as Casas históricas) unido a `campaign_houses` da temporada 2; regiões normalizadas pelo próprio cadastro oficial das 11 regiões.
- Fonte militar autorizada: `noble_house_sheets.state.units` da Casa exata. **As imagens, brasões e narrativas históricas não fornecem automaticamente quantidade/treinamento/atributos militares.**
- Uma Casa presente somente no catálogo histórico **aparece no seletor**, mas indica *sem ficha militar importada* e **não ganha unidades inventadas**. Para disponibilizá-las, as tropas precisam ser importadas e conciliadas na ficha militar do site.
- Tropas destruídas, sem efetivo ou `warships` são somente informativas e não podem ser copiadas para mapa terrestre. Unidades de tipos mistos exigem escolha individual de perfil e justificativa, conforme motor PTE.
- Limite de **cinco agrupamentos por lado**; as duplicatas por `houseId:unitId` são recusadas em ambos os motores.
- V3 mantém o fallback de exércitos-modelo somente nos lados sem tropas copiadas. No PTE, o início rápido faz a mesma distinção.
- São cópias `house-readonly` construídas **no servidor com autenticação ativa do Narrador**. O cliente não envia atributos/efetivos para criar snapshots.
- Não existe alteração de `HouseState`, unidades oficiais, XP, custos, contas, baixas ou calendário. Nenhum acesso foi concedido a jogadores.

## Testes
- `battle-region-house-units.test.ts`: catálogo, regiões, elegibilidade e contratos de origem.
- `battle-region-house-picker-ui.test.tsx`: seleção e carregamento assíncrono, lotes, restrições e falta de ficha.
- `battle-pte-house-import-flow.test.tsx`: PTE inicia com cópia do exército da Casa após seleção, sem substituir erroneamente por modelos.
- Testes históricos da auditoria, do tabuleiro e do replay também devem permanecer verdes.

## Aceite de homologação com dados reais
1. Logar como Narrador; verificar 11 regiões e todas as Casas que constam no catálogo revisado.
2. Escolher uma Casa com ficha e tropas. Confirmar nomes, treinamento e efetivo contra `noble_house_sheets`; não inventar quantidade.
3. Importar tropas de duas Casas em lados diferentes, iniciar PTE e V3, confirmar campos e nome da Casa.
4. Escolher uma Casa apenas histórica sem ficha militar: mostrar aviso transparente e não permitir importação.
5. Tentar adicionar sexta unidade, unidade naval, destruída, mista sem justificativa e duplicata: todas devem ser recusadas.
6. Comparar ficha oficial antes/depois do treino: nenhum lançamento ou alteração.
7. Jogador sem permissão não acessa o endpoint mesmo chamando a API diretamente.
8. Provar o SHA publicado antes de anunciar produção.

**Esta branch não é publicação automática**; somente testes de CI não substituem homologação JWT com banco real.
