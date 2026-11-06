# Correção de legibilidade — Módulo de batalha V4

**Objetivo:** tornar a interface legível em toda a área de batalha do Narrador e do jogador, incluindo a tela inicial, V3/PTE, CRZ, formulário e telas ampliadas, sem modificar mecânica de combate.

## Problemas identificados
- O módulo herdava tamanho-base de 14 px, enquanto descrições, indicadores e botões utilizavam fontes de 10 a 13 px.
- Os botões `variant="outline"` herdavam a classe `bg-background` do componente compartilhado; em fundos escuros, a combinação com texto claro produzia uma superfície quase branca com letras pouco visíveis.
- `disabled:opacity-50` reduzia mais a leitura. O estado de indisponibilidade não precisa tornar o texto invisível.

## Padrão aplicado
- Texto-base 16 px, descrições da página inicial 17 px, títulos 23–38 px conforme hierarquia e largura, corpo das arenas 16 px, botões e log no mínimo 15 px, mensagens secundárias com mínimo de 14 px.
- Superfície da página inicial mais escura, texto creme e títulos dourados; botões de contorno com fundo escuro uniforme e texto claro; botões indisponíveis com fundo cinza-escuro, texto visível e borda pontilhada, mantendo a interação desativada.
- Cor de texto do botão ativo e em hover consistente; foco por teclado em dourado. Campos, listas e mensagens legíveis com espaço e linhas maiores.
- Ordem de combate V3/CRZ com mais largura por unidade, mantendo rolagem horizontal e mapa em destaque.
- CSS isolado em `battle-legibility.css`; importação pelos componentes de entrada do Narrador, dos jogadores e das duas arenas. Componentes globais, SVG de unidades e formulários de outras áreas do site são preservados.

## Validação
- Teste de navegador Chromium em 1440 × 900 e 390 × 844: medir CSS calculado, contraste de texto/controle de pelo menos 4,5:1, tamanhos, botões desabilitados com opacidade 1, sem overflow de página.
- Teste nas arenas V3 e CRZ em tela ampliada, sem alterações no motor.
- CI Vitest, TypeScript, build, bancos descartáveis e browser acceptance.

## Segurança e rollback
Sem novas migrações, API, alterações em contas, senhas, fichas oficiais, dados de combate, replay ou calendário. Para desfazer, reverter o patch de estilo da release; não é necessária reversão de banco.
