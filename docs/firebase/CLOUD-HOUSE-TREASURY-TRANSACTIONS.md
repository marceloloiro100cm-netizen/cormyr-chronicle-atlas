# Firebase Cloud — primeiro lançamento transacional do Tesouro

## Estado da implementação

O portal `/firebase-access` contém uma seção **Tesouro operacional · Narrador**
e a API `POST /api/firebase-cloud-treasury` com `status` e `adjust`.
Elas são **desabilitadas por padrão**. Este lote **não autoriza** compras
de construções nem altera os sete recursos oficiais (Defesa, Influência,
Terras, Lei, População, Poder e Riqueza).

O campo `HouseState.treasury` do snapshot continua imutável. A escrita
utiliza exclusivamente
`campaignCloudRuntime/<snapshot>/houseTreasuries/<sha256("house:"+houseId)>`,
com auditoria em `houseTreasuryAudits`. O cliente não tem acesso direto
a essas coleções: exclusivamente Firebase Admin no servidor.

## Garantias da transação

- Token Firebase Auth verificado com revogação e usuário habilitado.
- Apenas perfil **Narrador** ativo com `admin=true`; jogador e editor
  não podem executar sequer a consulta operacional.
- Raízes privadas de autenticação, domínio, casas nobres e Hub Temporal
  precisam estar `status:complete`.
- A Casa precisa ser ativa, da temporada 2 e identificada pelo servidor.
- A ficha fonte deve ter `houseId`, `version` e `state.treasury`
  íntegros (inteiro não negativo), sem conversão de string para número.
- Um documento de Tesouro operacional já deve existir. **A aplicação
  nunca cria nem reconcilia esse documento**. Exige vínculo com o mesmo
  snapshot, a mesma versão de ficha e marcações de reconciliação.
- Na versão operacional 0, o saldo inicial precisa coincidir exatamente
  com `state.treasury` da fonte. Não inventar zero quando estiver ausente.
- Lançamentos exigem `expectedVersion`, alteração inteira limitada
  de -10.000 a +10.000 por pedido, justificativa e chave idempotente.
  Não permitir saldo negativo nem superior a 1.000.000.000.
- Escrita via transação Firestore de `balance`, `version` e evento
  `houseTreasuryAudits`, com versão CAS, data do calendário Harptos,
  identidade confiável e timestamp. Uma repetição idêntica retorna o
  lançamento original; outra operação com a mesma chave recebe HTTP 409.
- Todas as leituras precedem quaisquer escritas, inclusive na execução
  que já reconhece uma chave antiga; nenhum documento `migration*`
  é modificado.

## Portões independentes de produção

A operação só entra em modo operacional depois de **todos** estes itens:

1. Servidor App Hosting configurado explicitamente com
   `CORMYR_FIREBASE_CLOUD_TREASURY_ENABLED=true`,
   `CORMYR_FIREBASE_CLOUD_READ_ENABLED=true` e
   `CORMYR_FIREBASE_SNAPSHOT_ID` verificado.
2. Raízes privadas e associação UID/Casa homologadas no Firebase Auth
   e Firestore real, sem reabilitação em lote de usuários.
3. Documento `campaignCloudRuntime/<snapshot>`, provisionado
   administrativamente **fora da API**, com:
   `status=active`, `private=true`, `sourceSnapshotId` igual à fonte,
   `sourceSnapshotReconciled=true`, `applicationEnabled=true`,
   `treasuryWriteApproved=true`, `treasurySeededVerified=true`,
   `calendarVersion` igual ao calendário oficial.
4. Cada documento de `houseTreasuries` deve ser criado em processo
   administrativo verificado e auditado: `houseId`, `status=active`,
   `private=true`, `sourceSnapshotId`, `sourceReconciled=true`,
   `sourceSheetVersion`, `balance` e `version`.
5. Testes reais de autorização e revogação Narrador/Jogador/Editor,
   conciliação das fontes, rollback e dupla submissão.

Nenhuma dessas flags foi ativada neste lote. **Não provisionar
automaticamente** o runtime: ele representa a autorização final de
mutação de dados e exige revisão administrativa.

## Itens fora de escopo

- O valor operacional não altera automaticamente o `state.treasury`
  preservado. A seção distingue ambos para evitar inconsistências.
- Não altera recursos permanentes, recursos disponíveis, unidades,
  posse, construções, projetos, descontos, custos nem o motor `balances`.
- A próxima migração econômica deve compartilhar o motor canônico de
  regras para compras/alocações, possuir ledger e comparar o estado
  esperado antes de atualizar uma ficha operacional.
- `readyForCutover=false` permanece. Permissões IAM/Firestore pendentes
  na issue #513 não foram alteradas.

## Testes

`node --test scripts/firebase/cloud-house-treasury-service.test.mjs`

O arquivo de teste é integrado às ações **Validate** e
**Firebase cross-domain acceptance (contracts)**. Usa somente
fixtures sintéticas e uma implementação de Firestore em memória;
não utiliza Cloud Shell ou dados particulares.
