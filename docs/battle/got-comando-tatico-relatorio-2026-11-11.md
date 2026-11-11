# Batalha Game of Thrones: análise e relatório de atividade (2026-11-11)

Escopo: modo Game of Thrones (capítulo 10 do livro básico) do módulo de batalha.
Os modos Adaptado e D&D não foram alterados.

## 1. Análise do módulo antes da mudança

### Regras (motor `src/lib/battle/got/`)

O motor já era fiel ao capítulo 10. Pontos conferidos contra o livro:

| Regra do livro | Situação no motor |
| --- | --- |
| Ordens por rodada: graduação em Guerra do comandante, mais uma por subcomandante | Correto |
| Comandantes alternam, uma ordem por vez; iniciativa nova a cada rodada | Correto |
| Teste de Guerra contra a Disciplina da unidade | Correto |
| +3 de Dificuldade a cada ordem repetida para a mesma unidade na rodada | Correto |
| Falha: a tropa segue a ordem contínua no Passo Nove; falha crítica: não age | Correto |
| Carga: −1D em Luta e +2 de dano básico | Correto |
| Defender: teste de Agilidade substitui a Defesa na rodada | Correto |
| Saúde 0: desorganizada (−1D, Disciplina +3, cumulativo); penalidades iguais ao Vigor destroem | Correto |
| Desorganizada que sofre dano debanda; dano acima do dobro da Saúde máxima destrói | Correto |
| Tabela 10-6 (Sobreviventes), com −1 por desorganização além da primeira | Correto |
| Tabela 10-5 (Glória) | Correto, como proposta ao Narrador |

Conclusão: o problema não estava nas regras, e sim em como elas chegavam a quem joga.

### Usabilidade (interface `BattleGotGame.tsx`)

1. Dar uma ordem exigia um formulário com todas as ordens do livro, alvo e destino em listas, sem indicar o que era legal naquele momento.
2. O jogador não via a chance de a tropa obedecer nem a chance de acertar: precisava conhecer o sistema para decidir.
3. O mapa era estático: a tropa "saltava" de um quadrado para outro, sem destaque de alcance, de alvos ou de dano.
4. O registro mostrava termos internos (`disorganized`, `attack`) em vez de linguagem de mesa.
5. Não havia adversário automático: uma pessoa sozinha precisava comandar os dois lados.
6. Montar exércitos de portes diferentes pedia edição manual, tropa a tropa.
7. O resultado da batalha era só uma projeção: lançar baixas e treinamento na ficha era trabalho manual do Narrador.

## 2. O que foi feito

### Comando tático em três passos (`BattleGotCommandBar.tsx`)

- Passo 1, escolher a tropa; passo 2, escolher a ordem; passo 3, clicar no mapa e confirmar.
- Só aparecem ordens que fazem sentido para a tropa naquele momento (uma tropa debandada só pode ser reanimada, por exemplo).
- Antes de confirmar, o painel mostra "A tropa obedece?" (Guerra contra Disciplina) e "Acerta o alvo?" (dados, Defesa, dano por grau, armadura e dano médio).
- Os dados rolados aparecem como dados, com o total contra a Dificuldade.
- Opção "Ordem em um clique" para quem já domina o sistema.
- O formulário completo, com todas as ordens avançadas do livro, continua disponível em "Ordens avançadas e fichas".

### Mapa vivo (`BattleGotBoard.tsx`, `battle-got-board.css`)

- Quadrados verdes mostram onde a tropa pode chegar; inimigos alcançáveis ficam em vermelho, com a chance de acerto sobre a peça.
- As peças deslizam até o destino, tremem ao receber dano e mostram o número do dano subindo.
- Barra de Saúde e marcador de condição em cada peça.
- Animações desligadas para quem usa "reduzir movimento" no sistema.

### Chances exatas, sem rolar dados (`odds.ts`, `command-preview.ts`)

- Cálculo exato da distribuição dos testes (dados de bônus e de penalidade incluídos).
- A prévia usa a mesma função do ataque real (`attackSetup` em `engine.ts`): o número mostrado é o número que será rolado. O ataque foi refatorado para ter essa fonte única, sem mudar resultados.

### Casas de portes diferentes (`force-builder.ts`)

- Na preparação, informe o Poder de cada Casa (ou escolha um porte: Casa menor 20, vassala 38, poderosa 55, Grande Casa 75).
- O simulador monta as tropas-modelo com os custos do livro (tipo + treinamento). Mais Poder rende mais unidades e melhor treino, e o comandante-modelo ganha mais Guerra.

### Adversário automático (`ai-commander.ts`)

- Pode controlar o Atacante ou o Defensor. Escolhe sempre ordens legais e passa pelas mesmas regras e testes de um comandante humano.

### Simulação e Convocação oficial (`convocation.ts`, `BattleGotConvocation.tsx`)

- Toda batalha começa marcada como "Simulação · não altera fichas".
- Só o Narrador vê a opção "Convocação oficial". Ao terminar uma batalha com unidades oficiais das Casas, ele confere a tabela (unidade, condição, d6, previsão de treinamento), marca a confirmação e lança o resultado.
- A gravação usa a operação `survivors` que a ficha da Casa já tinha (Tabela 10-6), validada no servidor como exclusiva do Narrador e registrada no histórico da Casa.
- Confirmar duas vezes não duplica baixas (chaves determinísticas por batalha e unidade).
- Glória, Terras, Riqueza, Lei e População continuam como proposta: o Narrador decide e lança na ficha.
- O modo do jogador não tem acesso a unidades oficiais nem à Convocação.

### Linguagem de mesa

- O registro passou a dizer "Condição: desorganizada" e "ordem Atacar" em vez dos identificadores internos.

## 3. Verificação

- 15 testes novos em `src/test/battle-got-command-ux-20261111.test.ts` (chances, prévia igual à resolução real, exército por Poder, convocação, adversário automático, determinismo).
- Os testes do motor que já existiam continuam passando.
- Contratos de interface dos testes existentes (preparação, salvar e retomar, mapa, modo do jogador) conferidos em navegador real.
- Batalhas completas jogadas de ponta a ponta em tela de computador e de celular, sem erros.

Limite da verificação local: o ambiente em que a mudança foi feita não tinha as dependências do projeto instaladas. A suíte completa, o TypeScript e o build de produção rodam no CI deste PR.

## 4. O que não mudou

- `BATTLE_PLAYERS_ENABLED` continua `false`: os jogadores ainda não veem o módulo. A liberação é uma decisão do Narrador.
- Nenhuma migração de banco, nenhuma mudança em RLS ou em funções do servidor.
- Modos Adaptado e D&D.

## 5. Próximos passos sugeridos

1. Testar uma Convocação oficial com uma Casa de teste antes de usar em sessão.
2. Escolher uma Casa real na preparação e trazer o Poder da ficha automaticamente.
3. Liberar o simulador aos jogadores (`BATTLE_PLAYERS_ENABLED`) depois de uma rodada de teste.
4. Batalha ao vivo, com o jogador comandando o próprio lado na Convocação (hoje o Narrador executa).

## 6. Segunda rodada (mesmo dia): batalha em poucos toques e identidade das Casas

Pedido: simplificar ao máximo o processo de ponta a ponta e dar a cada Casa a sua bandeira e as suas cores no mapa.

### Revisão do processo, antes e depois

| Etapa | Antes | Depois |
| --- | --- | --- |
| Preparar | Ler o resumo técnico, escolher o tipo de batalha, informar o Poder, clicar em "Montar exércitos", escolher o adversário e iniciar | Escolher as duas Casas e tocar em "Batalhar agora" |
| Dar uma ordem | Tropa, ordem, alvo e confirmar: quatro toques | Tocar no alvo: a tropa da vez já vem escolhida |
| Virar a rodada | Botão "Concluir rodada" | Automático, depois de uma pausa curta |
| Batalha inteira | Só jogando ordem a ordem | "Resolver automaticamente" (na preparação) ou "Resolver até o fim" (durante a batalha) |
| Ver o resultado | No fim da página, depois do mapa e das listas | No topo: bandeira do vencedor e o destino de cada tropa |

Uma batalha de 9 contra 5 unidades foi jogada inteira com 24 toques. Com "Resolver automaticamente", são 3 toques: duas Casas e o botão.

### O que mudou

- **Casas na preparação** (`house-banner.ts`): a lista vem do cadastro público do site (`public/cormyr/data.js`), agrupada por região. Só são lidos nome, região, cores, brasão e hierarquia. Nenhuma ficha é consultada.
- **Porte sugerido**: ao escolher a Casa, o Poder é preenchido pela hierarquia pública (Coroa 75, Casa regente 55, vassala direta 38, terceiro nível 20) e o exército é montado na hora. O Poder continua editável.
- **Bandeira e cores** (`BattleGotBanner.tsx`): o brasão da Casa vira uma flâmula. Cada peça no mapa leva a bandeirinha e veste as cores da Casa (fundo na cor principal, borda na secundária). As cores vêm do campo "cores" do cadastro; quando os dois lados ficariam parecidos, o defensor inverte as cores.
- **Nomes de mesa**: "Infantaria II de Phelles" em vez de "Reforço atacante 3".
- **Toque inteligente**: sem escolher ordem, inimigo em vermelho ataca (Luta se adjacente, Pontaria se alcança, Carga se não) e quadrado verde move. As outras ordens (Defender, Correr, Reagrupar, Retirada) ficam em uma linha de botões. Quem preferir ver as chances antes liga "Confirmar antes de executar" em Opções.
- **Resolução automática** (`autoResolveWarBattle`): o comando automático joga os dois lados, pelas mesmas regras e com os mesmos dados auditáveis. O resultado é reproduzível.
- **Tela enxuta**: cabeçalho com as duas Casas e a rodada; legenda, terreno, registro, salvamento e fichas completas ficam recolhidos; os exércitos ficam sob o mapa, lado a lado.
- **Convocação oficial**: virou uma única caixa de seleção para o Narrador na preparação.

### Verificação desta rodada

- 10 testes novos em `src/test/battle-got-house-banner-20261111.test.ts`: leitura das cores, cadastro público, contraste entre os lados, revalidação de bandeiras em salvamentos, nomes das tropas, resolução automática reproduzível e prova de que as bandeiras não alteram o resultado.
- Batalhas completas em computador e celular, com e sem Casas, com confirmação ligada e com resolução automática.

### Limites conhecidos

- O Poder sugerido é uma estimativa pela hierarquia pública, não o valor da ficha da Casa.
- Seis Casas não têm cores no cadastro (Obarskyr, Erdenor, Everlost, Silversky, Montgomery e Brightaxe): recebem um par de cores fixo, escolhido pelo nome. Basta preencher o campo "cores" no cadastro para corrigir.
- A Convocação oficial ainda usa o seletor de unidades oficiais dentro de "Personalizar", com quatro espaços.
