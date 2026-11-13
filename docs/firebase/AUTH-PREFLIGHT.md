# Firebase Authentication — auditoria segura do backup (sem importação)

Status: etapa privada de análise; **nenhum usuário importado no Firebase**.

O código atual autentica via Supabase e preserva associações de Casa no banco.
A troca para Firebase Auth deve preservar UID, e-mail verificado, relações de
representação, papéis e revogação. Não basta importar senhas.

## Auditoria offline

Após `prepare-backup.sh` produzir `normalized/manifest.json`, executar:

```bash
node scripts/firebase/audit-auth-backup.mjs \
  .firebase-migration/inspecao-privada/normalized
```

A saída contém **somente quantidades agregadas**:
usuários, hashes BCRYPT, contas sem senha, hashes não suportados, e-mails
duplicados, UIDs repetidos, provedores externos e impedimentos. Não imprime
UIDs, nomes, e-mails, hashes, tokens ou dados privados.

O script confere SHA-256 dos arquivos de origem normalizados, não escreve
no Firebase e não gera exportação importável, para impedir publicação
acidental de credenciais no GitHub.

## Antes da migração autenticada

1. Reconciliar o backup com o banco ativo e exportar a versão final após
   suspensão de escritas; verificar UIDs e e-mails duplicados.
2. Verificar usuários sem senha, provedores OAuth e identidades vinculadas:
   sessões Supabase NÃO migram para Firebase.
3. Auditar usuários já existentes no projeto Firebase de destino.
   **A API `importUsers` pode sobrescrever UIDs existentes e não verifica
   duplicidade de e-mail automaticamente.**
4. Apenas com destino vazio/isolado e aprovação, preparar importação em lotes
   de até 1.000 contas por chamada Admin SDK. Firebase suporta BCRYPT com
   `passwordHash: Buffer.from(hash)` e `hash.algorithm='BCRYPT'`,
   mas o formato real deve ser validado. Não importar hashes que não
   correspondam exatamente ao padrão esperado.
5. Fazer teste de login com contas de homologação, validação por Casa,
   narrador/editor, reautenticação, expiração e revogação antes de divulgar
   novo endereço. Uma sessão Supabase não vira sessão Firebase.
6. Não usar credenciais administrativas, hashes ou listagens de usuários
   em código frontend, logs de CI, issues ou repositório público.

Referência oficial: https://firebase.google.com/docs/auth/admin/import-users

**Este lote apenas avalia a viabilidade do backup. Não concede
permissões, não cria usuários e não muda o login dos jogadores.**

## Nova etapa: verificar colisões no destino Firebase (somente leitura)

A auditoria de backup acima não inspeciona contas existentes no projeto Firebase.
O script `scripts/firebase/audit-auth-destination.mjs` compara, sem escrita,
UIDs e e-mails do backup privado com a listagem paginada do Authentication.
O relatório omite todos os identificadores individuais. Ele **sempre** retorna
`readyForImport: false`: a decisão de importar depende também das quatro
identidades externas, da conta sem senha, das associações de Casa e de uma
reconciliação final com o banco ativo.

No Cloud Shell, com a variável `NORMALIZED` apontando para a pasta privada que
contém `manifest.json`:

```bash
# Dependência do Admin SDK apenas no ambiente de trabalho, sem gravar lockfile.
npm install --no-save --package-lock=false firebase-admin

# Consulta somente leitura ao projeto cormyr: NÃO importa nenhum usuário.
node scripts/firebase/audit-auth-destination.mjs \\
  --normalized "$NORMALIZED" \\
  --project cormyr
```

Exige credenciais Google de aplicação autorizadas no Cloud Shell; nunca colocar
um JSON de conta de serviço no GitHub. Não executar com
`FIREBASE_AUTH_EMULATOR_HOST` configurado: o script recusa interpretar
um emulador como destino real. Se `GOOGLE_CLOUD_PROJECT` apontar para outro
projeto, também bloqueia por segurança.

**Bloqueio absoluto para importação:** se o destino não estiver vazio, ou se
houver conflito de UID/e-mail, não utilizar `Auth.importUsers` diretamente:
essa API pode substituir um UID existente ou criar contas duplicadas por e-mail.
Resolver a divergência com revisão privada antes de qualquer escrita.
