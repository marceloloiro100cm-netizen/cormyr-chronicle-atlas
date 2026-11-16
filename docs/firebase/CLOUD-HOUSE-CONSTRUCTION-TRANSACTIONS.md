# Firebase Cloud — compras transacionais de construções (pré-ativação)

## Situação e isolamento

O novo endpoint `POST /api/firebase-cloud-construction` possui implementação de transação, mas **não está habilitado**. Não existe botão de compra na visão Firebase dos jogadores nesta entrega. A simulação de custos continua somente leitura.

**Este lote não habilita compras em produção**, não migra nem altera dados históricos, e não realiza nenhuma operação no Supabase ou Cloud Shell. `readyForCutover=false` permanece e a issue #513 deve continuar pendente até a verificação administrativa.

## Protocolo transacional

O cliente pode fornecer exclusivamente `action=purchase`, `requestKey`, `houseId`, `expectedVersion`, `itemId`, `domainId`, `name`, e os relacionamentos opcionais `parentId`, `supportId`, `replaceId`, `weaponSpecialty`. **Não pode** informar custo, desconto, saldo, versão da ficha, estado, data de campanha, resultado de dados, ID da nova construção ou proprietário.

1. Firebase Admin valida o token Auth com checagem de revogação e status de conta; busca o escopo privado em `migrationDomainStage/<snapshot>/access/<uid>`.
2. Autoriza somente Narrador ativo administrador sem vínculos indevidos ou jogador ativo com a Casa presente **simultaneamente** em `memberHouseIds` e `editHouseIds`; editor e terceiros não têm escrita.
3. Em **uma transação Firestore** relê as quatro raízes imutáveis de migração, casa e ficha importadas, relógio canônico, runtime aprovado, ficha operacional e evento idempotente.
4. Exige arquivo operacional pré-provisionado e conciliado com hash estrutural da origem, `sourceSheetVersion`, `sourceSnapshotId`, `seedVerified`, estado ativo, hash atual e relógio oficial alinhado. Em versão operacional zero, o hash completo do estado deve coincidir com a fonte. Não cria seed.
5. Reexecuta `previewHouseConstruction` (motor `quote` oficial) **dentro da transação**. Se houver impedimento, preço inválido, catálogo pendente, falta de recursos, referência de domínio incorreta ou estado incompleto, aborta.
6. Os dados de duração são sorteados no **servidor** usando `crypto.randomInt`. O motor canônico `purchase` produz o próximo estado, revalidado pelos balanços oficiais; não se aceita dado trazido do navegador.
7. Compara `expectedVersion` (CAS), atualiza exclusivamente `campaignCloudRuntime/<snapshot>/houseEconomies/<houseHash>` e cria `houseConstructionAudits/<eventId>` na mesma transação: valor antes/depois por hash, custos, rolagem, ação, UID, Casa, versão, data Harptos e instante.
8. Repetir exatamente a mesma operação com a mesma chave devolve o evento existente e não duplica construção; reutilizar a chave para outro comando retorna HTTP 409.

A ordem do Firestore é **todas as leituras antes de qualquer escrita**. Transações concorrentes que usam a mesma versão devem ser resolvidas pelo CAS do Firestore. Não existe fallback para Supabase ou escrita de snapshots `migration*`.

## Portões para futura homologação

Dois portões **independentes** devem ser aprovados deliberadamente, após testes reais:

- Ambiente App Hosting: `CORMYR_FIREBASE_CLOUD_READ_ENABLED=true` e `CORMYR_FIREBASE_CLOUD_CONSTRUCTION_ENABLED=true`, com `CORMYR_FIREBASE_SNAPSHOT_ID` SHA-256 fixo. A segunda flag está desligada por padrão.
- Documento `campaignCloudRuntime/<snapshot>`: `status=active`, `private=true`, `sourceSnapshotId=<snapshot>`, `sourceSnapshotReconciled=true`, `applicationEnabled=true`, `constructionWriteApproved=true`, `constructionSeededVerified=true`, `calendarVersion` coincidente com o calendário.

Cada Casa precisa, **fora da API de jogador**, de um documento em `houseEconomies/<sha256('house:' + houseId)>` com:

```text
houseId, status='active', private=true
sourceSnapshotId=<snapshot>, sourceReconciled=true, seedVerified=true
sourceSheetVersion=<versão da ficha importada>
sourceStateHash=<constructionStateHash(sheet.state)>
stateHash=<constructionStateHash(state operacional)>
version=0
state=<cópia integral e fiel da ficha original>
```

A função `constructionStateHash` canoniza JSON antes de calcular SHA-256; não basta estimar uma hash de bytes do export.

**Não preencher automaticamente** flags ou documentos acima: a reconciliação depende de auditoria administrativa e comparação dos arquivos reais, incluídas as regras de privacidade IAM/Firestore e o estado das contas.

## Limites conhecidos antes do uso real

- A visão de Casa em `/firebase-access` ainda consulta a **ficha histórica**; ela não lê nem edita o estado operacional. É necessário adicionar uma leitura autorizada de `houseEconomies` antes de expor compras.
- O Tesouro operacional do PR #527 é independente. A compra opera somente os **sete recursos** e posses do estado da Casa, não desconta ou credita o Tesouro.
- O motor canônico atualmente executa substituição/evolução segundo sua regra vigente; não criar uma segunda regra especial de devolução de recursos sem análise.
- Não executa avançar tempo nem concluir projetos. O cronograma do PR #533 continua informativo.
- Testes de dados reais, concorrência, papéis e revogação devem preceder a aprovação das duas flags e do cutover.

## Testes automatizados

`src/lib/house/firebase-construction-transaction.test.ts` valida: controles de ambiente, seed e snapshot, execução atômica e auditoria, dados sorteados no servidor, reenvio idempotente, CAS, permissão por Casa, editor, catálogo e input malformado, referência de posse alheia, e bloqueio quando o relógio não está conciliado. Os testes usam Firestore sintético em memória e não alteram os dados reais.

O CI deve passar em **Build check** e **Validate**, além dos contratos Firebase isolados, antes de considerar a branch integrada.
