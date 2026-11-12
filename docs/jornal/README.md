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
- **Facilidades do modelo da Gazeta**: botões de largura (1/4, 1/3, 1/2, 2/3, Total), bloco Subtítulo, seletor de edições e "Próxima edição" no topo, "Descartar alterações" com aviso ao fechar a página, setas subir/descer em cada bloco e leões heráldicos no cabeçalho.

- **Seis facilidades extras**: acervo de gravuras, nome e lema editáveis na folha, histórico de revisões com restauração (Arquivo), salvamento automático de rascunhos, aviso ao jogador (contador no Jornal e botão Entendi) e limite de 3 pedidos pendentes por Casa. Mesma migração 0117.
