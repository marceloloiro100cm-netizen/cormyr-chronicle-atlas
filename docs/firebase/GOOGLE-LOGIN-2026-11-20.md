# Entrada com Google pelo Firebase — Atualizado em 26/11/2026

## Como funciona

A tela oficial `/auth` continua única e exibe o botão **Entrar com Google** imediatamente:

1. **Modo padrão (Firebase Auth Popup, zero configuração de build):** ao clicar em **Entrar com Google**, o navegador carrega sob demanda (`import()` lazy, 0 KB no bundle inicial) o SDK `firebase/auth` com `inMemoryPersistence`, executa `signInWithPopup(auth, new GoogleAuthProvider())` usando o `authDomain` (`cormyr.firebaseapp.com`) e transfere a sessão validada para o `firebasePilotAuth()` compartilhado entre abas.
2. **Modo opcional (Google Identity Services):** caso `VITE_CORMYR_GOOGLE_CLIENT_ID` seja definido no build (`apphosting.yaml`), o botão usa Google Identity Services e troca o ID token por sessão Firebase via `accounts:signInWithIdp`.
3. **Vinculação self-service para jogadores já cadastrados:** dentro do Conselho, no botão **Senha e Google** no topo da tela, qualquer jogador, Editor-Chefe ou Narrador já autenticado pode clicar em **Vincular minha conta Google** (`prepareGoogleLink` + `linkWithPopup`). Isso vincula o provedor `google.com` ao **mesmo UID existente**, preservando Casa, perfil, missivas e fichas. Também é possível desvincular caso a conta tenha senha cadastrada (impedindo auto-bloqueio).

**Regras de segurança preservadas:**
- O servidor continua exigindo UID ativo, perfil e permissões de Casa no Firestore (`migrationDomainStage` / `campaignCloudRuntime`).
- Não existe criação automática de jogador, atribuição de Casa ou elevação de privilégio por e-mail Google.
- `prepareGoogleLink` e `unlinkGoogle` operam **exclusivamente** sobre o `uid` verificado do próprio token Bearer da requisição.

## Checklist obrigatório no Firebase Console (projeto `cormyr`)

1. **Firebase Console → Authentication → Sign-in method:** ativar o provedor **Google** e informar um e-mail de suporte do projeto.
2. **Firebase Console → Authentication → Settings → Authorized domains:** confirmar que `atlas.cormyr.com.br` está listado (e `localhost` para testes locais). **Não** inclua protocolo (`https://`) nem porta.
3. **IAM da conta de serviço do App Hosting (para vinculação via `createCustomToken`):** garantir que a conta de serviço de runtime do Firebase App Hosting tenha permissão `iam.serviceAccounts.signBlob` (papel *Service Account Token Creator* / *Criador de tokens da conta de serviço*) no projeto `cormyr`.
4. **Teste de homologação após deploy:**
   - Entrar com e-mail/senha → abrir **Senha e Google** → clicar em **Vincular minha conta Google** → sair → entrar novamente clicando em **Entrar com Google** e confirmar que a Casa, as missivas e o perfil continuam idênticos.
   - Testar uma conta Google sem vínculo no Atlas e confirmar que o acesso privado continua recusado.
