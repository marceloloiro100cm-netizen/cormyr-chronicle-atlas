# Firebase Cloud — auditoria administrativa da reconciliação econômica (por Casa)

## Objetivo e situação

O Narrador passa a ter um **diagnóstico administrativo por Casa** ao selecionar uma Casa em `/firebase-access`, sem acessos pelo navegador às coleções privadas do Firestore e sem mutações. A implementação prepara a reconciliação de `houseEconomies`, mas **não executa importação, seed, aprovação ou alteração de IAM**.

O endpoint é `POST /api/firebase-house-reconciliation-audit` com corpo exclusivo `{"action":"inspect","houseId":"..." }`.

Essa ferramenta é de **inventário de pendências**: mesmo que indique `seed_consistent` ou `operational_document_consistent`, o resultado **não certifica cadeia de auditoria dos eventos, IAM, contas, testes reais, regras Firestore ou cutover**. O campo `readyForCutover` é invariavelmente `false`, e `auditHistoryVerified` também.

## Proteções

- A flag de servidor `CORMYR_FIREBASE_CLOUD_RECONCILIATION_AUDIT_ENABLED=true` é necessária além de `CORMYR_FIREBASE_CLOUD_READ_ENABLED=true` e do snapshot SHA-256 fixo. A flag de auditoria **não foi ativada**.
- O token Firebase é verificado com revogação e o status da conta é conferido pelo servidor. **Apenas Narrador administrador** com os vínculos `memberHouseIds` e `editHouseIds` vazios é autorizado. Jogador, Editor, conta desabilitada e perfil inconsistente recebem erro 403 ou 401.
- O serviço consulta as quatro raízes privadas, acesso, Casa, ficha histórica, calendário oficial, runtime e ficha operacional **na mesma transação somente leitura**.
- O relatório contém apenas identificador/nome da Casa, versões da ficha, motivo principal de bloqueio, presença de flags privadas e booleans de integridade; não revela `state`, hashes, notas, UID, chaves, auditorias, recursos de outras Casas ou metadados administrativos privados.
- Falta de estágio, ficheiro de origem, runtime, seed, hash, versão, mês ou recurso resulta em diagnóstico, jamais em preenchimento automático. Nada altera `migration*`, `campaignCloudRuntime`, Firestore Rules, Auth, IAM ou Storage.
- Sem Cloud Shell, Supabase ou acesso direto a produção nesta entrega.

## Como interpretar o diagnóstico

| Resultado | Interpretação |
| --- | --- |
| `stage_incomplete` | Raízes privadas da migração ainda não aprovadas |
| `house_unavailable` / `sheet_unavailable` | Casa ou ficha histórica indisponível |
| `calendar_unavailable` | Calendário Harptos inválido ou ausente |
| `source_invalid` | Estado de origem não passou pelo motor econômico |
| `runtime_unreconciled` | Runtime ainda não conciliado |
| `operational_missing` / `operational_unverified` | Seed da Casa ausente ou incompleta |
| `sheet_version_mismatch` | Versão da origem alterada |
| `source_hash_mismatch` / `operational_hash_mismatch` | Integridade divergente |
| `seed_mismatch` | Versão operacional zero difere da origem |
| `calendar_mismatch` | Mês da ficha operacional difere do calendário |
| `economy_invalid` | Motor econômico rejeitou o estado |
| `seed_consistent` | Seed inicial coerente; **sem autorização de cutover** |
| `operational_document_consistent` | Hash e motor coerentes, mas **ledger não foi auditado** |

A enumeração é por Casa e não representa um percentual real das Casas sem executar a leitura sobre todas elas. Mesmo que o documento esteja consistente, compras reais exigem a reconciliação global, testes reais, aprovações administrativas e solução da pendência de IAM [#513](https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas/issues/513).

## Testes e CI

- `src/lib/house/firebase-house-reconciliation-audit.test.ts`: autorização exclusiva do narrador, conta desabilitada, ambiente desligado, filtros, estágio, calendário, seed ausente, versões e hashes alterados, imóvel histórico, versão 1 sem falsa prova de ledger, sem nenhuma escrita.
- `src/components/houses/FirebaseHouseReconciliationAudit.test.tsx`: resultado não habilitado, status seguro, separação entre Casas, ausência de botões de compra/ativação.

As verificações ocorrem por GitHub Actions no ambiente de testes isolados; o código de auditoria permanece **inativo por padrão** após merge.
