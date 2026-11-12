# Modelo "Gazeta de Cormyr" (zip) x A Folha Sem Selo (atlas): análise de funções e usabilidade

Data: 11/11/2026. Fonte do modelo: `gazeta-de-cormyr-github.zip` (index.html, css/styles.css, js/app.js, protótipo em localStorage). Comparado com `src/components/newspaper/*` e `src/lib/newspaper/*`.

## Veredito curto
O Jornal real já cobre as funções do modelo e vai além (dados reais, permissões, auditoria, leitura confirmada). A escrita no papel é equivalente: clicar no texto e digitar, arrastar blocos, puxar a alça de tamanho. Há quatro pontos em que o modelo é mais simples para o Editor-Chefe e vale copiar (seção "Lacunas").

## Tabela de funções

| Função | Modelo | Jornal real | Situação |
|---|---|---|---|
| Edição inline (clicar e digitar) | Sim, grava a cada tecla | Sim, grava ao sair do campo (blur); precisa Salvar | Equivalente. Diferença: no real, sem Salvar nada persiste |
| Blocos Título, Imagem, Coluna, Aviso | Sim | Sim (Manchete, Imagem, Coluna/Reportagem, Aviso) | Equivalente |
| Bloco Subtítulo separado | Sim | Não: o subtítulo é um campo da Manchete; o botão "Subtítulo" abre Configurações | Lacuna de clareza |
| Bloco Citação | Não | Sim | Real vai além |
| Arrastar da caixa de ferramentas e reordenar | Sim | Sim (alça ⠿ e soltar na folha) | Equivalente |
| Setas subir/descer em cada bloco | Sim, visíveis no bloco | Só no painel "Editar elemento" | Real exige um clique a mais |
| Largura do bloco | Botões prontos (1/4, 1/3, 5/12, 1/2, 2/3, total) | Controle deslizante 3 a 12 e alça ↘ no canto | Alça é melhor; faltam botões prontos |
| Altura/zoom/estilo da imagem | Altura, automático, 3 filtros, lightbox com zoom | Altura, automático, 3 filtros, lightbox com zoom | Equivalente |
| Acervo de gravuras do Reino + URL | Sim | Não (somente envio de arquivo, bucket privado) | Lacuna deliberada pela privacidade; acervo poderia voltar |
| Cabeçalho editável (data, lema, nº) | Sim, inline | Data pelo calendário Harptos do HUB; nº automático; lema fixo; título em Configurações | Real é mais seguro, menos direto |
| Leões heráldicos no cabeçalho | Imagens leao_esq/leao_dir | Símbolo ⚜ | Os arquivos do modelo não foram portados |
| Hub Temporal (lista de edições) + Próxima Edição | Seletor e botão | Seletor de data só da edição aberta; trocar de edição pelo Arquivo; "Nova pauta / edição" | Lacuna de usabilidade |
| Barra de 5 ações | Escrever, Anexar PDF, Pré-visualizar, Publicar, Arquivar | Igual (Anexar aceita PDF ou imagem) | Equivalente |
| Salvar rascunho / Cancelar envio | Salvar; Cancelar = descartar alterações | Salvar; Cancelar envio = ocultar a edição dos jogadores | Significados diferentes; falta "Descartar alterações" |
| Imprimir/Exportar PDF | Sim | Sim ("Imprimir / Salvar PDF") | Equivalente |
| Menu Redação | 8 itens, dados fictícios | 9 itens, dados reais (correspondentes pelas assinaturas, leituras confirmadas) | Real vai além; falta Histórico (a tabela de revisões existe) |
| Anúncios | Banco de editais com "Inserir no Jornal" | Insere aviso vazio e lista avisos da edição | Agora também recebe as notícias contratadas (ver abaixo) |
| Troca de visão Editor/Jogador | Seletor no topo | Não: o perfil vem da conta | Correto por segurança |
| Permissões, versões, auditoria, leitura | Não | Sim (RLS, revisões, recibos de leitura) | Real vai além |

## Lacunas de usabilidade (itens 1 a 5 já implementados em 11/11/2026)
1. Botões de largura prontos (1/4, 1/3, 1/2, 2/3, total) ao lado do controle deslizante.
2. Botão "Subtítulo" deve inserir uma linha fina ou focar o subtítulo da manchete, não abrir Configurações.
3. Seletor de edições no topo e botão "Próxima edição", como no modelo, para não depender do Arquivo.
4. "Descartar alterações" e aviso ao sair com alterações não salvas (hoje o texto só persiste ao clicar em Salvar).
5. Opcional: setas subir/descer visíveis no bloco; acervo de gravuras; leões heráldicos no cabeçalho.

## Notícias contratadas pelas Casas (novo, migração 0117)
- Jogador, aba Jornal: "Contratar notícia". Escreve título e texto, anexa imagem (opcional) e confirma. Custo: 1 de Riqueza permanente, debitada em transação com lançamento no livro-caixa e chave de idempotência (mesmo padrão das compras de espionagem, migração 0092).
- Editor-Chefe, menu Anúncios: lista as notícias pendentes com Casa, texto e imagem. "Inserir na edição e editar" cria a reportagem (e a fotografia) na edição em rascunho, editável direto na folha. Se não houver rascunho, abre um novo.
- Publicar a edição retira os pedidos da pendência (gatilho no banco). Casas veem "Aguardando publicação" ou "Publicada".
- A imagem do pedido fica em bucket privado próprio e é copiada para a pasta da edição na inserção, para os leitores poderem vê-la.

## Pontos a decidir
- Riqueza permanente (como em espionagem) ou apenas alocada? Implementado como permanente.
- Recusa com nota e reembolso de 1 Riqueza: implementada.
- O Narrador, que usa o painel clássico do Jornal, também vê as pendências ali.

## Sugestões implementadas (migração 0117)
1. Acervo de gravuras do Reino (castelo, conselho, mercado) na caixa de ferramentas, sem envio de arquivo.
2. Nome e lema do jornal editáveis direto no cabeçalho da folha.
3. Histórico de revisões em Arquivo, com botão Restaurar (leva a versão para a tela; salvar confirma).
4. Salvamento automático de rascunhos após 8 segundos sem digitar (edição incompleta não é salva em silêncio).
5. Aviso ao jogador: contador na aba Jornal e quadro "Novidades dos seus pedidos" com botão Entendi.
6. Limite de 3 pedidos pendentes por Casa, imposto no banco e na tela.

## Ainda em aberto
- Reutilizar o número da edição ao excluir o último rascunho (hoje fica uma lacuna na numeração).
- Arquivos de imagem de rascunhos excluídos permanecem no armazenamento.
