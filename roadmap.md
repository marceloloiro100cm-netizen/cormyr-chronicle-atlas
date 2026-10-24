# Roadmap

## Hub de casa nobre — 24/10 21:38 UTC
- [ ] Pedido22:29: vínculos vassalos aprovados pelo Narrador,brasões oficiais e referências a NPCs existentes sem duplicar personagens;testes isolados,sem publicação/casas reais.
- [x] Pedido22:22: cobertura dos cinco anexos e11 grupos de pendências no hub;busca/filtros conferidos com Narrador na prévia,sem alterar regras ou casas reais/publicação.
- [x] Pedido22:12: mistas com decisãoNarrador,montarias,evolução tabela10-6,cerco11 itens/operadores e propostas/aprovação de vassalos;82 testes e telas autenticadas sem escrita real/publicação.
- [ ] Extensões militares pendentes: campanha/recrutamento,prêmios acimaElite individuais,estado/dano de cerco,ciclos/lealdade/criação de vassalas — implementação parcial conforme matriz; fontes mistas e itens ilegíveis exigem decisão explícita.
- [x] Continuação22:02: requisitos/limites de assentamentos, melhorias,descontos conferidos,mercenários,equipamento,Sorte estruturada,PDF direto/Excel13 abas;65 testes e downloads autenticados,sem escrita real/publicação.
- [x] Conferir cinco fontes e imagens; 173 entradas de Prosperidade, catálogo básico adicional e matriz em docs/house-hub-coverage.md.
- [x] Motor central: sete recursos/alocações/permanentes, requisitos, tropas simples, projetos, calendário, Sorte básica e conversões6-19.
- [x] Persistência privada, validação transacional, versão/idempotência e auditoria; zero casas reais migradas.
- [x] Integrar em Ficha com navegação editorial, criação guiada, compra em três passos e fichas de personagem preservadas.
- [x] Prévia por contexto, #REF!Evenhand e Erdenor/Ashkar; snapshot legado somente por confirmação administrativa.
- [x] Exportação Excel/PDF por impressão e edição administrativa de custos/descrições/itens personalizados.
- [x] 47 testes isolados; tela autenticada, teclado e celular390px sem cortes; nenhuma publicação.
- [ ] Concluir automação de todos efeitos, descontos, stacking e limites de Prosperidade — campos corrompidos/ambíguos precisam de conciliação; requisitos conhecidos ainda têm implementação parcial (matriz detalhada).
- [ ] Completar criação mecânica/história, unidades mistas, montarias, evolução, cerco, vassalos e projetos personalizados — implementação ainda parcial; mercenários com custos conferidos concluídos.
- [ ] Integrar exportação estruturada Drive/conciliação externa e representação — implementação não concluída; PDF direto concluído, sincronização anterior preservada.
- [ ] Validar gravação/leitura e concorrência no banco isolado — banco atual compartilhado com produção; não usar casas reais como teste.

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

## Pedido de 24/10 18:17 UTC
- [x] Contador de missivas não lidas na aba Missivas (visível sem abrir a lista;Narrador vê 3)
- [x] Lista de números (Missiva 1 · Missiva 2) na lateral das missivas com salto direto a cada grupo
- [x] Correção: resposta guarda a semana em que foi escrita (cabeçalho) sem perder a semana agendada de entrega

## Pedido de 24/10 18:22 UTC
- [x] Painel exclusivo do Narrador com casas que receberam mensagens na rodada aberta e ainda têm respostas pendentes; 31 testes de missivas passaram, sem enviar mensagens reais
- [ ] Conferir novo painel na conta do Narrador — entrada automatizada não alcançou o conselho; precisa de sessão na prévia

## Pedido de 24/10 18:26 UTC
- [x] Imagens das fichas das casas pequenas no canto; verificado 84×110 no computador e 60×80 no celular, ampliação funcionando
- [x] Redefinir senha apenas da conta confirmada do Narrador conforme pedido de 18:27 UTC; entrada validada, jogadores e permissões preservados
