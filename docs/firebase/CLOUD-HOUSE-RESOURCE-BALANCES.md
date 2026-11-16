# Firebase Cloud — balanço consolidado dos sete recursos (somente leitura)

## Objetivo

O portal `/firebase-access` apresenta o **balanço consolidado** de cada
Casa que já tenha sido autorizada no servidor. Para os sete recursos de
Cormyr, mostra **Total, Alocado, Comprometido e Disponível**.

O cálculo usa exatamente o motor canônico
`src/lib/house/engine.ts` via `balances(state)`, sem reproduzir
as regras em uma implementação paralela. É uma consulta da ficha
histórica autorizada; não altera recursos nem executa compras.

## Complementaridade com a simulação de construções

O PR #529 já introduziu
`/api/firebase-cloud-house-quote` e o componente
`FirebaseConstructionQuote`. O painel deste lote **não os duplica**:
apenas complementa a ficha com o balanço completo de recursos.
As prévias de compras permanecem no fluxo de cotação do servidor.

## Segurança da apuração

- O estado da Casa vem do `getHouse` autenticado que já delimita
  a leitura no servidor. Sem consultas adicionais a outras Casas.
- `verifiedEconomicState` exige base/permanente completos, versão de
  schema, domínio, estruturas das posses e unidades e histórico
  compatíveis antes de chamar o motor de regras.
- Nenhum campo ausente ou inválido é convertido em zero.
- Se uma ficha não puder ser validada, a interface mostra
  **Apuração indisponível**, sem apresentar saldo presumido.
- Saldos negativos são apresentados com aviso de inconsistência,
  sem realizar correção automática.
- O componente não faz POST, PATCH, PUT, DELETE nem cria botão de
  compra, lançamento ou mutação de dados.

## Limites de entrega

A operação de Tesouro segregado, introduzida no PR #527 e ampliada
no #528, permanece independente. O balanço calculado não representa
um estado operacional conciliado e **não habilita compras**.
Nenhuma flag de escrita, regra de Firestore, IAM, Auth, permissão,
reconciliação ou estado de publicação é alterado.
`readyForCutover=false` continua aplicável.

## Testes

`src/lib/house/firebase-economic-readonly.test.tsx` executa
paridade com `balances()`, rejeição de estruturas parciais,
imutabilidade, validação visual, escape de texto de usuário e
preservação de saldos negativos sem alterações.
