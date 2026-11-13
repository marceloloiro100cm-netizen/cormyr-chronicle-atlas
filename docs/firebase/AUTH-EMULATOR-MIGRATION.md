# Cormyr: lote Authentication no emulador (sem importação Cloud)

## Estado e objetivo

O arquivo privado do PostgreSQL foi preservado e validado:
98 tabelas públicas, 3.455 registros e um registro grande em seis
fragmentos. O primeiro modelo tipado abrange 11 Casas, 11 fichas,
14 registros de acesso e 116 missivas (101 endereçadas e 15 em
quarentena de acesso negado). O Storage privado contém 986 objetos.
**Nada disso significa que o aplicativo já use Firebase em produção.**

A auditoria histórica de Authentication apontou:
14 contas, 13 hashes BCRYPT, 1 conta sem senha, 3 vínculos Google e
1 vínculo de provedor customizado; duas contas sem perfil explícito.

Este lote cria:
- `scripts/firebase/stage-auth-emulator.mjs`: valida o backup, preserva
  UIDs e emails sem imprimir valores pessoais, mapeia provedores OAuth
  conhecidos e mantém hashes BCRYPT em memória para importar no emulador;
- `firebase/firebase-auth.json`: Auth Emulator em
  `127.0.0.1:9099` com projeto fixo `demo-cormyr-migration`;
- testes unitários e de integração com contas fictícias, incluindo
  bloqueio quando o Auth Emulator já contém contas.

## Política de segurança

- `--normalized PRIVATE_DIR` executa somente verificação local e
  retorna contagens agregadas, sem tocar Firebase.
- `--execute-emulator` exige
  `FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099` e projeto
  `demo-cormyr-migration`. Não existe opção de importação cloud.
- Os 14 UIDs podem ser preservados integralmente no emulador, mas os
  dois sem perfil não recebem claims nem autorizações: **Auth não é
  autorização por Casa**.
- O vínculo `custom:` não é tratado como provedor Firebase. O
  importador o contabiliza como pendente de relink e exige que a conta
  tenha método alternativo de acesso. Não substitui nem inventa
  credenciais.
- Os logins Google, qualquer SSO/OIDC e a autenticação real com senha
  ainda precisarão de testes end-to-end antes do corte.
- Recusa importar se o destino já tiver qualquer conta, evitando
  substituição acidental de UIDs; nenhuma conta real é excluída.
- Não persistir dump de Auth, hashes ou exportação de emulador em
  repositório público, artefatos CI ou logs.

A documentação Firebase sobre `importUsers` diz que a API suporta
BCRYPT, mas não garante prevenção de duplicações de email nem de UID.
A chamada pode substituir usuários existentes. Por isso o importador
inclui uma inspeção do destino vazio e só roda em emulador.

## Executar pré-auditoria no backup privado existente

No Cloud Shell, use a versão integrada à `main`:

```bash
ROOT="$HOME/cormyr-chronicle-atlas"
git -C "$ROOT" fetch origin main
WORK="/tmp/cormyr-auth-stage-$(date +%s)-$$"
git -C "$ROOT" worktree add --detach "$WORK" FETCH_HEAD

NORMALIZED="$ROOT/.firebase-migration/inspecao-12nov-E4pokAhB/normalized"
node "$WORK/scripts/firebase/stage-auth-emulator.mjs" \
  --normalized "$NORMALIZED"
```

Se `preflightValid:true`, executar sem alterar serviços na nuvem:

```bash
cd "$WORK"
npm install --no-save --package-lock=false firebase-tools@15.35.0 firebase-admin@14.5.1
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099

npx firebase emulators:exec --only auth \
  --project demo-cormyr-migration \
  --config firebase/firebase-auth.json \
  "node scripts/firebase/stage-auth-emulator.mjs --normalized '$NORMALIZED' --execute-emulator"
```

**Essa carga não publica usuários no Firebase Cloud** e o emulador
desaparece ao encerrar. Somente realizar quando o dry-run estiver
válido, sem dados pessoais nos relatórios compartilhados.

## Critérios restantes de migração

1. Verificar a origem ativa no momento do corte: alterações de usuários,
   contas, vínculos e dados posteriores ao backup histórico.
2. Conferir provedores e testar entrada real, inclusive a conta sem
   senha e a identidade OIDC personalizada adiada.
3. Validar autorização de todas as Casas, missivas e o editor.
4. Migrar os dados funcionais restantes: calendário, jornal, espionagem,
   batalhas, unidades, construções, eventos e fichas.
5. Definir serviços Cloud Firestore/Auth/Storage de homologação sem
   exposição pública de snapshots, e validar regras de segurança.
6. Criar plano de reconciliação final, corte e rollback, preservando
   acesso ao site de origem até que o sistema inteiro funcione.

Fontes:
https://firebase.google.com/docs/auth/admin/import-users
https://firebase.google.com/docs/emulator-suite/connect_auth
