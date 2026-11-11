# Leonardo — acesso de usuário ao simulador de batalha

O jogador **Leonardo**, associado à identidade especial **Espião**, pode abrir **Batalha** na área autenticada de jogadores. A liberação não amplia a flag geral de jogadores e não dá papel de Narrador.

## Limites
- GOT, Adaptado e D&D abrem em modos de simulação independentes.
- GOT aceita Casas e brasões do acervo público como referência; usa **exércitos-modelo**, não dados de fichas privadas.
- D&D usa monstros e unidades de treinamento, sem carregar o bestiário privado e sem modificar criaturas salvas do Narrador.
- Adaptado V3 opera sobre exércitos-modelo e replay local.
- Não há convocações, multiplayer, publicação de resultados, persistência oficial ou confirmação de baixas.
- Salvamento no navegador (quando disponível) e exportação de replays não alteram as Casas reais.
- Operações de aplicação de baixas, pontos, XP, exército, economia ou calendário continuam exclusivas das funções administrativas do servidor e RLS.

## Condições de acesso

A interface exige a sessão autenticada, jogador ativo com nome Leonardo, casa principal `espiao`, vínculo `house_memberships` à casa e ausência de alteração de senha pendente. A seleção na tela de login não concede permissões.

A criação e vinculação reais da conta no Supabase são etapas distintas. Código publicado não cria usuário. Para testar, confirmar conta ativa e vínculo `espiao` em ambiente apropriado. Validar bloqueio para um usuário sem vínculo e remoção imediata da aba quando houver revogação.

## Verificação
Executar `src/test/leonardo-battle-sandbox.test.ts` e os testes de batalha existentes; conferir os três modos sem gravação de fichas.
