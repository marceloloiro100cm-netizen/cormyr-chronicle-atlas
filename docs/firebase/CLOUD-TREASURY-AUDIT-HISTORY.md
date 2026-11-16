# Firebase Cloud — auditoria do histórico do Tesouro

A nova página `/firebase-treasury-history` reutiliza a sessão Firebase
da aba atual e consulta `POST /api/firebase-treasury-audit` com o corpo
estrito `{"action":"history","houseId":"..."}`.

**É somente leitura** e não cria um Tesouro operacional. Não habilita
lançamentos, não altera o saldo, não toca nas coleções `migration*` e
não lê Supabase nem dados de outros serviços.

## Condições de segurança

- Feature flag de servidor `CORMYR_FIREBASE_CLOUD_TREASURY_AUDIT_ENABLED`
  e `CORMYR_FIREBASE_CLOUD_READ_ENABLED` explicitamente habilitadas.
- Firebase Admin SDK somente no servidor; nenhuma chamada de Firestore
  privado feita pelo navegador.
- Token de sessão Firebase validado a cada consulta, verificando revogação
  e conta ativa.
- Narrador autenticado com `admin=true` pode consultar Casas ativas.
  Jogador pode consultar somente sua própria Casa, segundo associação
  obtida do documento de acesso no servidor. Editor é recusado.
- Raízes de autenticação, Casas e fichas importadas precisam estar
  completas e privadas. Runtime precisa estar ativo, reconciliado,
  privado, com `treasurySeededVerified=true`.
- A auditoria **não depende** de `treasuryWriteApproved` ou
  `applicationEnabled`. A equipe pode consultar a trilha anterior
  enquanto novas escritas estiverem congeladas.

## Integridade e isolamento

O servidor consulta a subcoleção `houseTreasuryAudits` filtrada
pelo `houseId` autorizado, verifica toda a sequência antes de responder,
e exige:

- Versões consecutivas desde 1, sem lacunas nem repetição.
- `expectedVersion=version-1`, `after=before+delta`,
  e cada `before` igual ao `after` anterior.
- Primeiro `before` igual ao Tesouro imutável da ficha importada.
- Último `after` igual ao saldo e à versão do Tesouro operacional
  atualmente reconciliado.
- Cada evento deve pertencer à Casa e ao snapshot corretos, conter
  identidade e data válidas e preservar os limites de lançamento.
- Qualquer documento ilegível, fraude, lacuna ou discrepância impede
  a consulta. Não são exibidos saldos possivelmente incorretos.
- No máximo 500 eventos são verificados por consulta; acima disso,
  a leitura fica bloqueada até existir paginação verificável.
  Depois de verificar tudo, a interface exibe os últimos 50 lançamentos.

A resposta de jogador inclui somente data, versão e valores; a resposta
do Narrador inclui, adicionalmente, a justificativa completa e o UID
confiável de quem registrou o lançamento. Nunca revela dados de
outra Casa, nem segredos internos de administração.

## Testes e entrega

`scripts/firebase/cloud-treasury-audit-service.test.mjs` contém os
cenários sintéticos de autenticidade de conta, bloqueio de editor,
isolamento entre Casas, ledger imutável, root desabilitado,
consistência da cadeia, divergência de saldo e limite de histórico.

Os testes fazem parte dos workflows `Validate` e
`Firebase cross-domain acceptance` sem Cloud Shell.

A publicação do novo código **não** libera o Firebase Cloud nem
certifica a migração dos dados reais; `readyForCutover=false`
continua em vigor, inclusive o bloqueio administrativo IAM #513.
