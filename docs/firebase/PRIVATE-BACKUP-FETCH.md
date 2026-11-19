# Cormyr — backup PostgreSQL privado para Cloud Shell

A auditoria de contas e Firestore exige o backup de 12/11/2026,
que **não deve ser armazenado em GitHub público** nem na pasta
compartilhada `Site` do Drive.

O proprietário tem uma pasta privada de destino no Drive:
https://drive.google.com/drive/folders/1STZckDlnOK2N8M6xSMLWu08HXLoVMkMD

A pasta foi criada na raiz do My Drive e verificada como privada,
acessível somente ao proprietário. O ChatGPT tentou enviar o arquivo
existente na biblioteca para o Drive, mas a ferramenta bloqueou a
transferência entre conectores; **nenhum backup foi enviado**.

Após o proprietário enviar `cormyr-chronicle-atlas_261112.backup.zip`
para essa pasta, compartilhar **somente esse arquivo** como leitor com
`cormyr-migration@cormyr.iam.gserviceaccount.com`. Não compartilhar
a pasta inteira.

No Cloud Shell, com a identidade de migração autenticada, obter o
Drive ID do arquivo e o checksum SHA-256 verificado da cópia original.
Não aceitar outro arquivo sem correspondência de hash.

```bash
node scripts/firebase/fetch-private-backup.mjs \
  --drive-file-id ID_DO_BACKUP_NO_DRIVE \
  --output .firebase-migration/backup-12nov.backup.zip \
  --expected-sha256 SHA256_DA_COPIA_ORIGINAL
```

O comando não sobrescreve arquivo existente e grava somente em
`.firebase-migration` (ignorada pelo Git). A saída confirma tamanho,
SHA-256 e ausência de escrita em banco. Credenciais não são impressas.

Depois, no ambiente privado que tenha `pg_restore` versão compatível:

```bash
unzip -p .firebase-migration/backup-12nov.backup.zip \
  cormyr-chronicle-atlas_261112.backup \
  > .firebase-migration/backup-12nov.backup

bash scripts/firebase/prepare-backup.sh \
  .firebase-migration/backup-12nov.backup \
  .firebase-migration/inspecao-12nov
```

O usuário pode rodar os auditores offline das PRs #402 (Auth)
e #403 (compatibilidade Firestore) sobre
`.firebase-migration/inspecao-12nov/normalized`.
Essas PRs ainda precisam de revisão antes de entrar na branch principal.

**Não é uma migração final.** Ainda falta reconciliar com o PostgreSQL
ativo após o backup, validar senhas, autorização por Casa e
transações/missivas do Hub Temporal.
