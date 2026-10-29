# Missivas: destinatários, vínculos, consulta e análise

## Fluxo disponível
- Jogador ou Narrador seleciona até 50 destinos. Há jogadores individuais, casas inteiras e (para jogadores) Narrador.
- As seleções repetidas são deduplicadas no servidor. Selecionar uma casa inteira e um integrante cria entregas distintas; para contato individual, selecione somente o jogador.
- O envio é atômico. Um destinatário inválido impede todo o lote. Repetir a mesma chave e conteúdo retorna as entregas existentes.
- Cada destino recebe uma missiva com conversa própria. Respostas de um destinatário não são reveladas aos demais. O autor acompanha cada entrega; o Narrador conserva seu acesso administrativo.
- Jogadores usam a semana aberta; o Narrador escolhe a semana de entrega. Rascunhos podem ser salvos sem semana aberta.

## Corte e exército
Casa remetente identifica a origem autorizada. Membro da corte e unidade militar são opcionais e vêm da ficha real. Não há criação de cadastros fictícios para preencher seletores.
- Corte: integrante existente e sua responsabilidade como Executor ou Destinatário da ordem.
- Unidade: unidade existente e não destruída.
- Se não houver cadastro, a interface orienta e abre a ficha da casa. O texto e as imagens selecionadas permanecem na memória da sessão ao trocar de aba.
- Os vínculos podem ser alterados na edição do rascunho. A publicação revalida o acesso e a existência dos registros.
- O vínculo não movimenta exércitos, gasta recursos ou executa a ordem.
- Os identificadores e a versão da ficha ficam preservados nas missivas enviadas. Nomes e fichas privadas não são copiados para leitores externos. Quem não tem acesso, ou consulta um vínculo removido, vê a identificação histórica/restrita.

## Filtros e desempenho
Filtros combináveis por corte, unidade, origem, destino/legado, semana, situação, leitura, resposta e texto. Os vínculos oferecem Todos, Sem vínculo e itens específicos, incluindo referências históricas visíveis.
A busca inclui o texto das respostas autorizadas. A semana inclui respostas entregues naquela semana, mesmo que a mensagem inicial seja antiga.
O servidor pagina o conteúdo em grupos de 20 conversas (limite de API: 50). O painel conserva somente cabeçalhos para contadores e pendências, buscados em lotes estáveis para evitar truncamento. O conteúdo integral é carregado apenas para a página consultada. Os cabeçalhos ainda crescem com o histórico; uma futura substituição por agregados no servidor pode reduzir esse custo adicional.

## Análise
A seção Análise por casa e responsáveis agrupa os vínculos e apresenta mensagens, entregas, entregues, respondidas e pendências de resposta. O botão Ver missivas aplica os filtros do grupo.
Uma mensagem para três jogadores representa uma mensagem e três entregas. As contagens se limitam ao que o usuário pode ler.
A análise mede comunicação, não conclusão da ordem. Novas áreas (economia, diplomacia, domínios), resultados operacionais e análise narrativa automática não foram inferidos nem adicionados como fatos.

## Integrações
- Drive: envelopes preservam IDs de corte/unidade, casa de origem, responsabilidade, versão da ficha e semana. O parser continua aceitando envelopes antigos, cuja forma canônica não muda. Nenhum nome privado ou ficha completa é incluído nos novos metadados.
- MCP: opcoes_missivas retorna os cadastros autorizados; escrever_missiva usa o mesmo envio transacional; listar_missivas oferece filtros e paginação; responder_missiva aceita resposta específica. Escrita e resposta exigem chave_envio estável para tentativas repetidas. Clientes MCP precisam atualizar seus argumentos.

## Implantação
Aplicar as migrações existentes até 0036 e depois `drizzle/migrations/0037_mail_recipients_and_assignments.sql` no banco do ambiente antes de publicar o frontend/servidor correspondente. O commit no GitHub não confirma a execução de SQL na hospedagem.
A migração é aditiva: preserva IDs, mensagens, histórico, fichas e semana aberta. Não cria nem movimenta unidades. Não faz preenchimento fictício dos novos campos em mensagens antigas.
Verificar com contas de teste: dois destinatários, resposta privada, leitura individual, filtro combinado, casa sem cadastros, rascunho com unidade removida e uma exportação aprovada de teste.
Testes automáticos executam em PostgreSQL descartável, sem credenciais de produção. Não usar testes que alteram rodadas globais na base real.
