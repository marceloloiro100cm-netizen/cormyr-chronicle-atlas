# Item 5: regras operacionais da Casa

O Narrador edita o catálogo na Ficha original. Cada adaptação contém
**houseId**, **requestKey** e **expectedVersion**. A API
`POST /api/firebase-house-rules` verifica Firebase Auth, papel atual de Narrador,
Casa da temporada 2, raiz operacional reconciliada e autorização
`houseRulesWriteApproved=true` no runtime.

Dados operacionais são gravados em:
- `campaignCloudRuntime/{snapshot}/houseRuleSets/{digestCasa}/rules/{digestRegra}`;
- `campaignCloudRuntime/{snapshot}/houseRuleRequests/{digest}`;
- `campaignCloudRuntime/{snapshot}/houseRuleAudits/{digest}`.

Cada transação cria auditoria imutável e não altera
`migrationDomainStage`, `migrationNobleHouseStage` nem os custos de compras
já existentes. O workspace combina catálogo base, regras importadas e
adaptações da Casa, mantendo a precedência da adaptação operacional.
A cotação passa a usar o mesmo catálogo, apenas quando o recurso é habilitado.

A flag `CORMYR_FIREBASE_HOUSE_RULES_ENABLED=false` permanece fechada.
Para liberar, ainda são necessários o aceite no Firebase real, conciliação da
configuração do runtime e testes reais do Narrador e de um jogador sem
permissão. O item 4 da Ficha permanece independente e não é liberado aqui.

## Avanço de 20/11/2026 — liberação por capacidade efetiva

- Introduzida a flag independente `CORMYR_FIREBASE_HOUSE_RULES_READ_ENABLED=true`, que permite consultar adaptações operacionais somente pelo workspace Firebase já autorizado para aquela Casa. **Não concede escrita**: `CORMYR_FIREBASE_HOUSE_RULES_ENABLED=false` continua bloqueando o endpoint de mutação.
- A leitura rejeita adaptações com `sourceSnapshotId` divergente. O servidor emite `houseRulesWritable` somente se forem verdadeiros o privilégio atual de Narrador, a reconciliação do runtime, `houseRulesWriteApproved` e a flag de gravação.
- O editor da Ficha mostra modo de consulta quando a gravação não foi homologada. Ao salvar futuramente, preserva a versão do recibo para edição subsequente sem reutilizar uma versão antiga.
- Não altera regras importadas nem as compras históricas. Antes de habilitar a gravação faltam testes reais do Narrador, usuário sem privilégios, isolamento de Casas e confirmação da publicação no Firebase App Hosting.
