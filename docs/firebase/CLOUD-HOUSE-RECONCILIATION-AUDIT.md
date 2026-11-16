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


## Reexecução econômica determinística (complemento)

O diagnóstico privado do Narrador agora tenta reproduzir eventos de compras usando os mesmos módulos canônicos de orçamento e regras: `previewHouseConstruction`, `findItem`, `purchase`, `calculateFirebaseHouseEconomy` e `constructionStateHash`.

**Dados exigidos:** os novos eventos criados pelo servidor incluem `replaySchemaVersion=1`, `catalogRuleVersion=item.version` e `purchaseInput` com o pedido normalizado completo (nome escolhido, casa, item, domínio, versão esperada, chave idempotente e vínculos opcionais de posse e especialidade). Esses campos são gravados apenas no registro privado do Firestore, não no retorno para Jogador.

**Fluxo seguro:** exige antes a cadeia de hashes íntegra, começa da ficha histórica imutável, verifica o fingerprint original `sha256(JSON canônico de {uid,...purchaseInput})`, compara catálogo atual com a versão de regra registrada, recalcula a prévia e custos, reutiliza somente os dados de duração que foram sorteados pelo servidor e invoca o motor de compras. Após cada compra, confirma o hash intermediário. A última etapa deve reproduzir o mesmo estado operacional.

**Limitações essenciais:**
- Eventos antigos sem `purchaseInput` e `catalogRuleVersion` retornam `missing_replay_metadata`. Não se deve inferir parâmetros olhando as posses atuais, editar os eventos antigos ou marcar replay como aprovado.
- Uma alteração posterior das regras do catálogo resulta em `catalog_version_changed`; não se tenta substituir regras históricas inexistentes.
- Modificações operacionais efetuadas por outros módulos sem eventos de compras correspondentes podem gerar divergência: não se normaliza nem corrige silenciosamente o estado real.
- `economicReplayVerified=true` apenas comprova reprodução **com a versão atual e identificada do motor** dos eventos completos fornecidos na mesma transação. Não comprova proveniência assinada, permissões de usuários antigos, IAM, prontidão de autenticação, sincronização de outros módulos ou cutover.
- `auditHistoryVerified=false` (aprovação global), `readyForCutover=false` e nenhuma flag de compras alterada.

Os testes sintéticos exercitam uma compra de torre usando o motor real, casos sem metadados, fingerprint adulterado, custos divergentes, mudança de catálogo, estado inventado e relatórios não autorizados. A implementação **não acessa Supabase, não exige Cloud Shell e não grava dados reais**.
