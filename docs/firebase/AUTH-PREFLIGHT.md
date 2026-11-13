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

## Plano de importação seguro — dry-run primeiro

O backup atual identificou 14 contas, das quais 13 possuem BCRYPT, uma não
possui senha e quatro identidades são externas. A auditoria de destino
confirmou zero contas e zero colisões naquele momento, **mas não garante**
que a origem está atualizada nem que os provedores OAuth estão configurados.

No mesmo Cloud Shell, com a pasta `normalized` privada identificada:

```bash
cd ~/cormyr-chronicle-atlas
git fetch origin feat/firebase-auth-preflight-20261112
git -C /tmp/cormyr-auth-check fetch origin feat/firebase-auth-preflight-20261112
git -C /tmp/cormyr-auth-check checkout --detach FETCH_HEAD
cd /tmp/cormyr-auth-check
NORMALIZED="$(find "$HOME/cormyr-chronicle-atlas/.firebase-migration" \
  -type f -path '*/normalized/manifest.json' -print -quit)"
NORMALIZED="$(dirname "$NORMALIZED")"
node scripts/firebase/prepare-auth-import.mjs \
  --normalized "$NORMALIZED" --project cormyr
```

Este comando não acessa o Firebase: confere hashes, contas sem senha,
identidades externas e vínculo de cada identidade ao UID de origem. O resultado
contém apenas quantidades, problemas e estado de prontidão; nunca divulga
identificadores, e-mails nem hashes.

A função de execução real existe exclusivamente para o corte controlado e é
bloqueada até que o operador **tenha realizado** reconciliação com exportação
final do banco ativo, revisado vínculos OAuth e preparado regras de acesso,
com confirmações explícitas e SHA-256 do dump correspondente. Antes de
qualquer gravação, ela verifica que a lista do Auth de destino está vazia.
Se a importação for parcialmente bem-sucedida, **não repetir** sem investigar
os UIDs e o plano de recuperação. Isso evita sobrescrita ou duplicação de contas.

Mesmo importadas, as contas não passam a ter acesso automático aos módulos:
os direitos de Casa, narrador e editor devem ser implementados no backend
com regras de segurança e testados separadamente. Sessões Supabase não migram.

## Identidade externa sem mapeamento — diagnóstico privado de causa

Em 13/11, o dry-run identificou 14/14 contas preparadas, 13 hashes BCRYPT,
uma conta sem senha e **3 de 4** identidades externas mapeadas. A identidade
restante é uma pendência de provedor, vínculo ou identificador. Não
presumir qual é a causa e não trocar automaticamente `provider_id` por
`auth.identities.id`: esses campos representam conceitos diferentes.

O diagnóstico não contém qualquer UID, email, hash, nome, subject ou dado
do `identity_data`, e não acessa o Firebase.

```bash
cd /tmp/cormyr-auth-check
git fetch origin feat/firebase-auth-preflight-20261112
git checkout --detach FETCH_HEAD
node scripts/firebase/diagnose-auth-identities.mjs "$NORMALIZED"
```

A saída informa o **motivo agregado**:
`sourceAccountMissing`, `providerNotSupported`,
`providerSubjectMissingOrInvalid` ou `providerSubjectDuplicate`.
Os tipos de provedor são exibidos somente em categorias permitidas;
um valor inesperado vira `other`, sem reproduzir o texto original.

- Provedor não suportado (por exemplo telefone, SAML ou Discord):
  projetar uma migração de login própria, não fingir que é Google.
- Vínculo a usuário ausente: reconciliar `auth.identities.user_id`
  contra `auth.users.id` da exportação final.
- Subject ausente ou inválido: verificar `provider_id` localmente,
  sem colar identificadores pessoais no GitHub ou ChatGPT.
- Subject duplicado: revisar se o mesmo vínculo externo está associado
  a contas diferentes; não escolher uma conta automaticamente.

O Firebase permite importar BCRYPT e contas sem senha, mas não resolve
por si só o acesso OAuth nem as permissões de Casa. Antes de importar,
é necessária reconciliação com a origem ativa e uma estratégia de login
verificada para os usuários afetados.

Documentação de referência:
https://supabase.com/docs/guides/auth/identities
https://firebase.google.com/docs/auth/admin/import-users

## Diagnóstico de formatos de nome do provedor (13/11)

O filtro inicial de texto identificou uma entrada com nome que não corresponde a
`[a-z][a-z0-9_-]*` e imprimiu `provedor_personalizado`. **Isso não
significa que exista login personalizado:** o filtro também recusa pontos,
dois-pontos, espaços e letras maiúsculas.

`diagnose-auth-identities.mjs` agora inclui o campo `unmappedByFormat`
com **classes seguras**, incluindo:

- `firebase-id:google.com` e outras aliases públicas reconhecidas;
- `case-or-space-variant:<nome público>`;
- `known-non-oauth:<tipo público>`;
- `email-like-or-at-sign`, `namespaced-or-colon`,
  `dotted-unknown`, `whitespace-unknown`,
  `uppercase-symbol-or-unicode`, `plain-unknown`.

O nome original de provedores desconhecidos **nunca** vai para os logs.
Também não é permitido renomear automaticamente `provider` ou
`provider_id`: alias de formato não garante equivalência de credenciais
ou configuração do provedor. Execute o diagnóstico somente no backup
privado, confirme o tipo e então aprove explicitamente o mapeamento.

## Namespace Supabase detectado no backup — próximo diagnóstico (13/11)

A identidade não mapeada tem um nome que contém `:`. Isso, por si só,
não comprova provedor SAML ou OAuth personalizado. O classificador agora
reconhece **somente os prefixos públicos** abaixo sem imprimir o sufixo:

- `namespaced-sso-saml`: a documentação Supabase atribui `sso:<uuid>`
  às identidades SAML; migrar o UID não recria o provedor nem o login SSO.
- `namespaced-custom-oauth-oidc`: identidades de provedores personalizados
  podem usar `custom:<nome>`; exige integrar o provedor no destino e
  testar o retorno/autenticação.
- `namespaced-or-colon`: formato desconhecido; requer avaliação privada
  antes de qualquer alteração.

Para consultar: atualizar a branch, depois executar
`node scripts/firebase/diagnose-auth-identities.mjs "$NORMALIZED"`.
Não imprimir o campo `provider` inteiro nem os identificadores e não forçar
mapeamento de SSO/SAML para OAuth Google. A lista de 14 usuários permanece
íntegra e sem importação, com 1 identidade externa sob investigação.

Fontes:
https://supabase.com/docs/guides/auth/enterprise-sso/auth-sso-saml
https://supabase.com/docs/guides/auth/custom-oauth-providers
