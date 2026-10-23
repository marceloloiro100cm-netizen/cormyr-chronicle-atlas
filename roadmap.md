# Roadmap

## Pedido atual
- [x] Imagens privadas em missivas e respostas de jogador/narrador
- [x] Filtros por número, tipo e resposta
- [x] Textos e imagens das oito pastas importados (60 arquivos), editáveis com versões e identificação de personagens explícitos
- [x] Atualizar ao lado de Sair; salvar/responder aciona sincronização autorizada, preservando pendências/erros
- [x] Testes isolados, importação e filtros verificados com jogador autenticado; celular sem overflow; nenhuma missiva de teste enviada
- [ ] Confirmar exportação real: o Drive não fornece ETag na leitura de retorno; bloqueada confirmação/atualização para não sobrescrever versões
- [ ] Concluir cópias privadas das respostas ao narrador: falta pasta privada do narrador autorizada

## Concluído nesta etapa
- [x] Missivas organizadas por número (Missiva 1, 2...), tipos Geral/Reservada
- [x] Jogador vê todas as suas missivas e respostas; responde (fica "Respondida") ou escreve nova ao narrador
- [x] Narrador envia geral para destinatários marcados ou reservada para um só; numeração automática editável
- [x] Missiva do jogador é privada (só autor e narrador leem); resposta do narrador assinada "Mestre"
- [x] Textos de casas e regiões justificados (Nobreza e Reino e Regiões)
- [x] 49 testes passando; suíte roda em sequência (testes de banco real interferiam em paralelo)

## Pendências anteriores
- Contas dos jogadores ainda não testadas individualmente; revisão Silverky/Hardcourt; senha própria do Narrador
- Numerador do site começa em 1: a Missiva 1 foi enviada fora do site, então o narrador deve digitar "2" no campo Número ao escrever a próxima (ou pedir ajuste)
