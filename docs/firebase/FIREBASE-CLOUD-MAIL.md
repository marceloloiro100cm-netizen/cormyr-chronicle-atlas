# Firebase Cloud — missivas transacionais (primeira escrita real)

**Sem Supabase.** Esta etapa acrescenta uma API cloud
`POST /api/firebase-cloud-mail`, integrada ao portal
`/firebase-access`. Os imports `migration*Stage` continuam privados e
**imutáveis**. A escrita nova usa somente
`campaignRuntime/<snapshot>/letters/<idempotency-hash>`, ao lado de
`mailQuotas/<uid-hash>`. Os jogadores nunca acessam essas coleções
diretamente pelo SDK cliente.

## Status e ativação

Este código é **seguro para integrar desativado**. Enquanto não ocorrerem
todas as verificações abaixo, retornará HTTP 503 e o formulário de envio
permanecerá oculto:

1. `CORMYR_FIREBASE_SNAPSHOT_ID`: hash de 64 caracteres da importação
   validada, somente na configuração do App Hosting.
2. `CORMYR_FIREBASE_CLOUD_READ_ENABLED=true` para a API de leitura.
3. `CORMYR_FIREBASE_CLOUD_MAIL_WRITE_ENABLED=true` somente após conclusão
   do corte e validação de regras/IAM de backend.
4. O documento `campaignRuntime/<snapshot>` **deve ter sido criado
   exclusivamente por um operador privilegiado**, após reconciliação:
   ```json
   {
     "status":"active",
     "mode":"firebase-only",
     "private":true,
     "sourceSnapshotId":"<HASH DO SNAPSHOT>",
     "writesEnabled":true,
     "sourceLiveReconciled":true,
     "readyForCutover":true,
     "calendarVersion":8
   }
   ```
   O número de versão acima é apenas um exemplo; deve corresponder à
   versão real de `migrationTimeEngineStage/<snapshot>/calendar/current`.
   **Não copiar este JSON para produção sem realizar os testes e a
   reconciliação dos dados.**
5. As coleções `migrationDomainStage`, `migrationAuthStage` e
   `migrationTimeEngineStage` precisam estar com
   `status=complete, private=true`.
6. Conta Firebase Auth habilitada, token não revogado, vínculo
   `migrationDomainStage/.../access/<uid>` ativo, perfil válido e senha
   já alterada. Narrador pode enviar somente a Casas; jogadores precisam
   ter `editHouseIds` para a Casa remetente e podem endereçar a Casas ou
   ao Narrador. Editor não envia.

O código **não inicializa** este documento automaticamente, não ativa
contas, não muda regras do Firestore nem cria privilégios IAM. Não usar
`readyForCutover=true` como atalho para publicar dados ainda não
reconciliados. Até o corte, `CORMYR_ARCHIVE_ONLY=true` mantém todas as
outras APIs legadas bloqueadas.

## Semântica de envio

- Uma carta entregue por comando, exclusivamente por POST no mesmo
  domínio e com token Firebase Auth no cabeçalho Authorization.
- Data da campanha obtida do calendário verificado no servidor, nunca
  do formulário; a versão do calendário precisa corresponder ao
  documento de ativação.
- Transação Firestore faz leituras de controle de acesso, Casas,
  ativação, chave idempotente e quota **antes** das escritas.
- Chave idempotente UUID por tentativa: repetir exatamente o envio não
  duplica a carta; mudar o conteúdo com a mesma chave gera conflito 409.
- Máximo de 50 cartas por dia por usuário e intervalo mínimo de 5
  segundos entre entregas; assunto até 180 bytes e corpo até 20.000 bytes.
- Histórico migrado nunca é editado. Novas cartas são projetadas na
  caixa de entrada do remetente, das Casas destinatárias e do Narrador,
  respeitando o acesso vigente.
- A interface mostra o formulário somente quando o servidor confirma
  `mailWriteAvailable=true`; não indica que jornal, Espionagem,
  Batalhas ou fichas possam ser escritos.
- Não executa autoenvio, Cloud Scheduler, sincronização Drive, jobs
  periódicos ou notificações.

## Testes e rollback

O CI valida as regras com dados inteiramente sintéticos, incluindo
acesso cruzado, conta desativada, Editor, rascunho, revogação,
controle de quota, idempotência, calendário e ausência do documento
de ativação. Depois do corte, efetuar testes **reais** com contas
autorizadas e uma Casa proibida, antes de expandir o acesso.

Para suspender o novo envio, desativar a flag do App Hosting e,
se necessário, a chave `writesEnabled` do runtime. Isso mantém as
cartas já enviadas, sem apagar nem sobrescrever o histórico.
