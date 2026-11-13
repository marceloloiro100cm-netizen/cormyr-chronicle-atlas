# Firebase Storage: importação privada de arquivos (fase de preparação)

Nenhum arquivo desta rotina é publicado no site ou recebe ACL pública. O destino é sempre
`migration-staging/<bucket-de-origem>/<caminho-relativo>` no bucket Google Cloud Storage
indicado pelo operador. Os arquivos de origem não são alterados. Não use tokens Lovable.

## Pré-requisitos

- Node.js 22 ou superior;
- Exportação local com uma pasta por bucket, incluindo caminhos relativos originais;
- Um manifesto `<bucket>.manifest.json` contendo `version: 1`, `bucket`, `complete`
  e `files: [{path, size, sha256}]`;
- Na execução autenticada, `npm install --no-save @google-cloud/storage` e
  Application Default Credentials de uma conta com permissões restritas à área de staging.
  A configuração pública Web do Firebase não é credencial administrativa.

O parâmetro `--source` aponta para a pasta *pai* da pasta do bucket, por exemplo:
`/backup/campaign-images/public-house/phelles/0.png` deve corresponder ao caminho
`public-house/phelles/0.png` no manifesto `campaign-images`.

## Auditoria local (sem gravação)

```bash
node scripts/firebase/import-storage.mjs \
  --source /backup \
  --manifest /backup/campaign-images.manifest.json
```

Verifica cada objeto por tamanho e SHA-256, recusa caminhos inseguros e não segue
symlinks como arquivos. Relata quantos objetos foram verificados, faltam ou divergem.

## Importação autenticada somente para staging

```bash
node scripts/firebase/import-storage.mjs \
  --source /backup \
  --manifest /backup/campaign-images.manifest.json \
  --execute --project cormyr --destination BUCKET_FIREBASE_REAL
```

Informar o nome real do bucket obtido no console. Não pressupor que todo projeto
Firebase possui bucket Storage provisionado. `--execute` importa apenas se o manifesto
estiver `complete: true` e nenhum arquivo faltar/divergir.

Para *preparação parcial isolada*, pode-se acrescentar `--allow-partial`.
Isso só envia os arquivos localmente verificados para o mesmo prefixo privado de
staging; **não** conclui a migração, não substitui reconciliação nem altera o aplicativo.

A operação não sobrescreve objetos existentes: compara tamanho + SHA-256 guardado
no metadado `sourceSha256` e interrompe diante de divergência. O Google Cloud Storage
valida CRC32C no upload, e o cliente usa precondição de criação de objeto. Repetir o
comando permite retomar uma importação interrompida.

Não usar URLs públicas para imagens de missivas, conteúdo de narrador, jornais
não publicados ou documentos particulares. A autorização definitiva e a promoção
dos objetos de staging para caminhos consumidos pelo aplicativo são etapas posteriores.

## Situação verificada em 12/11/2026

- Manifesto `campaign-images.manifest.json`: 779 caminhos, ~2,11 GB,
  `complete: false`;
- 18 ZIPs parciais: 46 arquivos distintos, correspondendo por hash e tamanho
  a 75 caminhos do manifesto (reutilizações de conteúdo);
- 704 caminhos não estavam nesses ZIPs, embora possam estar no Google Drive;
- Backups PostgreSQL dos dias 11 e 12 localizados. O dump mais recente
  contém estruturas de jornal ausentes no anterior;
- Nenhum dado foi enviado ao Firebase nesta validação.

Para a migração de produção ainda faltam exportação fechada, reconciliação do
banco vivo, Auth, segurança por Casa, missivas, e adaptadores no runtime.
