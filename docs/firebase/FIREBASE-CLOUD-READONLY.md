# Firebase Cloud — primeira rota de leitura restrita (sem Supabase)

Esta implementação é **exclusivamente Firebase**. O backend HTTP
`POST /api/firebase-cloud-read` e o serviço
`scripts/firebase/cloud-readonly-service.mjs` não fazem chamadas a Supabase
e jamais recorrem a ele em caso de erro.

## Estado

- Rota e núcleo adicionados, mas **desativados por padrão**.
- A antiga trava `CORMYR_ARCHIVE_ONLY` permanece ativa para APIs legadas,
  server functions, cron, Drive e a ponte do emulador. A exceção literal
  `/api/firebase-cloud-read` somente alcança o handler novo e ele retorna
  503 enquanto a flag do servidor não estiver ativada.
- Auth Firebase: token validado pelo Admin SDK com revogação, conta habilitada
  no Auth, escopo ativo e `requirePasswordChange=false`.
- Consulta de Casas: Narrador ou membro real da própria Casa. O Editor não
  recebe acesso às fichas. Visão de calendário: Narrador e jogador.
- Firestore: dados são acessados **somente no servidor** e através do snapshot
  definido no ambiente; nenhuma regra pública ou SDK cliente foi liberado.
- Todos os retornos são somente leitura e indicam
  `snapshotReconciliationPending=true` até o delta final.
- Nenhuma conta Firebase foi reativada por essa alteração.

## Configuração do servidor (não ativar antes da homologação real)

- `CORMYR_FIREBASE_SNAPSHOT_ID`: hash SHA-256 do snapshot privado validado,
  configurado SOMENTE no backend.
- `CORMYR_FIREBASE_CLOUD_READ_ENABLED=true`: libera exclusivamente as
  oito operações de leitura. Ausente/falso = HTTP 503.
- Firebase Admin usa a identidade IAM do App Hosting no projeto fixo
  `cormyr`, sem credenciais JSON no código.

O endpoint aceita `POST`, `Content-Type: application/json`,
`Authorization: Bearer <Firebase ID token>`, sem cookie e sem origem cruzada,
com corpo máximo de 2 KiB. Exemplos de corpo:

```json
{"action":"session"}
```
```json
{"action":"listHouses"}
```
```json
{"action":"getHouse","houseId":"ID autorizado da Casa"}
```
```json
{"action":"getCalendar"}
```

A API também oferece `listMailbox`, `listNewspaper`, `getNewspaper`
e `listSpyAgents` para o portal `/firebase-access`. O roteador mantém
as demais telas legadas em arquivo e abre **somente** a página piloto.
A página usa a configuração Web pública já registrada em
`src/integrations/firebase/public-config.ts` (nenhum segredo).

- Missivas: somente cartas entregues, endereçadas sem ambiguidade e não
  excluídas; Narrador, remetente ou destinatário verificado no backend.
  Máximo de 30 por leitura; histórico complementar ainda não incorporado.
- Jornal: apenas edições publicadas/arquivadas, sem rascunhos,
  cancelamentos ou histórico de revisão; o conteúdo é exibido como texto,
  nunca injetado como HTML.
- Espionagem: somente agentes da Casa autorizada ou Narrador, sem
  compartilhar as operações e dossiês secretos de outras Casas.
- Não há comandos de escrita nesse gateway; compras, correio, avanço de
  calendário, publicação do Jornal e missões continuam bloqueados.
- Limites explícitos de tamanho, coleção e token ajudam a evitar respostas
  excessivas e falham com negação em casos desconhecidos.

A chave da Casa jamais é uma autorização; a conferência é sempre feita
contra `migrationDomainStage/<snapshot>/access/<uid>` no servidor.

## Verificação mínima, obrigatória antes de habilitar

1. Atualizar `package-lock.json` e `bun.lock` ao adicionar a dependência
   `firebase-admin@14.5.1`. O CI não deve aceitar locks desatualizados.
2. Executar `node --test scripts/firebase/cloud-readonly-service.test.mjs`,
   build e workflows verdes.
3. Verificar no Firebase Cloud uma conta de homologação ativa, seu escopo e
   outra Casa proibida, sem usar dados privados nos logs.
4. Validar acesso anônimo/conta desativada como 401, Editor não acessando a
   ficha como 403 e a própria Casa como 200.
5. Verificar que os dados correspondem a um snapshot privado e **não a um
   espelho em tempo real da origem anterior**. Uma rota de leitura não
   implementa escritas nem autoriza corte.
6. Só depois conectar a tela do jogador, operações transacionais e realizar
   reconciliação final do backup, além de liberar contas individualmente.

**Não promova este PR como se a campanha estivesse operacional.**
O site ainda não possui login Firebase de jogador conectado a esta rota,
nem missivas, jornal, espionagem, batalhas e Hub Temporal na nuvem por
endpoints transacionais de produção. `readyForCutover=false`.
