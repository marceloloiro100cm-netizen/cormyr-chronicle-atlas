# Calendário público — leitura somente Firebase

A rota anônima `GET /api/public/time` agora é **Firebase-only**. Não chama Supabase, não consulta tabelas SQL antigas e não usa qualquer credencial legada. Ela utiliza o Admin SDK do Firebase **somente no servidor**, com identidade padrão do App Hosting e resposta estritamente projetada.

## Critérios que precisam coincidir

A publicação é **desabilitada por padrão**. Só será elegível quando:

1. A variável de runtime `CORMYR_FIREBASE_PUBLIC_TIME_ENABLED=true` estiver explicitamente configurada e `CORMYR_FIREBASE_SNAPSHOT_ID` for um hash SHA-256 válido e já reconciliado. Nenhuma variável é habilitada por este PR.
2. O documento privado `campaignCloudRuntime/{snapshotId}` existir, com `status=active`, `private=true`, `sourceSnapshotId={snapshotId}`, `sourceSnapshotReconciled=true`, `applicationEnabled=true` e `publicTimeApproved=true`.
3. O mesmo runtime contiver `calendarVersion` e `publishedTimeVersion` inteiros, iguais e maiores ou iguais a 1.
4. A etapa histórica `migrationTimeEngineStage/{snapshotId}` existir e registrar `status=complete`, `private=true`.
5. O documento histórico `migrationTimeEngineStage/{snapshotId}/calendar/current` existir e sua versão ser **exatamente** `publishedTimeVersion`. Ano, mês, dia e festival passam pela validação estrita da data de Harptos.

Essa dupla aprovação evita usar automaticamente um snapshot privado ou uma data histórica não publicada. Em caso de falta de qualquer dado, flag desativada, data inválida, erro IAM ou conexão com emulador, a resposta é **503 JSON**, `Cache-Control: no-store`, sem identificar caminhos, segredos, hashes ou o motivo privado.

A resposta pública, quando aprovada, contém **somente** `year`, `month`, `day`, `festival`, `version`, `date`, `period` e `label`. Nunca contém fichas das Casas, missivas, IDs, identidades, saldos, notas ou metadados privados.

## Estado inicial e dependências

Este PR **não** altera Firestore, IAM, usuários, regras, runtime nem ativa variáveis. Por isso **não promete que o calendário público devolverá HTTP 200 imediatamente**. A auditoria recente mostra `503` em várias rotas públicas; essa falha persiste até que dados e publicação Cloud tenham sido homologados.

A rota antiga dependia de `SUPABASE_URL` e de `get_public_campaign_time`; essas dependências foram eliminadas **desta rota**. Outras rotas públicas e autenticações legadas ainda precisam ser migradas separadamente. Não restaurar chaves Supabase no `apphosting.yaml` para mascarar este bloqueio.

O Admin SDK ignora as Firestore Security Rules, portanto a verificação server-side do documento de publicação e a whitelist da resposta são **obrigatórias**, não opcionais. Nunca abrir o documento histórico ou o runtime diretamente ao navegador.

## Testes

`src/lib/calendar/firebase-public-time.server.test.ts` cobre publicação válida, ausência de campos privados, flag desativada, snapshots inválidos, emuladores, runtime ausente/não reconciliado, ausência da aprovação, versão divergente, estágio privado incompleto e datas impossíveis.

A prova E2E de produção ainda depende de reconciliar o Firebase Cloud, permissões IAM, identidades de Narrador e jogadores, calendário oficial, dados e testes de isolamento; `readyForCutover=false` continua.
