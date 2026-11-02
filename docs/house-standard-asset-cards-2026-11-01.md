# Padrão oficial de quadros — Casa Nobre

A partir desta atualização, novos quadros de posses e construções devem usar
`HouseAssetCard` e `HouseAssetGrid` em `src/components/house/asset-card.tsx`.
A apresentação preserva exatamente as classes e a aparência já utilizadas em **Gestão militar da Casa**.

## Anatomia obrigatória

- Ícone na esquerda e categoria/nome pequeno
- Estado principal legível: nome da posse adquirida, **Não adquirido** ou **Em construção**
- Texto curto de benefício ou descrição, com limite de linhas
- Seta de expansão e detalhes clicáveis
- Na expansão: descrição, bônus/habilidades, custo, prazo, regras, requisitos, fonte e controles permitidos
- Compra por `PurchaseDrawer`, com validação de recursos e requisitos pelo mesmo motor `quote`; sem débito direto pelo cartão
- No caso de falta de recursos: botão inativo **Sem recursos**; requisitos ausentes ficam explicitamente indicados
- Somente jogadores autorizados/Narrador podem realizar compras e operações, obedecendo também ao bloqueio do Hub Temporal

## Onde foi adotado

- Exército: cartões existentes migrados ao componente visual compartilhado, preservando regras militares e configurações específicas
- Terras: domínios existentes + opções de terrenos, características e comunidades
- Fortificações: cinco tipos de fortificação e demais itens da categoria
- Economia: propriedades, especialistas, assentamentos, melhorias e equipamentos econômicos; busca e filtro por categoria, com carregamento progressivo de cartões

## Para telas futuras

Importar `HouseAssetCard` e `HouseAssetGrid` em vez de criar novos `house-card` ou
`details` com estilos próprios. O componente visual **não grava dados por conta própria**;
ações de compra/edição devem passar pela operação versionada e pela política de acesso da Casa.
Reutilize `HouseAssetCatalog` para grupos do catálogo e mantenha categorias mapeadas em
`CATEGORY_BY_SECTION` quando abrir uma nova seção.

## Integridade

Não houve exclusão de posses nem alterações no catálogo. O saldo, os custos, a herança de
efeitos militares, a duração das obras, a execução da compra e os pré-requisitos continuam
validados pelo motor de regras já existente. Itens marcados como pendentes pela fonte não
recebem efeitos adicionais inventados.
