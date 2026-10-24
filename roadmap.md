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

## Pedido integral de 24/10 (arquivo enviado)
- [x] Phelles como Royal House com moldura dourada (prévia verificada)
- [ ] Inventário e cópia de segurança dos dados e apontamentos afetados
- [ ] Semanas explícitas preparada/aberta/encerrada; conversas, rascunhos e entregas programadas sem abertura automática
- [ ] Sigilo de entregas futuras no banco, imagens, MCP, realtime e Drive
- [ ] Caixas e filtros de missivas; prévia da semana de entrega e confirmação de abertura
- [ ] Recuperação/alteração de senha e administração segura de contas; acesso como jogador auditado
- [ ] Cadastro, inativação/reativação e catálogo central dinâmico sem e-mails públicos
- [ ] Classificações e bordas por dados em todas as listagens
- [ ] Atualização administrativa e descoberta autorizada no Drive; conflitos e resultados honestos
- [ ] Controles regionais abaixo do mapa; remover somente notas editoriais públicas
- [ ] Galerias e visualizador acessível com zoom, downloads e permissões
- [ ] Casa e Personagens somente narrativa; remover Bonus/Bônus de Eventos Históricos sem apagar mecânica
- [ ] Histórico de Goldfin da fonte indicada, sem duplicatas, leituras inventadas ou reabertura
- [ ] Subpastas técnicas Gestão do Site - Não Mexer com migração idempotente e vínculos preservados
- [ ] Testes isolados, fluxos autenticados e verificação em computador/celular; informar bloqueios reais
