# Roadmap

## Pedido atual
- [x] Concluir gravação versionada de edições, uploads e respostas nas oito pastas autorizadas; 60 registros, 44 missivas e 28 respostas confirmados por leitura de retorno
- [x] Criar e verificar pasta privada do Narrador, sem compartilhamento e com cópias privadas confirmadas
- [x] Unificar Missivas e Escrever missivas em gestão com edição versionada, filtros por casa/leitura/resposta e destinatários somente casas
- [x] Validar 50 testes e fluxo autenticado do Narrador, sem enviar missivas de teste a jogadores; celular sem overflow
- [x] Imagens privadas em missivas e respostas de jogador/narrador
- [x] Filtros por número, tipo e resposta
- [x] Textos e imagens das oito pastas importados (60 arquivos), editáveis com versões e identificação de personagens explícitos
- [x] Atualizar ao lado de Sair; salvar/responder aciona sincronização autorizada, preservando pendências/erros
- [x] Testes isolados, importação e filtros verificados com jogador autenticado; celular sem overflow; nenhuma missiva de teste enviada
- [x] Confirmar exportação real: ausência de ETag usa cópias imutáveis com hash, sem sobrescrever documentos originais
- [x] Concluir cópias privadas das respostas ao Narrador

## Concluído nesta etapa
- [x] Missivas organizadas por número (Missiva 1, 2...), tipos Geral/Reservada
- [x] Jogador vê todas as suas missivas e respostas; responde (fica "Respondida") ou escreve nova ao narrador
- [x] Narrador envia geral para destinatários marcados ou reservada para um só; numeração automática editável
- [x] Missiva do jogador é privada (só autor e narrador leem); resposta do narrador assinada "Mestre"
- [x] Textos de casas e regiões justificados (Nobreza e Reino e Regiões)
- [x] 49 testes passando; suíte roda em sequência (testes de banco real interferiam em paralelo)

## Verificação da gravação no Drive (23/10 22:18 UTC)
- [x] 199 arquivos confirmados nas pastas (file_id + etag + hash); 132 itens da fila todos "synced"
- [x] Pasta de Ashkar conferida diretamente no Drive: registros, missivas e imagens presentes
- [x] Nenhum registro, missiva ou resposta mais novo que a última sincronização

## Ajustes de 23/10 (22:30 UTC)
- [x] Grafias oficiais corrigidas: Silversky e Harcourt (casas, jogadores, missivas, pastas e vínculos em cascata; acervo vinculado com brasão e castelo)
- [x] Documento principal ASHKAR (7.719 caracteres) confirmado importado na aba da casa
- [x] Textos internos das casas na aba Nobreza justificados (história, ficha e campos)
- [x] 65 testes passando; verificado no navegador

## Novos pedidos (23/10 22:41 UTC)
- [x] Remover todos os links para pastas/arquivos do Drive do site público (1.130 campos removidos do acervo, 170 histórias limpas, rodapé e fichas sem links; verificado: 0 links no navegador)
- [x] Aba "Ficha" na casa do jogador: ficha da casa (7 atributos em barras, eventos históricos), ficha do lorde (retrato, habilidades com graduação em pontos, selos de intriga/compostura/movimento), NPCs e retratos; edição com versões preservadas
- [x] Integração MCP para ChatGPT (OAuth protegido): 7 ferramentas (casas, documentos, missivas), tela de autorização, manifesto gerado; falta republicar para o ChatGPT alcançar
- [x] Área do Narrador com menu lateral à esquerda contendo Eventos (200, com filtros e Limpar filtros) e Aventuras (3)
- [x] Botão "Limpar filtros" em todos os filtros (missivas do jogador era o único que faltava; Reino padronizado)
- [x] Textos de 26 casas importados das pastas do Drive; Obarskyr (pasta vazia) e Battlestar (sem pasta) seguem sem texto

## Pendências anteriores
- Contas dos jogadores ainda não testadas individualmente; senha própria do Narrador (proprietário optou por manter "cormyr")
- Entrega automática do executor atualizado será verificada após publicação

## Missivas v3 (23/10 23:08 UTC)
- [x] Borda vinho nas casas de jogador (Reino e Regiões)
- [x] Cartões de missiva recolhíveis com setinha, expandir/recolher todas, busca
- [x] Excluir missiva (remetente ou Narrador; Narrador consulta "Excluídas")
- [x] Jogador escreve para outras casas e encaminha; Narrador sempre vê
- [x] Filtros laterais fixos
- [x] Abrir/fechar rodada de missiva; jogador vê "Missivas fechadas, aguarde..."

## Implementação de 24/10
- [x] Inventário privado anterior às mudanças; Semana 1 encerrada e Semana 2 aberta preservadas
- [x] Entregas por semana, sigilo no banco/imagens/Drive, rascunhos e programação separados; abertura somente pelo Narrador
- [x] Contas: recuperação, alteração, redefinição administrativa auditada, cadastro transacional, inativação e seletor sem e-mails
- [x] Catálogo com 172 casas; classificação e prioridade de bordas; controles abaixo do mapa; notas editoriais públicas removidas
- [x] 170 pastas oficiais associadas; atualização administrativa e periódica de textos/imagens públicas, conflitos preservados
- [x] Galerias, download e ampliação acessível em imagens públicas e privadas
- [x] Casa e Personagens somente narrativo; Bonus fora de Eventos Históricos
- [x] Goldfin: nove mensagens da Semana 1 importadas sem respostas, leituras ou reabertura
- [x] Organização técnica em subpasta com confirmação de vínculo e destino (aguarda acionamento pelo Narrador)
- [x] Acessar como jogador: sessão administrativa auditada, faixa persistente, retorno ao Narrador, escopo do jogador e bloqueio de respostas futuras testados
- [ ] Validar conselho na conta real do Narrador — sessão do proprietário não disponível; exige login na prévia
- [ ] Executar organização das pastas técnicas reais — código disponível, ainda não acionado; preservação dos documentos originais exige validação da operação
- [ ] Completar atualização das 170 galerias — primeira execução real verificou oito casas e importou 32 imagens; restante via Atualizar/periódico
- [ ] Validar callback periódico publicado — esta revisão não foi publicada
- [ ] Descoberta de pastas novas fora dos 170 IDs oficiais — nenhum diretório-pai oficial foi identificado
- [ ] Senha própria do Narrador — não alterada sem confirmação da conta correta
- [x] Corrigida visibilidade das respostas do Narrador (15 respostas de Ashkar, Grantass e Fewmerry reendereçadas aos jogadores; leitura ampliada para membros da casa)
- [ ] Concluir galerias das 170 casas — 80 importadas em 24/10; restante segue pela rotina automática horária
- [x] Missivas: resposta nova marca a missiva como não lida (gatilho no banco + limpeza dos registros antigos); respostas exibem cabeçalho "Missiva N · Resposta"; status mostra "Respondida · Não lida"; botão "Ver fio completo" abre toda a conversa entre semanas; 90 testes passando (24/10)
