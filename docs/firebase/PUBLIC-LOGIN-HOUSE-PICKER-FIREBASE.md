# Portal de login — seletor público de Casas via Firebase

Depois da migração de `GET /api/public/catalog` no [PR #549](https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas/pull/549), a lista visual de Casas no portal `/auth` ainda consultava diretamente duas fontes Supabase: `campaign_houses` e a RPC `public_player_houses`.

Este lote substitui **apenas essa consulta de interface** por uma única chamada `GET /api/public/catalog`, usando `loadFirebasePublicSeasonHouses()`.

## Propriedades

- `credentials:'omit'`, `cache:'no-store'`, `redirect:'error'`, método GET e `Accept:'application/json'`. Nunca inclui JWT, cookies, cabeçalho Authorization ou chave pública/privada do Supabase.
- Aceita apenas HTTP 2xx JSON, com formatos `houses[]` e `playerHouses[]` e limite de 250 linhas por coleção e tamanho de resposta sinalizado até 700 KB.
- Reutiliza `loadSeasonHouses()` para filtrar a interseção pública, sem duplicatas, e excluir a identidade especial `espiao`.
- Em 503, erro de rede, HTML, JSON inválido ou catálogo ainda não aprovado, a tela **não apresenta Casas inventadas**: lista vazia, erro genérico e botão de repetir.
- Não aceita `selectedHouse`, `profile` ou quaisquer escolhas feitas no formulário como identidade ou autorização. Essas escolhas são apenas preferências de interface.

## Separação da migração Auth

**Não foi alterada a autenticação por e-mail/senha** do portal histórico, que ainda requer um lote próprio de Firebase Auth. A conta real e seu escopo atual devem ser validados no servidor antes de descontinuar o login antigo. Este PR não ativa Firebase Auth, permissões IAM, Runtime Cloud nem qualquer flag.

O endpoint de catálogo foi criado com aprovação desligada por padrão; portanto, **a lista pode continuar indisponível até que os dados reais sejam homologados**. A disponibilidade da tela de login e o `readyForPlayers` permanecem independentes.

## Testes

O suite `season-houses.test.ts` valida uma única chamada sem credenciais, lista das Casas da segunda temporada, exclusão do Espião, falha segura quando o Firebase retorna 503, HTML, formato inválido, excesso de tamanho e recuperação após erro temporário.

Sem Cloud Shell, sem atualização de dados e sem Supabase na consulta de Casas. Nenhum cutover foi executado.
