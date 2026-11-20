# Item 11, arquivos privados no Firebase Storage

- Upload somente via `POST /api/firebase-private-media`, com Firebase Auth revogado verificado no servidor, MIME PNG/JPG/WebP/GIF validado pelos primeiros bytes e limite rígido de 5 MB por imagem.
- O servidor gera caminho opaco `private/{snapshot}/{uid}/{uuid}.{ext}`, não aceita nomes ou ACL escolhidos pelo navegador e mantém manifesto `privateMedia` com hash SHA-256, tamanho, autor real e estado.
- O upload tem reserva transacional, prevenção de sobrescrita por geração e confirmação `ready` somente após salvar o objeto íntegro. Tentativa duplicada com conteúdo idêntico é idempotente.
- A referência `[cormyr-image:path|legenda]` só pode ser adicionada a uma missiva ou registro quando o autor autenticado for o dono da imagem e o manifesto constar como `ready`. Uma edição preserva referências históricas já existentes, sem conceder a um adversário o direito de copiar anexos.
- A leitura compara o caminho e o manifesto do arquivo. O dono autenticado pode visualizar sua imagem; outros leitores só a obtêm quando uma carta, resposta ou registro **atualmente legível** contém esse token. O servidor reconsulta o escopo antes de assinar ou entregar bytes.
- O cliente antigo de imagens usa agora upload e download autenticados da ponte Firebase, sem acesso direto ao Storage. A galeria de imagens de missivas é derivada de cartas entregues e autorizadas da Casa, não de uma coleção pública.
- URLs assinadas V4 expiram em **60 segundos**. Se a conta de serviço não tiver permissão para assinar, a API falha fechada; a leitura binária via servidor não depende de URL pública.
- `firebase/storage.rules` continua negando totalmente leitura, escrita e listagem diretas pelo cliente.
- Imagens importadas de buckets antigos só são acessíveis após comprovação independente da origem, do manifesto e do checksum. O código nunca expõe anexos históricos não conciliados como se estivessem homologados.

O recurso está atrás de `CORMYR_FIREBASE_PRIVATE_MEDIA_ENABLED=false`. Mesmo após alterar a flag, a raiz operacional exige `privateMediaReadApproved=true` para leitura e também `privateMediaWriteApproved=true` para upload. Não ativar sem homologar regras do bucket real, assinatura IAM e testes com contas de Casas diferentes. A vinculação de brasões e imagens contratadas ao editor depende da aceitação do fluxo visual e de reconciliação do Storage.

Não alterar o acervo importado nem usar Supabase, Lovable ou Vercel.
