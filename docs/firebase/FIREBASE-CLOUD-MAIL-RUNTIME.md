# Operação de missivas — Firebase Cloud, sem Supabase

**Estado inicial: desativado.** A API `POST /api/firebase-cloud-mail` grava
novas missivas somente em `campaignMailRuntime/<snapshotId>/letters`.
Os documentos `migration*Stage` continuam **imutáveis** e privados.

## Proteções

A gravação exige, ao mesmo tempo:

1. Build do App Hosting com `CORMYR_FIREBASE_CLOUD_READ_ENABLED=true`,
   `CORMYR_FIREBASE_CLOUD_MAIL_ENABLED=true` e
   `CORMYR_FIREBASE_SNAPSHOT_ID` contendo um SHA-256 do snapshot
   verificado. Sem qualquer variável, falha com 503.
2. Firebase Admin SDK autenticado pelo service account do App Hosting no
   projeto **cormyr** (sem chave JSON no GitHub).
3. `migrationDomainStage/<snapshotId>`, `migrationAuthStage/<snapshotId>`
   e `migrationTimeEngineStage/<snapshotId>` completos e privados.
4. Conta Firebase Auth **habilitada**, token não revogado e documento de
   acesso ativo correspondente ao UID.
5. Documento `campaignMailRuntime/<snapshotId>` criado sob processo
   administrativo independente, com valores **todos explícitos**:

   ```json
   {
     "status": "active",
     "private": true,
     "sourceSnapshotId": "<o hash validado>",
     "sourceLiveReconciled": true,
     "applicationEnabled": true,
     "mailEnabled": true
   }
   ```

   **NÃO crie esse documento enquanto a origem ainda estiver recebendo
   gravações não reconciliadas.** A existência dele é uma afirmação
   operacional, e não uma simulação de teste. A implementação não cria
   esse registro por conta própria.

6. Checagem **dentro da transação** do documento de acesso atual, das
   Casas de origem/destino ativas, da data canônica e do status do runtime.
   Quem não tem `editHouseIds` para a Casa remetente não envia.
   O Narrador envia somente a Casas; o jogador envia a Casa ou Narrador.
7. Uma chave UUID identifica cada solicitação. Um reenvio idêntico não cria
   duplicata; alteração de corpo com a mesma chave retorna HTTP 409.
   Há limite de conteúdo e intervalo mínimo entre envios por usuário.
8. Firestore deve manter **deny-all para SDKs de clientes** nas coleções
   `campaignMailRuntime` e `migration*`: acesso apenas pelo servidor.

## Portal

O portal `/firebase-access` verifica a disponibilidade de envio com
`{"action":"status"}` e só mostra o formulário quando o runtime e a
conta estão autorizados. `{"action":"send",...}` envia **uma mensagem**
por vez, sem permitir alterar a identidade do remetente.

Novas cartas entregues passam a compor o resultado da consulta
`listMailbox`, junto com as cartas históricas já autorizadas, sem alterar
a projeção histórica. Até 30 itens mais recentes retornam no piloto.
Respostas em cadeia, envio múltiplo, agendamento, pasta de rascunhos e
edição ainda **não** fazem parte deste endpoint.

## Testes sem produção

- `node --test scripts/firebase/cloud-mail-service.test.mjs`
- `node --test scripts/firebase/cloud-readonly-service.test.mjs`
- CI `Firebase cross-domain acceptance`: contratos e emuladores, sem
  credenciais Google Cloud.

O teste verifica: token revogado/conta desabilitada, editor negado,
origem falsificada, acesso da Casa dentro da transação, destino inativo,
root pendente, envio ao Narrador, idempotência, colisão, taxa de envio e
não modificação do snapshot.

## Itens que **permanecem bloqueando** liberação operacional

- Reconciliar dados até um corte real somente Firebase; migração de
  mídias faltantes, histórico e contas deve ser inspecionada.
- Criar o runtime aprovado somente após essa reconciliação.
- Habilitar de forma controlada uma conta piloto no Firebase Auth.
- Conceder ao App Hosting a identidade IAM mínima necessária e executar
  testes reais de autorização entre Casas A e B.
- Configurar as três variáveis no ambiente do Firebase App Hosting,
  publicar e comprovar sucesso com token real.

**Não confundir build verde com aprovação de corte.**
`readyForCutover=false` até todos os controles acima serem verificados.
