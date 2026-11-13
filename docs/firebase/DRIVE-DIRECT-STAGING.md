# Importação direta de imagens do Google Drive para Firebase Storage

## Estado e limites

Ferramenta de **staging privado** para o projeto Cormyr. Não publica arquivos para
jogadores, não altera as Casas, não migra PostgreSQL/Auth, não move a aplicação
para Firebase e não modifica a pasta de origem. O comando padrão é **dry-run**:
lê metadados de caminhos/tamanhos sem transferir conteúdo.

Esta ferramenta dispensa baixar os 2,11 GB de imagens no computador. Ela percorre
a hierarquia de pastas compartilhadas no Drive e confere caminhos com o manifesto
original. Durante a importação, lê os bytes de cada arquivo, confere SHA-256
antes de transferi-los, grava em `migration-staging/campaign-images/...`,
e usa precondição de não sobrescrita e validação CRC32C.

Manifestações `complete:false` nunca autorizam a promoção final para o aplicativo.
`--allow-partial` só permite staging isolado. Dados privados e imagens de
missivas jamais devem receber ACL pública no bucket.

## 1. Uma autorização inicial do proprietário

1. Em <https://console.firebase.google.com/project/cormyr/storage>, confirmar que Storage está provisionado. Nome confirmado pelo proprietário:
   `gs://cormyr.firebasestorage.app`.
2. No Google Cloud IAM, criar uma conta de serviço exclusiva para migração, sem
   chave JSON; conceder apenas os privilégios de objeto necessários no bucket
   de staging (leitura de metadados e criação de objetos). Conceder à conta
   do operador permissão de geração de token nessa conta de serviço.
   Habilitar Drive API e Service Account Credentials API no projeto.
3. A conta de serviço `cormyr-migration@cormyr.iam.gserviceaccount.com` já foi criada
   sem chave JSON. Em 12/11, o arquivo `campaign-images.manifest.json` teve leitura
   concedida e verificada diretamente pelo conector Google Drive.
   **Pendente:** compartilhar SOMENTE a pasta de imagens
   <https://drive.google.com/drive/folders/1EFO4v06s6P7CQa-R7Jpqe0t1hbETrmER>
   com a mesma conta, papel `Leitor`, para incluir suas subpastas.
   Evitar conceder acesso à pasta-mãe `Site` inteira, que contém outras informações.

Não compartilhar credenciais, arquivos de chave ou access tokens pelo chat.

## Verificação confirmada em 12/11/2026

- A conta `cormyr-migration@cormyr.iam.gserviceaccount.com` está ativa e sem chaves JSON
  (captura do proprietário).
- As permissões de leitor no manifesto e na pasta `campaign-images` foram
  confirmadas via Google Drive (metadados de permissão).
- O proprietário informou ter salvo os papéis Storage Object Creator e
  Storage Object Viewer no bucket `gs://cormyr.firebasestorage.app`.
  Ainda não foi possível testar o IAM do bucket com uma chamada GCS autenticada.
- Não há upload autenticado concluído no Firebase nesta etapa.

**Executar primeiro apenas o dry-run abaixo.** Copiar nenhum token/senha para
issues, chats ou GitHub. O operador precisa de permissão
`roles/iam.serviceAccountTokenCreator` **na conta de serviço** para usar
`--impersonate-service-account`. Essa permissão não é a mesma que os
papéis de objetos concedidos no bucket.

O comando `gcloud services enable` somente deve ser usado com ciência de
que habilitar APIs é uma alteração no projeto; para a rotina são necessárias
`drive.googleapis.com` e `iamcredentials.googleapis.com`. Não habilitar
faturamento automaticamente.

## 2. Cloud Shell com credenciais temporárias

Com a conta do proprietário, no Cloud Shell do Google Cloud:

```bash
gcloud config set project cormyr
gcloud auth application-default login --impersonate-service-account=cormyr-migration@cormyr.iam.gserviceaccount.com
git clone https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas.git
cd cormyr-chronicle-atlas
git fetch origin feat/firebase-storage-staging-import-20261112
git checkout feat/firebase-storage-staging-import-20261112
npm install --prefix scripts/firebase --no-save --ignore-scripts --no-audit --no-fund googleapis @google-cloud/storage
```

Verificação de leitura do Drive, sem escrita, sem download dos binários:

```bash
node scripts/firebase/import-drive-storage.mjs \
  --manifest-drive-id 196MdMZ6rSuUTkBmhn2yLq1Mf98El9F9T \
  --drive-folder 1EFO4v06s6P7CQa-R7Jpqe0t1hbETrmER
```

Conferir `metadataMatching`, `missing`, `mismatched` e `extra`.
Como o manifesto de 12/11/2026 informa `complete:false`, eventual envio
fica restrito a preparação, não à migração aprovada.

## 3. Somente depois de conferir a leitura, enviar primeiro um lote pequeno

```bash
node scripts/firebase/import-drive-storage.mjs \
  --manifest-drive-id 196MdMZ6rSuUTkBmhn2yLq1Mf98El9F9T \
  --drive-folder 1EFO4v06s6P7CQa-R7Jpqe0t1hbETrmER \
  --execute --allow-partial --limit 10 \
  --project cormyr --destination cormyr.firebasestorage.app
```

Verificar no console Storage apenas os objetos em
`migration-staging/campaign-images/`. Se corretos, repetir o comando sem
`--limit 10`; ele pula arquivos existentes que têm o SHA-256 e tamanho
esperados e recusa sobrescrita divergente. Se o download falhar, reiniciar
o comando: objetos já verificados são retomados com segurança.

A autorização via identidade temporária segue a orientação oficial:
<https://cloud.google.com/docs/authentication/use-service-account-impersonation>.

### Falhas esperadas e diagnóstico

- `403` no Drive: a conta de serviço não recebeu acesso à pasta **mãe**,
  Drive API não está habilitada, ou as credenciais não possuem o escopo Drive.
- `403` no bucket: IAM insuficiente no bucket ou projeto incorreto.
- `404` de bucket: usar o nome real do Storage, não inventar sufixos.
- Diferença de SHA: arquivo mudou ou o Drive tem bytes distintos do backup;
  abortar e reconciliar, não tentar sobrescrever.
- Se Storage ainda não foi provisionado, criar o bucket privado primeiro.
- A condição `complete:false` impede declarar conclusão, mesmo com upload
  de todos os itens do manifesto.

Os dados do banco e os hashes de senha continuam privados. Não colocá-los no
GitHub; o repositório é público.
