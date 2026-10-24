# Cormyr — semanas, gestão e acervo

## Objetivo
Implementar os 18 grupos de alterações do arquivo enviado, preservando o acervo real, contas, permissões, arquivos, versões e histórico. Não publicar nesta etapa.

O destaque de Phelles como **Royal House**, com moldura dourada, já foi aplicado e verificado na prévia. As demais alterações abaixo ainda precisam ser implementadas e validadas.

## 1. Preservação e inventário
- Inventariar semanas, mensagens, respostas, destinatários, leituras, versões, imagens, contas e apontamentos de sincronização.
- Criar cópia de segurança privada dos dados e apontamentos afetados antes de qualquer migração.
- Registrar o estado real das semanas e preservar mensagens já entregues; nenhuma importação reabre uma semana.
- Conferir diretórios oficiais e permissões existentes antes de ler novas fontes ou mover arquivos.

## 2. Semanas e conversas protegidas
- Tratar Missiva N como **Semana N**, com estados Preparada, Aberta e Encerrada, e somente uma aberta.
- Separar salvar rascunho, programar entrega, abrir semana e encerrar semana. Remover a abertura automática existente no envio do narrador.
- Preservar identificadores e relações existentes; acrescentar conversa, mensagem respondida, semana de criação, semana de entrega, publicação e datas fictícias separadas das datas reais.
- Aplicar as regras pela semana atual de participação:
  - Nova mensagem de jogador: semana aberta; narrador lê imediatamente quando for o destinatário.
  - Jogador respondendo ao narrador: semana atual.
  - Narrador respondendo ao jogador: próxima semana.
  - Jogador respondendo a outro jogador: próxima semana.
- Antes do envio, mostrar a semana de entrega. Sem semana aberta, jogadores podem salvar rascunhos e consultar histórico, mas não concluir envios.
- A abertura apresenta prévia de mensagens e destinatários, encerra a anterior, libera uma vez e registra narrador/data. Encerramento não oculta conteúdo entregue.
- Garantir sigilo futuro no banco, consultas, respostas, versões, imagens, MCP, atualizações em tempo real, contadores e Drive. Autor vê seus programados; narrador vê tudo. Demais destinatários não veem nem a existência de mensagens futuras.
- Manter respostas privadas a gerais restritas aos participantes autorizados.

## 3. Gestão de missivas
- Caixas Recebidas, Enviadas, Programadas, Rascunhos e Histórico por semana.
- Manter cartões recolhíveis e filtros laterais; acrescentar semana, casa, remetente, destinatário, tipo, leitura, publicação e resposta, com Limpar filtros.
- Distinguir resposta preparada e entregue sem revelar futuras ao destinatário.
- Preservar edição versionada, exclusão autorizada, imagens e continuidade das conversas.

## 4. Contas e administração
- Remover e-mails pessoais e listas fixas do acesso público; seleção de casa não autentica nem autoriza recuperação.
- Completar recuperação e alteração de senha com confirmação, inclusive definição de senha por quem usa provedor externo.
- Cadastro administrativo cria ou vincula conta, casa, permissões e pasta individual, com tratamento de e-mail existente, repetição e falha parcial.
- Inativação bloqueia a campanha também em sessões já abertas, preservando dados; reativação restaura apenas vínculos autorizados. Casa continua no catálogo público.
- Narrador pode redefinir senha sem ver a anterior, com auditoria sem senha e opção de troca obrigatória.
- **Acessar como jogador** usa representação administrativa autorizada no servidor, faixa persistente e Voltar ao narrador. Ações registram o narrador real; não simulam leituras do jogador.
- Para a senha solicitada do narrador, conferir a identidade da conta e usar somente o provedor seguro. Se recusada, preservar o acesso e informar a pendência; nunca reduzir a política global.

## 5. Catálogo e apresentação das casas
- Centralizar as 172 casas reais e futuras importações em catálogo com IDs estáveis e busca sem distinção de caixa/acentuação.
- Derivar identificação de jogador ativo dos vínculos autorizados, sem conceder acesso pela presença no catálogo.
- Aplicar em Reino e Regiões, Nobreza e listagens equivalentes:
  1. Phelles: dourada, Royal House.
  2. Casa com jogador ativo: vermelha, Casa de Jogador.
  3. Major House: prateada, Major House.
  4. Outras: borda padrão.
- Preservar todas as identificações quando se acumulam; atualizar ao ativar/inativar jogadores.
- Mover Todas as casas, Visão Hierárquica e Baixar casas da Região abaixo do mapa, imediatamente antes da listagem, sem duplicação. Seletor continua no topo; download do mapa junto ao mapa.
- Ocultar apenas campos/blocos editoriais públicos, mantendo rastreabilidade interna e narrativa legítima. Usar Suserano como rótulo direto.

## 6. Atualização e imagens
- Botão Atualizar no topo, exclusivo do narrador autenticado, executando atualização real nos diretórios oficiais autorizados.
- Descobrir novas pastas por IDs estáveis e verificação periódica compatível com a integração atual; renomear não duplica.
- Atualizar textos e imagens públicas revisadas, sem substituir brasões oficiais ou campos cadastrais com informação conflitante.
- Preservar alterações locais e remotas em conflitos; falhas não apagam conteúdo. Mostrar andamento, totais e falhas reais.
- Galeria ao final de cada casa com imagens públicas oficiais, nome do arquivo, proporção preservada, ampliação e download da imagem original.
- Visualizador compartilhado para imagens de conteúdo, com fechar, Escape, teclado, foco restaurado, zoom/deslocamento e celular. Imagem amplia; nome/consulta abre a casa, sem ações simultâneas.
- Manter imagens privadas e downloads sujeitos às mesmas permissões.

## 7. Organização da área dos jogadores
- Casa e Personagens mostra somente narrativa e edição autorizada, sem galerias, imagens ou fichas duplicadas.
- Fichas e mecânica permanecem em Ficha; nenhum documento ou imagem é apagado.
- Corrigir a interpretação de Eventos Históricos para excluir Bonus/Bônus e variações, preservando valores e efeitos mecânicos.

## 8. Goldfin e organização técnica do Drive
- Comparar o documento indicado com os registros existentes de Goldfin e importar somente as nove mensagens ausentes da Semana 1, com textos, assinaturas, destinatários, tipos e datas fictícias intactos.
- Preservar Semana 2, especialmente O Cavaleiro Bandido e Carta da casa Grantass. Não inventar respostas/leituras nem notificar como novidade.
- Registrar Erene/Mira em O Dízimo do Faminto para revisão, sem alterar a fonte.
- Criar/reutilizar Gestão do Site - Não Mexer nas pastas individuais. Mover somente arquivos técnicos confirmados por conteúdo, ID e vínculo, mantendo IDs e permissões.
- Separar pasta principal e técnica nos apontamentos; coordenar filas e executor para evitar recriação na pasta antiga. Operação repetível e automática para novos jogadores com pasta configurada.
- Não usar a subpasta técnica como garantia de privacidade para segredos.

## Detalhes técnicos
- Manter o acervo estático original e a extensão autenticada TanStack existentes, sem reescrever o site.
- Usar mudanças aditivas no banco, com permissões explícitas, RLS e operações transacionais auditadas. Preservar os leitores/fluxos atuais enquanto os novos campos são incorporados.
- Centralizar autorização de mensagem/resposta entregue e participação ativa; aplicar a mesma decisão às integrações e anexos.
- Representação administrativa não troca a identidade autenticada nem cria sessão do jogador; opera com autorização server-side e identidade dupla auditada.
- Reutilizar executor, versões, filas e conexão de Drive existentes; não ampliar busca para todo o Drive ou aprovar automaticamente fontes privadas.
- Não alterar arquivos gerados de integração, não registrar senhas e não realizar testes de mensagens com destinatários reais.

## Validação e entrega
- Testes isolados de todas as regras de semana, ausência de abertura automática, histórico encerrado, idempotência e sigilo em cada canal.
- Testes de cadastro, duplicidade, inativação, reativação, representação e auditoria; redefinições reais só na conta correta e pelo mecanismo permitido.
- Testes de classificação, interpretação das fichas, importação Goldfin e migração técnica com repetição sem duplicatas.
- Verificação dos fluxos autenticados e da apresentação em computador/celular, incluindo filtros, galerias, zoom e downloads.
- Distinguir código implementado/testado de operações reais no Drive e configuração disponível. Informar precisamente qualquer fonte, permissão ou capacidade externa que impeça conclusão.
- Publicação somente após pedido explícito do proprietário.