# Cormyr Chronicle Atlas — Espionagem R5, Lote 2
## Relatório de implementação e aceite de UX do jogador (09/11/2026)

**Base:** R5 Lote 1 (PR #355), sobre R4 (PR #354).  
**Status:** implementado em branch isolada, **não publicado**.  
**Foco:** reduzir número de decisões, textos e toques, sem alterar cálculos, autorizações, dados ou o HUB.

### Correções implementadas

**Criação de agentes**
- Formulário mantém somente nome, Rede de origem, galeria de retratos e melhorias.
- Um resumo curto informa as vagas da Casa; a seleção da Rede mostra vagas por origem. Foram eliminados parágrafos e uma lista redundante de capacidade.
- As melhorias opcionais e seus custos ficam em seção recolhida inicialmente, podendo ser aberta a qualquer momento. Continuam selecionáveis e debitadas pela mesma transação atômica do Lote 1.
- Formulário bloqueado enquanto cria, com chave de idempotência preservada se a rede falhar.

**Planejamento em três passos**
1. **Espião:** selecionar agente disponível; a localização homologada preenche a região de partida.
2. **Destino:** selecionar a região e, logo abaixo, a Casa nobre homologada da região.
3. **Missão:** selecionar diretamente Recursos da Casa, Exército ou Posses (fora da confirmação).

- Foco visual no passo ativo; seleção de agente/região/Casa/objetivo remove comprovante antigo da tela.
- O mapa fica recolhido como recurso opcional, sem alterar rota nem permitir missões impossíveis.
- Instrução de trajeto corrigida: iniciar uma missão fora da região **inicia a viagem real**; não se confunde planejamento com teletransporte.

**Confirmação compacta**
- Antes do botão: espião, Casa-alvo, objetivo, quantidade de désdias e conclusão estimada com base **exclusiva** na prévia oficial do HUB.
- Na confirmação: apenas dados da ordem e datas oficiais. Não existe segunda escolha de objetivo nem campos de dificuldade/atributos técnicos.
- Se a data oficial mudar, a checagem imediata da versão do HUB (R4/R5 Lote 1) impede submissão obsoleta.
- Sem calendário ou rota homologada, a interface não inventa datas, nem duração.

**Andamento da missão**
- A ficha mostra Viagem → Investigação → Narrador → Concluída.
- Após a resolução, mantém na ficha um resumo da última missão concluída, sem chamar fracasso de sucesso; detalhes ficam no histórico.
- Exibe próximo passo e data prevista de conclusão em destaque; datas detalhadas e histórico seguem recolhidos.
- Quando a ficha não carrega, oferece botão **Tentar novamente**.

**Mobile e acessibilidade**
- Três passos empilhados em telas de até 680 px; em telas de até 360 px, controles e confirmação usam coluna única.
- Inputs legíveis (16 px) e áreas de toque de pelo menos 48 px; foco visível, textos longos quebrados e sem colunas apertadas.
- A faixa de quatro etapas vira grade 2 × 2 em celulares pequenos, sem rolagem horizontal.
- A escolha de retrato, a vaga e as compras continuam protegidas por regras existentes.

### Testes e evidências

- Testes puros das etapas da jornada e da duração **0 viagem → 1 désdia / 2 viagens → 3 désdias**.
- Sem rota do banco: prazo `null` em vez de um valor calculado arbitrariamente.
- Testes estruturais de campos, ordem dos passos, resumo, seleção do objetivo, controle de comprovante e CSS responsivo.
- Testes preexistentes da estrutura anterior foram atualizados **somente onde a expectativa representava a interface antiga**. A validação SQL de criação, missão, dossiê e regras permanece intacta.
- CI dedicado, TypeScript, build e suíte geral exigidos para liberação.

### Aceite real do Lote 2 — pendente

O alvo de **90% das tarefas concluídas sem ajuda** precisa de teste com pessoas em homologação. Isso não pode ser substituído por testes de fonte ou por uma nota presumida.

Cenários de aceite com pelo menos duas Casas e um narrador:
1. Jogador cria um espião com a Rede e o retrato, sem ajuda.
2. Seleciona destino e objetivo e encontra o botão **Iniciar missão** sem procurar por outros painéis.
3. Consegue identificar o prazo e a próxima etapa da missão.
4. Troca de objetivo antes de enviar e confirma que só uma modalidade foi registrada.
5. O narrador publica uma désdia no HUB; a ficha atualiza, mas o jogador não acessa a resolução administrativa.
6. Repetir em desktop, Android e viewport de 320/375 px, incluindo perda de rede e retorno.
7. Medir quantidade de toques, erros, conclusão sem ajuda, tempo e acessibilidade básica.

**Sem deploy em produção:** este Lote 2 deve ser integrado depois da R4 e R5 Lote 1, e homologado antes da publicação.
