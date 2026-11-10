# Cormyr — Lote 1: miniaturas rígidas 3D (protótipo)

Data: 10/11/2026. Estado: implementação inicial no repositório, **não publicada** no site; testes manuais de GPU/Android ainda necessários.

## Escopo entregue

- Tabuleiro tridimensional real em React Three Fiber/Three.js; piso quadrado de 11×9 ou 15×11 casas. Cores de planície, floresta, colina e rocha vêm de variáveis CSS; árvores e rochas são objetos baixos e decorativos, sem mudar regras do terreno.
- Modelos **originais de geometria sólida** (caixas, esferas, cilindros, cones e toros), sem assets externos, rigging, esqueletos ou animações de membros: infantaria com espada/escudo; arqueiros com arco/aljava; cavalaria montada; goblin verde. As demais unidades V3 usam figura genérica de infantaria, explicitamente marcada como genérica. Este **não** é o lote de acabamento das 17 unidades.
- Cada miniatura usa base com cor do lado, destaque de selecionada/ativa/alvo, rótulo e efetivo atual. Destruídos e debandados não aparecem. Uma peça representa uma pilha de soldados, não um indivíduo por soldado.
- Câmera ortográfica isométrica e superior, zoom, centralizar e pan com mouse esquerdo ou dedo; controle do mouse e do touch preserva clique válido, evitando ações após arrastar.
- Quando a posição **já foi validada pelo motor**, apenas o grupo visual desliza até o destino; nenhuma regra, pathfinding ou coordenada de campanha é modificada. Preferência do sistema por movimento reduzido elimina a interpolação.
- Cena é carregada preguiçosamente somente quando solicitada. Se WebGL2/contexto falha, a interface volta ao tabuleiro SVG 2D, que continua disponível e acessível.

## Integração e restrição de acesso

- O código fica em `src/components/battle/miniatures3d/` e o adaptador puro em `src/lib/battle/visual3d/`.
- `BattleV3Game` (Adaptado V3) passa para `V3MiniatureBoard` os mesmos `map`, `stacks`, `moveKeys`, `attackKeys`, IDs selecionados e `onHexClick` antes usados pelo `BattleBoard`. O **motor V3 continua sendo a única autoridade** dos comandos.
- A opção “Habilitar miniaturas 3D nesta sessão (teste)” existe apenas para `narrator=true`; sem a habilitação, ou em mapa hexagonal legado, somente o SVG aparece. Mesmo habilitado, o início e a retomada da batalha continuam em 2D, até o Narrador escolher “Miniaturas 3D (teste)”.
- A galeria “Ver protótipo 3D” usa quatro tokens com IDs `demo-*` e um mapa artificial local. O comando “Mover peça” da galeria é **somente visual**, sem motor, persistência, cadastro de monstros ou mudança de tropas oficiais.
- Modo GOT e modo D&D não foram alterados no lote 1. A estrutura visual permite adaptadores futuros, mas a integração atual é somente com Adaptado V3.
- Nenhuma migração SQL, alteração de autenticação, banco, fichas, calendário ou replays é necessária. O arquivo gerado `src/integrations/supabase/types.ts`, que recebeu mudança incidental durante a primeira implementação, foi restaurado para evitar efeitos fora do escopo.

## Como acessar no preview (Narrador)

1. Acesse o editor/preview Lovable do Cormyr com uma conta de Narrador de teste, abra o módulo de batalha e escolha **Adaptado**.
2. Antes de começar a partida, abra “Ver protótipo 3D” para ver Infantaria, Arqueiros, Cavalaria e Goblin e testar “Mover peça”.
3. Para testar com o motor real, marque “Habilitar miniaturas 3D nesta sessão (teste)”, inicie uma batalha fictícia e, no cabeçalho “Campo de batalha”, clique em “Miniaturas 3D (teste)”.
4. Alterne câmera superior/isométrica, arraste, aproxime, clique em peças e destinos verdes, confira ataque válido; volte a “Mapa 2D” para comparar os mesmos estados e usar navegação por teclado.
5. Nunca publique o preview como se fosse homologação/produção aprovada apenas por estes testes.

## Testes e critérios de aceite

Na primeira implementação o executor Lovable relatou **59 testes automatizados aprovados** nos conjuntos direcionados ao 3D, fallback, V3, replay, mapa quadrado e sistema métrico; também informou compilação/tipos sem erros. Esta é a evidência registrada daquele executor, **não uma auditoria independente em Android ou GPU real**.

Critérios antes de liberar para usuários:
- `bun install --frozen-lockfile`, `bun run build` e `bun run test` aprovados na branch final.
- Navegação real no Chromium: WebGL ativo, contexto perdido, zoom, pan com mouse e toque, câmera, rótulos, seleção e movimento sem comandos acidentais.
- Teste em Android intermediário e computador, inclusive em tela estreita, com meta de ao menos 30 FPS no cenário usual; medir memória/CPU com muitos tokens, não assumir desempenho.
- Retomada/replay exatamente igual entre modos 2D e 3D. A visualização nunca decide alcance, movimento, dano ou ataque.
- Verificar foco, acessibilidade e `prefers-reduced-motion`.
- Revisão visual das proporções e legibilidade das miniaturas (incluindo etiquetas sobrepondo-se); cenas maiores podem exigir LOD, instanciamento e rótulos simplificados nos lotes seguintes.

## Riscos e pendências conhecidas

- O protótipo interpola diretamente entre posições, sem percorrer visualmente todas as casas do caminho. O motor continua validando o destino; animação visual de rota ficará para etapa futura.
- Os demais 14 tipos militares ainda não possuem modelagem distinta; “Navios de Guerra” exige cena naval própria e não se confunde com infantaria.
- Acesso WebGL2, memória, consumo de bateria, perda de contexto e desempenho Android precisam de teste manual real. O 2D permanece como padrão e fallback.
- A interface 3D ainda não oferece navegação integral por teclado; volte ao 2D para teclado/tecnologia assistiva.
- `bun.lock` é obrigatório e foi atualizado pela instalação de Three.js/Fiber/Drei; não criar `package-lock.json`.
- O repositório contém outros componentes do site: não inferir que abrir PR ou alterar a branch publica a versão. A publicação exige ação própria no Lovable.

## Próximas etapas

Lote 2: distinguir as 17 unidades com equipamento e casas, refinar materiais e composição; não instalar assets com direitos insuficientes. Lote 3: adaptadores para GOT e D&D, com footprints de criaturas, terrenos especiais e SI preservados. Lote 4: desempenho, acessibilidade e validação real em dispositivos.
