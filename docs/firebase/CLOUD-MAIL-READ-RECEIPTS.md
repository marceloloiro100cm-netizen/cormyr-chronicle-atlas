# Recibos individuais de leitura — Firebase Cloud

Os recibos pertencem ao módulo **Missivas** e usam somente Firebase Admin Auth
e Cloud Firestore. Não usam Supabase nem alteram o backup do dia 15/11.

## Como funciona

- Na rota `/firebase-access`, uma carta endereçada ao jogador ou à sua
  Casa exibe **Nova** e o botão **Marcar como lida**.
- A ação `markRead` exige `Authorization: Bearer <Firebase ID token>` na
  mesma API Cloud de missivas já existente. O corpo permitido contém
  `action`, `source` (`imported` ou `firebase-cloud`) e `letterId`.
- O servidor valida o token com revogação, a conta habilitada, o perfil e os
  vínculos de Casa no documento Firestore **dentro da transação**. Nunca
  confia no perfil ou na Casa enviados pelo navegador.
- O jogador não pode marcar como lida uma carta de outra Casa, uma carta
  que ele próprio enviou, nem cartas excluídas, em rascunho ou de
  endereçamento ambíguo.
- O Narrador só confirma leitura de cartas Cloud endereçadas ao Narrador;
  não recebe autorização para fabricar recibos para jogadores.
- Ao repetir uma confirmação, o serviço retorna o recibo existente e não
  cria outro registro.

O registro é criado exclusivamente em
`campaignCloudRuntime/<snapshot>/mailReadReceipts/<hash da identidade>`,
com o ID derivado de `viewerUid`, `source` e `letterId`.
O documento original em `migrationDomainStage` ou `letters` permanece
imutável. A lista de missivas lê o status **somente do próprio usuário**,
sem divulgar recibos individuais de outras pessoas.

## Gatilhos de segurança

A API continua desativada se não houver
`CORMYR_FIREBASE_CLOUD_MAIL_ENABLED=true`,
`CORMYR_FIREBASE_CLOUD_READ_ENABLED=true`, snapshot SHA-256 confiável,
conta Auth habilitada e runtime `campaignCloudRuntime` com
`sourceSnapshotReconciled=true`, `mailWriteApproved=true`,
`applicationEnabled=true`, além do calendário na versão aprovada.

Todas as coleções privadas continuam com regras Firestore que negam
acesso direto de clientes. Não foram criadas contas, flags nem permissões
pela implementação.

## Validação

Os testes do serviço cobrem: cartas importadas e novas, cada Casa,
idempotência, exclusões, rascunhos, origem falsificada, conta desativada,
perda de vínculo com a Casa e proibição de alteração do snapshot.

**A aprovação dos testes de emulador ou CI não constitui homologação
real** com usuários do Firebase Cloud. A pendência de IAM do GitHub foi
mantida para quando houver acesso ao console, sem Cloud Shell.
