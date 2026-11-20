# Entrada com Google pelo Firebase — 20/11/2026

## Implementação

A tela oficial `/auth` continua única. O botão do Google usa Google Identity
Services para obter um ID token de curta duração e `accounts:signInWithIdp`
para trocá-lo por credenciais do Firebase Auth no projeto `cormyr`.
O ID token Google **nunca** é utilizado como credencial para as APIs privadas.
O servidor continua exigindo UID ativo, perfil e permissões de Casa no Firebase.
Não existe criação de jogador, vínculo de Casa ou aprovação automática pelo e-mail.

Em caso de e-mail já existente em outro provedor, o Firebase pode exigir
vinculação explícita da credencial ao UID original. O sistema mostra uma
mensagem de bloqueio, sem transferir permissões nem gerar uma nova vinculação.
Essa associação deve preservar o UID original antes de ser habilitada para cada
conta — não se deve substituir as contas já importadas.

## Configuração obrigatória antes da disponibilidade em produção

1. Em Firebase Console > Authentication > Sign-in method, ativar **Google**
   para o projeto `cormyr`, com e-mail de suporte configurado.
2. Em Firebase Authentication > Settings > Authorized domains, validar
   `atlas.cormyr.com.br`. Em Google Cloud, credenciais OAuth, conferir se
   a origem JavaScript autorizada inclui `https://atlas.cormyr.com.br`.
3. Obter o **OAuth 2.0 Client ID tipo Web** do mesmo projeto, no formato
   `<números>-<identificador>.apps.googleusercontent.com`.
   Não é a API key do Firebase, nem um client secret. Configurar a variável
   pública `VITE_CORMYR_GOOGLE_CLIENT_ID` com disponibilidade **BUILD**
   no `apphosting.yaml` ou na configuração de build equivalente.
4. Publicar via Firebase App Hosting (branch `main`). Sem essa variável
   o formulário tradicional continua operando, e a tela apenas informa
   que a opção Google aguarda ativação.
5. Testar com uma conta autorizada, uma conta Google não vinculada e uma
   conta desativada. Verificar que a UID, a Casa e o perfil não mudam;
   validar que uma conta sem vínculo não abre a área privada.

## Desempenho e integridade

- `queryRows` devolve somente as colunas simples solicitadas, **depois**
  do filtro de autorização, ordenação e paginação. O acervo permanece intacto.
- `firebase-rest-auth` preserva o ID token ainda válido apenas na aba atual
  para evitar um refresh extra a cada reload; o servidor verifica a sessão
  em cada pedido.
- Falhas de renovação ou troca de identidade não devem repor sessão anterior.
- O fluxo de login não precisa carregar caixa, jornal e calendário antes de
  renderizar o Conselho. Esses módulos continuam sob demanda.

## Homologação

Os testes automatizados não comprovam o desempenho real em produção nem
verificam a configuração de OAuth do projeto. Para isso são necessários
um deploy aprovado e um teste autenticado de ponta a ponta.
