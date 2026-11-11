# Jornal de Cormyr

## Acesso
- **Narrador** e **Leonardo** (jogador ativo `Leonardo`, casa especial `espiao`, sem troca obrigatória de senha pendente): podem criar, editar, publicar, cancelar e arquivar todas as edições.
- **Demais jogadores ativos**: consultam exclusivamente edições publicadas/arquivadas. A abertura confirma a leitura pelo servidor; novas revisões incrementam a versão e voltam a ficar não lidas.
- Controles da interface são ilustrativos. A autorização verdadeira reside nas políticas RLS e na função de edição do banco.

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
2. Aplicar `drizzle/migrations/0111_campaign_newspaper.sql` no **Supabase de homologação** e inspecionar RLS, bucket privado e RPCs. O commit GitHub **não aplica automaticamente** SQL no Supabase.
3. Executar CI (Vitest/TypeScript/build/PostgreSQL descartável) e teste manual com três contas: Narrador, Leonardo e jogador comum.
4. Repetir migração validada em produção com backup e janela de retorno, depois mesclar a branch e liberar via publicação GitHub existente. **Não usar Lovable nem Vercel para publicar**.
5. Validar edição, carregamento privado de imagem/PDF, confirmação de leitura, cancelamento, arquivamento e acesso em celular.

## Limites atuais
- Até 15 MB por arquivo, 80 blocos por edição e 300 edições no carregamento inicial.
- Indicadores da caixa de entrada são atualizados a cada 30 segundos (não há push de notificações do navegador).
- O leitor de PDF depende do visualizador PDF do navegador; no celular há um link para abrir em tela cheia.
- Se a migração ainda não foi instalada, a interface retorna um erro explícito em vez de exibir dados de outro módulo.


## Identidade de Leonardo: A Folha Sem Selo
- Referência aprovada em 11/11/2026: redação editorial com cabeçalho vinho e dourado, pergaminho envelhecido, menu lateral e ferramentas à direita.
- Leonardo entra diretamente na tela **Editor-Chefe** ao abrir `/jogadores`. O atalho **Outros módulos de Cormyr** preserva a navegação aos módulos previamente autorizados.
- Menu lateral: Painel do Jornal, Edição da Capa, Matérias, Pautas, Correspondentes, Anúncios, Arquivo, Leitura e Alcance, Configurações.
- Ações centrais: Escrever Matéria, Anexar Arquivo, Pré-visualizar, Publicar Edição, Arquivar.
- Ferramentas: Título, Subtítulo, Imagem, Coluna, Citação e Aviso/Destaque. O painel exibe texto/legenda, alças de redimensionamento e botões para ordenar os blocos.
- Pautas usam os rascunhos das edições; Anúncios usam os blocos de destaque. **Correspondentes é apenas a entrada visual para um módulo futuro**, sem simular cadastros ou permissões inexistentes.
- Quando não houver edição, a capa de exemplo é identificada como **não publicada**. Nenhuma notícia de exemplo é enviada automaticamente.
- A versão real mantém as manchetes e imagens salvas, com capa compacta para não repetir o nome da Folha no topo e no miolo.
- As mudanças permanecem isoladas no tema `.folha-editorial`; leitores e o Narrador continuam usando o fluxo de jornal integrado às suas áreas existentes.
