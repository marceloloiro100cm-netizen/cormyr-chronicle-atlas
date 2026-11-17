# Bootstrap dos runtimes desativados

Esta etapa somente prepara a estrutura inativa no Firebase. Nao libera jogadores ou novas mensagens.

O importador verifica um snapshot privado unico, seis etapas principais, migracao do Storage e calendario historico valido. Em modo preview, zero escritas. Em modo apply, apos aprovacao humana do ambiente firebase-auth-test-activation e confirmacao literal CREATE_DISABLED_CORMYR_RUNTIME_DRAFTS, uma transacao cria dois documentos com status=pending.

O documento campaignCloudRuntime/<snapshot> tem private=true, sourceSnapshotReconciled=false, applicationEnabled=false, mailWriteApproved=false, publicCatalogApproved=false, publicTranslationsApproved=false e publicTimeApproved=false. O documento campaignMailRuntime/<snapshot> tem private=true, sourceLiveReconciled=false, applicationEnabled=false e mailEnabled=false.

Nao define openRound ou calendarVersion, nao grava dados das Casas, nao altera Auth, IAM, Firestore Rules, Storage, historicos, permissoes ou usuarios. Se qualquer destino existir ou qualquer condicao da fonte falhar, nao grava nada.

O controlador GitHub da issue #568 aceita "Cormyr Ops | runtime-draft | 00000009" e solicita o workflow protegido, mas NAO burla Review deployments. A aprovacao humana ainda e necessaria.

Ficam pendentes: catalogo publico revisado, delta atual da fonte, integridade Storage, rodada aberta, cadastros e testes Cloud autenticados. releaseDecision=NO_GO.
