# Firebase Cloud — respostas de missivas (fase protegida)

A ação `reply` foi incorporada ao serviço transacional já existente
`POST /api/firebase-cloud-mail` e é utilizada pelo portal
`/firebase-access`. **Não habilita envios em produção por si só.**

## Escopo

- Somente mensagens novas da coleção `campaignCloudRuntime/<snapshot>/letters` podem receber respostas nesta primeira etapa. Cartas históricas importadas continuam em consulta, sem escrita ou alteração.
- A resposta é formada pelo servidor a partir do documento original. O navegador envia apenas `{ "action":"reply", "requestKey":"...", "letterId":"...", "content":"..." }`. Não aceita escolha de remetente ou destinatário.
- Jogador só responde com `editHouseIds` da Casa destinatária original, de volta à Casa remetente ou ao Narrador. O Narrador só responde às missivas explicitamente destinadas a ele, de volta à Casa de origem.
- Editor-chefe, autor original e usuários desativados/revogados não têm direito a responder à própria carta como destinatários.
- Mensagens canceladas, em rascunho, apagadas, de outra Casa ou de outro snapshot não podem gerar resposta.
- Mensagem e auditoria são gravadas no runtime separado em **uma transação** Firestore, usando as mesmas chaves de idempotência, contadores por remetente/rodada e data Harptos das mensagens normais.
- `replyToId` permite identificar a carta anterior sem alterar a carta original nem qualquer documento `migration*`.
- `listMailbox` fornece `canReply` calculado no servidor apenas para mensagens visíveis e elegíveis. Sem autorização de escrita do runtime, o portal não oferece resposta.
- O motor de cartas original no emulador continua preservado. Encaminhamentos para várias Casas, rascunhos, mídia e paginação não foram habilitados nesta etapa.

## Gates de liberação

A configuração de `CORMYR_FIREBASE_CLOUD_READ_ENABLED`,
`CORMYR_FIREBASE_CLOUD_MAIL_ENABLED`, hash do snapshot,
contas ativas individualmente, documentos privados reconciliados,
`mailWriteApproved`, `applicationEnabled`, rodada e calendário
requerem aprovação independente. Serviço e interface falham fechados.

O PR não altera IAM, autenticação, Firestore Rules, Storage Rules,
infraestrutura, segredos ou o `readyForCutover=false`.

## Validação

Verificações sintéticas de rota, idempotência, destinatário automático,
Casa alheia, campos indevidos, conta desabilitada, runtime bloqueado e
contagem de envios executam pelo GitHub Actions e testes Node.
**Somente passar no CI não comprova que uma conta real esteja apta.**
