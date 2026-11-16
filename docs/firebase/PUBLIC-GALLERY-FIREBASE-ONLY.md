# Galeria pública de Casas — transporte Firebase-only

Este lote substitui a antiga rota `GET /api/public/gallery-image?path=...`,
que antes consultava a RPC Supabase `can_read_public_gallery_image` e
baixava do bucket de origem via Supabase Storage. O novo código faz
**somente leituras** via Firebase Admin e Cloud Storage, sem fallback ou
chaves de serviço locais, em ambiente de produção.

## Situação operacional e dependências

**Não ativar em produção por este PR.** O endpoint vem bloqueado com
HTTP 503 até existir uma reconciliação **independente** das imagens
efetivamente revisadas como públicas. Uma cópia de objetos para staging
não equivale a autorização pública. Falta confirmar acesso do runtime
App Hosting ao bucket migrado e a integridade dos bytes reais.

Parâmetros apenas no servidor:

- `CORMYR_FIREBASE_PUBLIC_GALLERY_ENABLED=true` — padrão desativado.
- `CORMYR_FIREBASE_SNAPSHOT_ID` — SHA-256 exato do snapshot reconciliado.
- `CORMYR_FIREBASE_PUBLIC_GALLERY_BUCKET` — bucket privado migrado
  e aprovado no Cloud runtime, com nome `cormyr-...`; **nunca** apontar
  para o bucket de origem nem abrir acesso público no Google Cloud.

O documento `campaignCloudRuntime/<snapshot>` deve conter:
`status:'active'`, `private:true`, `sourceSnapshotId:<snapshot>`,
`sourceSnapshotReconciled:true`, `applicationEnabled:true`,
`publicGalleryApproved:true`,
`publicGalleryBucket:<bucket-migrado>`,
`galleryVersion:<inteiro positivo>` e
`publishedGalleryVersion` igual à mesma versão.

O documento `migrationPublicContentStage/<snapshot>` deve conter
`status:'complete'`, `private:true`, `sourceSnapshotId:<snapshot>`.
Essa etapa de revisão é separada de `migrationStorageStage`: o simples
índice histórico de referências e a existência de objeto NÃO autorizam
acesso anônimo. Nenhuma coleção é criada ou preenchida neste PR.

Para cada imagem pública revisada é necessário o documento:

`migrationPublicContentStage/<snapshot>/gallery/<sha256 do path UTF-8>`

com os campos abaixo:

| Campo | Restrição |
|---|---|
| `status` | `approved` |
| `publicReviewed` | `true` |
| `sourceSnapshotId` | snapshot aprovado |
| `version` | versão publicada da galeria |
| `path` | exatamente `public-house/<casa>/<arquivo>` |
| `bucketName` | bucket privado do runtime |
| `storagePath` | exatamente `campaign-images/` + `path` |
| `sha256` | SHA-256 dos **bytes reais**, minúsculo |
| `sizeBytes` | tamanho inteiro, 1 a 4 MiB |
| `contentType` | `image/png`, `image/jpeg`, `image/webp` ou `image/gif` |

A revisão deve comprovar que cada entrada corresponde a uma galeria de
Casa de fato pública e que nenhum caminho, objeto ou versão se refere a
dados privados. Em caso de incerteza, o campo `publicReviewed` permanece
falso e a imagem não é entregue.

## Comportamento de segurança

- Apenas caminhos estritos `public-house/` são admitidos; recusam-se
  travessia, URLs, barras adicionais, extensões injetadas e parâmetros
  desconhecidos ou repetidos.
- A rota exige etapa completa, runtime ativo, aprovação específica,
  versão compatível, bucket e caminho fixos, tipo MIME seguro, tamanho
  esperado, assinatura do arquivo e SHA-256 de cada byte servido.
- Erros respondem `404` ou `503` genéricos, `no-store`,
  `nosniff`, sem redirecionamento nem dados de IAM/UID/snapshot.
  `download` segue suportado, mas o nome do arquivo é saneado.
- SVG, HTML e conteúdo com assinatura incompatível não são publicados.
- A rota não faz imports Supabase e não escreve Firestore, Storage,
  Firebase Auth, IAM, App Hosting, DNS nem flags de produção.

## Aceitação necessária antes de habilitar

1. Confirmar reconciliados os objetos e hashes do bucket privado,
   inclusive diferenças históricas; o estágio ainda não está publicado.
2. Revisar publicamente **cada** imagem e popular apenas os documentos
   aprovados, com a versão e o snapshot exatos.
3. Conceder ao runtime App Hosting somente a leitura necessária do bucket
   migrado, sem tornar o bucket público. Não alterar IAM no âmbito
   deste PR.
4. Rodar testes de anônimo, Casa A, Casa B, Narrador, negativas e
   objeto alterado, em ambiente de homologação.
5. Somente então habilitar a flag e confirmar a revisão realmente
   recebendo tráfego. Isso NÃO libera o cutover geral.

**Os bloqueios de Auth, Firestore IAM, dados e perfis continuam na
[issue #513](https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas/issues/513).
`readyForPlayers=false` e `readyForCutover=false` permanecem.**
