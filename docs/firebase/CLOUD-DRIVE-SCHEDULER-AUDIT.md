# Drive Scheduler — primeira fronteira Firebase Cloud (sem Supabase)

O endpoint histórico `POST /api/public/jobs/drive-sync` foi
desvinculado de `authenticateCronRequest`, `supabaseAdmin`,
`runDriveSync` e `updatePublicArchive`. Agora lê somente o estágio
`migrationDriveSyncStage/<snapshot>` por Firebase Admin, condicionado a
aprovação separada. A implementação **não finge que executou
sincronização em duas vias**.

## API restrita

É necessário um `Authorization: Bearer <CRON_SECRET>` forte (mínimo
32 caracteres), com `CRON_SECRET_PREVIOUS` opcional para rotação.
Comparação constante em SHA-256, sem saída de tokens em logs. Rejeita
cookies, origens cross-site, query string, corpos excessivos,
`Content-Encoding` e métodos diferentes de POST.

- `{"kind":"audit"}` verifica somente contagens reconciliadas do estágio
  privado. Resposta `mode=audit_only`, `cloudWrites=0`,
  `readyForReconciliation=false`. Exige
  `CORMYR_FIREBASE_DRIVE_AUDIT_ENABLED=true` e
  `CORMYR_FIREBASE_SNAPSHOT_ID` no servidor. Ambas seguem desativadas
  ou não configuradas neste lote.
- `{"kind":"reconcile"}`, chamada pelo scheduler legado, retorna
  HTTP **503** `firebase_drive_write_not_authorized`. Isso impede
  que um callback antigo retorne sucesso para algo que **não fez**.

Para `audit`, o documento `campaignCloudRuntime/<snapshot>` deve
ser ativo/privado, corresponder ao snapshot, estar reconciliado e ter
`driveAuditApproved=true`. O estágio `migrationDriveSyncStage`
deve ser completo/privado, formato 1, com contagens inteiras válidas
de `bindings`, `files`, `inbox`, `outbox` e `conflicts`.

## O que ainda falta para o sync real

1. Importar e reconciliar todos os mapeamentos Drive a partir da fonte
   vigente; confirmar pastas, vínculos, revisões e identidade dos donos.
2. Conectar a identidade Google Drive oficial ao App Hosting sem
   inserir OAuth secrets em commits públicos.
3. Implementar transações Firestore de lease/outbox, suporte a
   conflitos de versão/ETag, idempotência e rotinas de importação/exportação
   de registros, missivas e respostas já modeladas no emulador.
4. Homologar Drive real, Auth e direitos por Casa, prevenir sobrescrita
   de fontes não revistas, configurar a identidade do Cloud Scheduler,
   criar o job e confirmar execução.
5. Só então habilitar o cron Cloud e disponibilizar uma resposta
   `reconcile` de execução real.

O projeto usa `CRON_SECRET` no Secret Manager do App Hosting; nenhum
valor foi lido, definido ou impresso. **Não criamos agendamento real
e não sincronizamos Drive em produção.** O endpoint fica seguro e
desacoplado da Supabase. Issue #513 e `readyForCutover=false`
continuam aplicáveis.
