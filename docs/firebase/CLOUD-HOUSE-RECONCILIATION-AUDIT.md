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


## Verificação do encadeamento de compras (complemento)

O diagnóstico autorizado do Narrador também executa, na **mesma transação de leitura**, uma consulta privada de eventos `campaignCloudRuntime/<snapshot>/houseConstructionAudits` filtrada por `houseId`. Exige todos os eventos da versão operacional (limite defensivo de 500; mais registros exigem paginação administrativa antes da auditoria, e **não** passam automaticamente). O cliente recebe apenas status, total e até 25 eventos resumidos com versão, item e data fictícia da campanha.

A função pura `verifyConstructionLedger` exige:

1. Nenhum evento duplicado, omitido ou acrescentado em relação à versão operacional atual; cada evento corresponde à Casa e ao snapshot.
2. Identificação idempotente correta: `sha256('construction-purchase:'+actorUid+':'+requestKey)` e posse `sha256('construction-holding:'+eventId)`; verifica os hashes sem retornar UID ou chave ao navegador.
3. Versões 1…N completas, cada `expectedVersion=version-1`, e `beforeStateHash` ligado ao `afterStateHash` da etapa anterior.
4. O primeiro hash corresponde à origem histórica, o último ao hash do estado operacional; `lastConstructionEventId` referencia o evento final.
5. Atributos essenciais do evento (tipo, ID do catálogo/domínio, custos finitos, dados, data Harptos registrada, data do servidor e metadados de origem) estruturalmente válidos.

`verifiedHashChain=true` significa **apenas** que a cadeia criptográfica e de versões está completa e autoconsistente. **Não prova** a reexecução do motor `quote/purchase` em cada versão, os efeitos econômicos históricos, a autenticidade de atores antigos, IAM ou uma mudança real no banco. O campo `economicReplayVerified` permanece sempre `false`, o `auditHistoryVerified` geral permanece `false`, `readyForCutover=false` e compras seguem bloqueadas. Não existe busca entre Casas, gravação de eventos ou modificação de snapshot.

A consulta falha fechada se faltar permissão, índice, estado, eventos ou houver versão/hashes divergentes. Um erro de consulta exibe "não verificado", jamais "aprovado".

Testes:
- `firebase-construction-ledger-verification.test.ts`: cenários de cadeia íntegra, fraude no UID/ID/posse, alterações de hash, eventos faltantes, extras, fora de ordem, relógio, dados, custos e limite.
- `firebase-house-reconciliation-audit.test.ts`: leitura transacional privativa do Narrador com ledger zero ou um evento, bloqueio de lacunas e não divulgação de UID.
- `FirebaseHouseReconciliationAudit.test.tsx`: apresentação segura de verificação parcial, sem controles de compra ou autorização.


## Reexecução econômica canônica (nova etapa)

A transação de reconciliação agora também pode **reexecutar** as compras registradas, desde que a cadeia privada de hashes esteja íntegra. O verificador importa o catálogo e o motor oficial de construções, começa com a ficha histórica original, recalcula uma cotação por compra, verifica os custos efetivos e aplica a operação com as rolagens de dados gravadas pelo servidor. Compara o hash completo do resultado de **cada** operação e o hash final da ficha operacional. Nenhuma alteração é persistida.

### Novos eventos (contrato de auditoria)

O serviço de compras (que **permanece desligado**) grava adicionalmente em cada novo evento de auditoria privado:

- \`replaySchemaVersion: 1\` — versão do contrato;
- \`catalogVersion\` — versão exata da regra do item;
- \`replayInput\` — nome normalizado e apenas vínculos opcionais permitidos: \`parentId\`, \`supportId\`, \`replaceId\` e \`weaponSpecialty\`.

Esses campos **não** aparecem na resposta pública ou nos resultados do Narrador. O verificador reconstitui a impressão digital da requisição original \`sha256({uid,...request})\` com o hash canônico normalizado; qualquer modificação dos parâmetros, catálogo ou custos falha fechada. Os eventos históricos sem \`replayInput\` são imutáveis e retornam \`legacy_inputs_missing\`; não são considerados comprovados por inferência.

### Limites e garantia

- Somente o Narrador administrador, com Firebase Auth revogado verificado, pode iniciar o diagnóstico — mesma rota e mesma flag desligada do PR #538.
- Só há replay se a cadeia do PR #539 estiver íntegra; limite conservador de **50 compras por Casa** por consulta. Histórico maior resulta em \`replay_limit_exceeded\`, não em resultado parcial válido.
- Os resultados \`verified_purchase_replay\`, \`legacy_inputs_missing\`, \`recorded_cost_mismatch\`, \`catalog_version_changed\`, \`request_fingerprint_mismatch\`, \`replayed_state_mismatch\` e \`final_state_mismatch\` distinguem reexecução verificada de condições não auditadas.
- \`economicReplayVerified\` refere-se somente à reconstrução de eventos de **compra de construção pelo catálogo atual correspondente**. Não comprova validade histórica de credenciais, permissões IAM, efeitos de eventos fora do motor de compras, evolução temporal não registrada nem integridade das fontes externas.
- \`auditHistoryVerified\` geral e \`readyForCutover\` permanecem **false**, inclusive se a reexecução terminar com sucesso. Nenhuma habilitação de compra, nova importação, mudança de IAM, regra ou flag ocorre neste PR.

### Validação

A suíte \`firebase-construction-economic-replay.test.ts\` usa o motor GoT para gerar um resultado legítimo com duração aleatória fixada no teste, refaz a compra e compara os hashes. Testes de falha cobrem eventos legados sem entradas, adulteração de nomes e vínculos, catálogos diferentes, custo incorreto, estados divergentes e limite de processamento. Os testes transacionais do próprio serviço de compra também comprovam que novos eventos gerados podem ser reproduzidos a partir do snapshot histórico, sem escrita adicional.
