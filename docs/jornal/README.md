# Jornal de Cormyr

## Acesso
- **Narrador** (perfil `narrador`) e **Leonardo** (perfil `editor`, conta ativa, sem troca obrigatória de senha pendente): podem criar, editar, publicar, cancelar e arquivar todas as edições.
- **Jogadores ativos** (perfil `jogador` com vínculo real à sua Casa): consultam exclusivamente edições publicadas/arquivadas. A abertura confirma a leitura pelo servidor; novas revisões incrementam a versão e voltam a ficar não lidas.
- Controles da interface são ilustrativos. A autorização verdadeira reside em `campaign_access_profiles`, `current_campaign_profile()` e nas políticas RLS do PostgreSQL. Editor-Chefe não é uma Casa.

## Experiência
- Acesse **Jornal** no menu do Narrador ou na barra dos jogadores.
- **Nova edição** usa a data oficial do HUB Temporal como referência, editável pelo calendário Harptos.
- Selecione um dos modelos de capa e a tipografia antiga. Clique num bloco para ajustar texto/legenda; adicione manchete, reportagem, fotografia ou destaque.
- Puxe a alça **↘** de um bloco para alterar o espaço que ocupa. Há controles alternativos de largura/altura e setas de subir/descer.
- Anexe um PDF (ou uma imagem JPG/PNG/WebP). O PDF é exibido em um visualizador ajustado à largura, com opção de tela cheia; se o jornal ainda estiver com conteúdo de exemplo, esse conteúdo é removido automaticamente. **Não há OCR nem reconstrução do texto interno do PDF**: o documento mantém sua paginação original.
- **Salvar** mantém o rascunho; **Publicar** torna a edição visível e gera indicação de não lida. **Arquivar** preserva a leitura histórica. **Cancelar envio** oculta a edição dos jogadores mas guarda o registro editorial.
- Uma edição alterada após a publicação deve ser salva/republicada e volta a aparecer como não lida. As versões anteriores permanecem no banco de auditoria.

## Implantação segura
1. Confirmar backup/restauração recente do banco Supabase de produção e conferir os vínculos reais de Leonardo; não incluir credenciais no Git.
2. Aplicar, nesta ordem, `drizzle/migrations/0111_campaign_newspaper.sql` e `drizzle/migrations/0116_campaign_three_access_profiles.sql` no **Supabase de homologação** e inspecionar RLS, bucket privado e RPCs. O commit GitHub **não aplica automaticamente** SQL no Supabase.
3. Executar CI (Vitest/TypeScript/build/PostgreSQL descartável) e teste manual com três contas: Narrador, Leonardo e jogador comum.
4. Repetir ambas as migrações validadas em produção com backup e janela de retorno, depois mesclar a branch e liberar via publicação GitHub existente. **Não usar Lovable nem Vercel para publicar**.
5. Validar edição, carregamento privado de imagem/PDF, confirmação de leitura, cancelamento, arquivamento e acesso em celular.

## Limites atuais
- Até 15 MB por arquivo, 80 blocos por edição e 300 edições no carregamento inicial.
- Indicadores da caixa de entrada são atualizados a cada 30 segundos (não há push de notificações do navegador).
- O leitor de PDF depende do visualizador PDF do navegador; no celular há um link para abrir em tela cheia.
- Se a migração ainda não foi instalada, a interface retorna um erro explícito em vez de exibir dados de outro módulo.


## Identidade de Leonardo: A Folha Sem Selo
- Referência aprovada em 11/11/2026: redação editorial com cabeçalho vinho e dourado, pergaminho envelhecido, menu lateral e ferramentas à direita.
- Leonardo entra diretamente na tela **Editor-Chefe** ao abrir `/jogadores`, antes do carregamento de Casas. **Não existe atalho para outros módulos**, ficha, Missivas ou simulador de batalhas.
- Menu lateral: Painel do Jornal, Edição da Capa, Matérias, Pautas, Correspondentes, Anúncios, Arquivo, Leitura e Alcance, Configurações.
- Ações centrais: Escrever Matéria, Anexar Arquivo, Pré-visualizar, Publicar Edição, Arquivar.
- Ferramentas: Título, Subtítulo, Imagem, Coluna, Citação e Aviso/Destaque. O painel exibe texto/legenda, alças de redimensionamento e botões para ordenar os blocos.
- Pautas usam os rascunhos das edições; Anúncios usam os blocos de destaque. **Correspondentes é apenas a entrada visual para um módulo futuro**, sem simular cadastros ou permissões inexistentes.
- Quando não houver edição, a capa de exemplo é identificada como **não publicada**. Nenhuma notícia de exemplo é enviada automaticamente.
- A versão real mantém as manchetes e imagens salvas, com capa compacta para não repetir o nome da Folha no topo e no miolo.
- As mudanças permanecem isoladas no tema `.folha-editorial`; leitores e o Narrador continuam usando o fluxo de jornal integrado às suas áreas existentes.


## Três perfis de autenticação (11/11/2026)
- **Jogador**: login e acesso à sua Casa e módulos autorizados, com jornal somente para leitura.
- **Editor-Chefe**: Leonardo acessa A Folha Sem Selo, sem Casa, Ficha, Missivas, Documentos ou Batalhas; sem poder do Narrador.
- **Narrador**: mantém controle integral da campanha e do Jornal.
- A migração 0116 desvincula com segurança o antigo `espiao` de Leonardo, preservando a conta de autenticação e o histórico armazenado. O registro legado da falsa casa não é apresentado como Casa da campanha.
- O formulário administrativo `Gerenciar acesso editorial` cria ou corrige a conta via função de servidor, sem vinculá-la a nenhuma Casa e sem armazenar senhas no código.
- **Não mesclar esta PR sem aplicar e validar ambas as migrações no Supabase.** Atualizar apenas o front-end deixa o novo resolver de perfis indisponível e impede o login seguro.


## Notícias contratadas (11/11/2026, migração 0117)
- **Jogador**: na aba Jornal, "Contratar notícia" (1 de Riqueza permanente). Escreve título e texto e anexa uma imagem opcional (PNG, JPG ou WebP, até 5 MB).
- **Editor-Chefe**: em Anúncios vê os pedidos pendentes, insere na edição em rascunho, edita o texto na folha e publica. Ao publicar, o pedido sai das pendências automaticamente (gatilho `settle_newspaper_commissions`).
- Implantação: aplicar `drizzle/migrations/0117_newspaper_commissions.sql` depois de 0111 e 0116 (homologação primeiro). Sem a migração, o formulário do jogador fica oculto.
- Análise comparativa com o modelo: `analise-modelo-gazeta-vs-folha-sem-selo-2026-11-11.md`.
- Login: o perfil do Editor-Chefe aparece como "A Folha Sem Selo".
- **Recusar pedido**: em Anúncios, o Editor-Chefe escreve uma nota obrigatória e recusa. A Riqueza (1) é devolvida com lançamento no livro-caixa e a Casa vê a nota no Jornal.
- **Excluir rascunho**: apenas rascunhos (RPC `delete_campaign_newspaper_draft`). As revisões do rascunho são apagadas; pedidos que estavam nele voltam às pendências. O número da edição excluída não é reutilizado (coluna de identidade).
- **Facilidades do modelo da Gazeta**: botões de largura (1/4, 1/3, 1/2, 2/3, Total), bloco Subtítulo, seletor de edições e "Próxima edição" no topo, "Descartar alterações" com aviso ao fechar a página, setas subir/descer em cada bloco e brasão do reino (dragão púrpura) no título da folha e brasão do jornal na Redação.

- **Seis facilidades extras**: acervo de gravuras, nome e lema editáveis na folha, histórico de revisões com restauração (Arquivo), salvamento automático de rascunhos, aviso ao jogador (contador no Jornal e botão Entendi) e limite de 3 pedidos pendentes por Casa. Mesma migração 0117.

## Ajustes de 11/11/2026 (noite, migração 0118)
- **Configurações**: ao trocar Modelo ou Fonte, uma pré-visualização da página aparece ao lado.
- **Folio**: o cabeçalho mostra somente "Edição Nº X" (o ano já está na data).
- **Calendário** (antes Pautas): mês de Harptos com eventos públicos (festas, estações e eventos publicados pelo Narrador; nunca missivas). "Escrever sobre a data" cria a matéria "Dia de X" já preenchida.
- **Anúncios**: bolinha vermelha com o número de pedidos pendentes no menu.
- **Painel do Jornal**: mostra sempre a última edição publicada; vazio enquanto nada foi publicado. A escrita fica em **Escrever o Jornal** (antes Edição da Capa).
- **Redação** (antes Correspondentes): corpo de funcionários com foto, nome, especialidade e texto livres (tabela `campaign_newspaper_staff`, migração 0118, só Editor-Chefe e Narrador). A assinatura da matéria é uma caixa de seleção com "Nome, Cargo" desses funcionários.

## Modelos, lixeira e selo do aviso (11/11/2026, migração 0119)
- **Selo do aviso**: fileira de botões lado a lado; um clique troca o símbolo.
- **Arquivo**: lixeira em cada edição. A exclusão apaga a edição (leituras e revisões junto) e o número fica livre: a próxima edição recebe o menor número ainda não usado. Pedidos de Casas já publicados nela continuam publicados. Os arquivos de imagem permanecem no armazenamento.
- **Matérias**: "Escolha o modelo que você quer utilizar." Seis modelos prontos (Notícia da Corte, Última Hora, Reportagem com gravura, Entrevista, Comunicado oficial, Coluna do Cronista). Usar um modelo insere os blocos na edição em rascunho (ou cria uma edição) e o Editor-Chefe só preenche os textos.
- **Duplicar modelo**: o botão de duplicar abre o editor com o nome "Cópia de X"; renomeie, edite textos, larguras e blocos, e salve. Modelos próprios podem ser editados e excluídos (tabela `campaign_newspaper_story_models`).

## Visual, Gravuras do Reino e calendário (11/11/2026)

- **Topo do site**: o banner "Cabeçalho Vintage com Prensa e Brasão" (`public/newspaper/cabecalho_folha.webp`) é o fundo do cabeçalho. O texto agora diz apenas "JORNAL".
- **Fonte do título**: a fonte escolhida em Configurações (clássico, editorial ou condensado) também vale para o título do topo e para o título do cabeçalho da Redação.
- **Emblema**: no canto inferior esquerdo do menu, o Emblema Dourado do Cronista (`emblema_integrado.webp`) substitui os ícones antigos. A imagem foi recriada sem a moldura retangular (só livros, pena, tinteiro, pergaminho, selo e o florão), com fundo transparente, para se misturar ao roxo do menu.
- **Redação**: formulário com rótulos claros, campos com caixa, alinhados, e botão de foto compacto.
- **Calendário**: abre no mês da data do HUB Temporal, marca o dia de hoje e destaca a semana (dezena) atual. Os eventos públicos agora vêm do RPC `get_newspaper_calendar_events`, que o Editor-Chefe consegue chamar.
- **Matérias**: clicar num modelo mostra a prévia ao lado, como em Configurações.
- **Gravuras do Reino** (botão em Matérias): o Editor-Chefe envia imagens, que aparecem quadradas, com lixeira e uma bolinha. Bolinha marcada: a gravura aparece no Acervo de gravuras. Desmarcada: continua guardada em Gravuras do Reino, mas some do acervo. Ao usar, a imagem é copiada para a pasta da edição.
- **Migration 0120** (`drizzle/migrations/0120_newspaper_engravings_calendar.sql`): tabela e bucket privados das gravuras e o RPC do calendário. O commit no GitHub não aplica SQL: é preciso executá-la no banco. Não foi homologada nem tem backup prévio.

## Pente fino: data do HUB, configurações livres e cabeçalho refeito (12/11/2026)

**Causa da "Data indisponível" e do aviso "Aguarde a data oficial do HUB Temporal".** O perfil do Editor-Chefe foi isolado dos jogadores: `my_player_id()` ignora de propósito a identidade de editor, então `campaign_access_active()` é falso para ele. A tabela `campaign_calendar` só libera leitura com essa regra, e por isso `get_campaign_calendar` voltava vazio na Redação. Sem data, o Jornal bloqueava a criação de edição e o calendário caía em Hammer de 1 CV. Nada foi afrouxado nas permissões: a Redação passou a ler a data pela projeção pública que já existia (`get_public_campaign_time`, só ano, mês, dia e festival).

- **Escrever sempre**: Escrever Matéria, Anexar Arquivo, modelos, gravuras e notícias contratadas criam a edição na hora. Se a data ainda não estiver em memória, o Jornal busca antes de criar. O aviso antigo deixou de existir.
- **Data no canto e no Calendário**: o seletor mostra a data oficial e a linha "Hoje no Reino". O Calendário abre no mês atual, marca hoje e a semana, tem o botão "Voltar para hoje" e, enquanto a data não chega, avisa que está lendo em vez de mostrar um mês errado.
- **Configurações sem edição**: nome, subtítulo, modelo e fonte agora são a identidade do jornal (tabela `campaign_newspaper_settings`, migration 0121). Valem para o título do site, para as próximas edições e para o rascunho aberto. A prévia muda na hora; o banco só grava em "Salvar configurações".
- **Brasão do título**: ocupa a altura útil do retângulo, com margem para não encostar nas linhas.
- **Cabeçalho**: a arte foi refeita em quatro peças (`cab_fundo.png`, `cab_esq.webp`, `cab_centro.webp`, `cab_dir.webp`). A faixa roxa é contínua, os cantos ficam nas pontas e a cena central mantém a proporção. Nada estica nem aparece recortado; em telas médias a cena desloca para a direita e o título ganha um véu escuro para leitura.

**Outros ajustes do pente fino**

- Folha: número da edição e data aparecem uma vez só (antes a data vinha duas vezes e havia três lemas). O rodapé usa o nome do jornal.
- Leitor: a folha que o jogador lê é a mesma da pré-visualização do Editor-Chefe, e a edição mais recente já abre ao entrar no Jornal.
- Imagens: na altura automática a imagem aparece inteira (imagens altas eram cortadas em 650 px). Na altura fixa há o controle "Mostrar: Topo, Centro, Base". Em Gravuras do Reino a miniatura quadrada mostra a imagem inteira.
- Edição: a alça de redimensionar não cobre mais a assinatura nem a legenda; blocos de largura total não têm fio lateral.
- Prévias de Configurações e de Matérias rolam dentro da moldura, sem cortar o fim do modelo.
- Status da Edição: os rótulos estavam trocados ("Pronta para revisão" quando havia conteúdo). Agora: "Pronta para publicar" ou "Falta conteúdo para publicar".
- Gravuras fixas: `conselho_real.jpg` e `mercado_suzail.jpg` caíram de 1,3 MB para cerca de 350 KB cada; `castelo_cormyr.jpg` tinha só 341 px de largura e foi ampliada para 1024 px (continua sendo a de menor nitidez).

**Melhorias mapeadas (12/11/2026): feitas em seguida**

1. Gravura do castelo: continua sendo a de menor nitidez (a fonte tem só 341 px). Agora o Editor-Chefe pode excluí-la do acervo e enviar uma melhor em Matérias > Gravuras do Reino. Nenhuma imagem nova foi inventada.
2. Brasões em WebP: `brasao_folha.webp` (155 KB, antes 770 KB) e `brasao_reino.webp` (60 KB, antes 297 KB).
3. Fontes do título (UnifrakturMaguntia) e dos cabeçalhos (Cinzel) hospedadas em `public/newspaper/fonts` (licença OFL junto). Só o corpo de texto (EB Garamond) ainda vem do Google Fonts.
4. Desfazer e refazer (Ctrl+Z, Ctrl+Y ou Ctrl+Shift+Z) para texto, blocos, imagens, data e identidade da edição aberta, até 100 passos; alterações seguidas em menos de 0,8 s (arrastar) contam como um passo. Também há botões na barra acima da folha.
5. Copiar, recortar e colar blocos: Ctrl+C, Ctrl+X, Ctrl+V (e Ctrl+D duplica, Delete remove) quando o foco está no bloco (clique na borda ou na alça ⠿). Dentro de um texto valem as teclas normais do navegador. Colar aceita bloco copiado (inclusive de outra edição, copiando a imagem), imagem da área de transferência (vira bloco de imagem) e texto simples (vira matéria). Blocos colados nunca herdam o vínculo com notícias contratadas.
6. Contagem de palavras por bloco, na lista de matérias, no painel do bloco e no total da edição com tempo de leitura; o leitor vê "Leitura: cerca de N min".
7. Publicação agendada: coluna `publish_on`, escolhida no cartão "Publicação agendada" do Status da Edição. A função `publish_due_campaign_newspapers()` compara a data com o relógio do HUB e publica os rascunhos vencidos; é chamada sempre que alguém carrega a lista de edições (editor ou jogador), então a publicação acontece no primeiro acesso depois da data, não em hora exata. Ela fica registrada nas revisões como ação da conta que carregou a lista.
8. Navegação entre edições: "Edição anterior / Próxima edição" para o leitor e setas ao lado do seletor de edição na Redação.
9. Recorte de imagem por arraste: com altura fixa e o bloco selecionado, arraste a imagem na folha; o controle "Ampliação do recorte" vai de 100% a 300%. Topo, Centro e Base continuam como atalhos.

**Acervo de gravuras editável**

As três gravuras originais agora são linhas da tabela `campaign_newspaper_engravings` (coluna `public_src`), aparecem em Gravuras do Reino com a marca "original do Reino" e podem ser mantidas, tiradas do acervo (bolinha) ou excluídas. O botão "Restaurar gravuras originais do Reino" as devolve. Excluir do acervo nunca altera edições já publicadas: o código continua reconhecendo os três arquivos.

A migration 0122 precisa ser executada no banco (o commit não aplica SQL). Não foi homologada nem teve backup prévio.

## Relatório de revisão (PDF de 12/11/2026): o que entrou e o que ficou de fora

**Implementado**

- **Refluxo ao redimensionar**: ao puxar a lateral (nova alça de largura) ou o canto de um bloco, a fileira continua fechada em 12 colunas. As colunas que faltam saem do vizinho da direita e, depois, da esquerda, nunca deixando ninguém abaixo de 3 colunas e nunca tirando de um bloco fixo. Se os vizinhos não puderem ceder, o bloco só cresce até onde a fileira cabe. Encolher não mexe nos vizinhos, e arrastar de volta devolve as colunas. Os botões de largura e o controle numérico continuam livres (permitem, de propósito, um bloco ocupar a linha toda).
- **Fixar bloco**: cadeado em cada bloco e caixa no painel. Bloco fixo não arrasta, não sobe nem desce, não redimensiona e não é removido; o texto continua editável. Ao mover os outros, ele fica no mesmo lugar da lista. A cópia de um bloco fixo nasce solta.
- **Auditoria das notícias contratadas** (Arquivo): pedido pago ao lado do texto publicado, com selo Publicado integralmente, Editado pelo Editor-Chefe, Recusado e reembolsado, Publicado sem o texto na folha ou Edição não encontrada. Não grava nada: o pedido original já é imutável no banco.
- **Letra capitular** gótica por matéria (caixa no painel, desligada por padrão).
- **Colunas niveladas**: os blocos da mesma fileira passam a ter a mesma altura, então o fio entre colunas vai de ponta a ponta.

**Não implementado, e por quê**

- **Menu de botão direito para Fixar**: o botão direito dentro de um texto abre a correção ortográfica do navegador, não existe no toque (celular, tablet) e ninguém o descobre sozinho. No lugar, cadeado visível e caixa no painel.
- **Pilha de desfazer com 10 passos**: já existe, com 100 passos, desde o PR #392.
- **Exportar PDF direto da folha (estilo pdfme)**: a biblioteca não está no projeto e uma captura da folha (html2canvas/pdfme) sai rasterizada ou com aparência diferente da tela, além de esbarrar nos links assinados das imagens. "Imprimir / Salvar PDF" já gera PDF com texto selecionável idêntico à folha. Anexar o PDF gerado também duplicaria o conteúdo, porque um PDF anexado entra como fac-símile.
- **Percentuais de completude (84% para 96%)**: não têm critério de medida no relatório; não foram usados.
- **Erros factuais do relatório** (nada foi feito a partir deles): cita um `usePublicHubDate` que não existe (a leitura é `getPublicHubDate`); diz que a Casa paga "moedas de ouro (PO)", mas o pedido custa 1 de Riqueza; menciona "lixeira com restauração" de edições, que não existe (excluir edição é definitivo; só as revisões podem ser restauradas); chama a aba de "Pedidos de Jogadores" e o botão de "Aceitar & Enviar aos Blocos", que no site são Anúncios e "Inserir na edição"; e descreve um protótipo que não está no repositório.

## Melhorias da escrita (12/11/2026, migração 0123)

Vieram do relatório analítico da parte de escrita. Tudo no editor do Editor-Chefe:

- **Colar sempre como texto puro** nos campos da folha; em manchete, títulos e legendas as quebras de linha viram espaço.
- **Enter** confirma o campo nos títulos de uma linha; **Esc** sai do campo e devolve o foco ao bloco; **Tab** segue para o próximo campo.
- **Texto de apoio** (placeholder) e altura mínima nos campos vazios.
- **Contador** de caracteres na manchete (90), subtítulo (120), linha de apoio (160) e títulos (80). Só avisa, nunca bloqueia.
- **Situação do salvamento** fixa na barra de edição: Salvo às HH:MM, Alterações ainda não salvas, Salvando, Falha ao salvar. Falhas do salvamento automático tentam de novo em 20 s.
- **Conferência antes de publicar:** texto de exemplo, matéria só com título, fotografia sem imagem ou sem legenda, manchete longa. Cada ponto leva ao bloco; dá para publicar mesmo assim.
- **Tecla /** abre o menu de inserção (setas, Enter, Esc); **tecla ?** abre a lista de atalhos.
- **Transformar em** (painel Editar elemento): manchete, subtítulo, matéria, citação ou aviso, sem perder o texto. Fotografia não se transforma.
- **Esboço da edição:** lista clicável dos blocos.
- **Descartar alterações** não pede mais confirmação: descarta e oferece **Desfazer descarte** por 10 s.
- **Duas novas tipografias** em Configurações: *Gótica* (Fraktur nos títulos, Garamond no texto) e *Romana* (Cinzel nos títulos, Georgia no texto), com as fontes que o site já hospeda. A migração **0123** amplia a lista permitida de `font_style` nas duas tabelas.

Não aplicado de propósito: `role="textbox"` nos campos (apagaria a semântica de título e quebraria a leitura por leitor de tela), negrito/itálico dentro do texto e troca de biblioteca de edição.
