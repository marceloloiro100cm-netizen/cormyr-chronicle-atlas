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


## Consulta e liberação progressiva — 20/11/2026

A leitura do catálogo operacional passou a ter uma chave separada:
`CORMYR_FIREBASE_HOUSE_RULES_READ_ENABLED=true`. Ela não concede acesso
anônimo: os leitores do workspace e das cotações continuam verificando
Firebase Auth, perfil e Casa autorizada. Caso exista adaptação operacional,
ela prevalece sobre a regra importada sem reescrever a regra original;
o catálogo de cotação utiliza a mesma precedência que a Ficha.

A gravação continua condicionada à flag independente
`CORMYR_FIREBASE_HOUSE_RULES_ENABLED=false`, à identidade de Narrador
revalidada na transação, à Casa ativa, à versão e chave idempotente e ao
`houseRulesWriteApproved=true` do runtime reconciliado. O editor original
mostra modo de consulta e não oferece confirmação de alteração quando
a gravação não está aprovada. A auditoria OIDC agora relata também a
aprovação corrente de regras do runtime (somente booleano, sem dados da Casa).

Não liberar a escrita sem teste real Narrador contra Jogador, comparação de
cotações antes/depois da regra e confirmação de que compras históricas não
sofrerão recálculo.
