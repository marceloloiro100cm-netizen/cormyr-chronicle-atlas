# Hub Temporal de Cormyr — Lote 23: segurança temporal das ações nas telas

**Data:** 31/10/2026  
**Base:** Lote 22 (PR #148). Implementação na branch deste lote.  
**Escopo:** ações do jogador/Narrador na ficha da Casa, compras de posses, Sorte, unidades militares e validação de autorização no servidor. Nenhum deploy, nenhuma data publicada.

## Problema constatado

A ficha já apresentava um aviso quando seu mês processado divergisse do calendário do Reino. Entretanto, os botões para comprar posses e adquirir/conduzir unidades podiam continuar disponíveis até o servidor bloquear a operação. Operações militares com custo — recrutamento, equipamento, treinamento e máquinas de cerco — ainda não participavam da lista de operações com reconfirmação da data oficial antes de gravar.

Isso cria UX confusa e aumenta o risco de ações econômicas ou militares realizadas com uma versão antiga da data na tela.

## Mudanças implementadas

### Política compartilhada para operações dependentes do mês

\`src/lib/house/monthly-operation-policy.ts\` define uma lista fechada de ações com dependência temporal: \`fortune\`, \`alternative\`, \`convert\`, \`action\`, \`spend_influence\`, \`redeem_intrigue\`, \`purchase\`, \`vassal_purchase\`, \`unit\`, \`equipment\`, \`train_unit\`, \`war_hounds\`, \`broad_training\` e \`siege\`.

Retorna um estado explícito da Casa:

| Situação | Compras e ações mensais |
| --- | --- |
| Rascunho ainda na criação | Permitidas segundo as regras de criação, sem afirmar que o Reino avançou |
| Casa aguardando aprovação | Bloqueadas |
| Casa ativa e relógio global indisponível | Bloqueadas, com aviso |
| Casa ativa atrasada | Bloqueadas até conciliação conduzida pelo Narrador |
| Casa ativa adiantada | Bloqueadas até revisão manual, sem retroceder obras |
| Casa ativa no mesmo mês oficial | Liberadas para tentar, sujeitas à verificação autoritativa do servidor |

### Interface da Casa

Em \`src/components/house/hub.tsx\`:

- Os botões **Comprar posse** e **Comprar terreno** ficam desabilitados quando a Casa não está no mesmo mês do calendário oficial; incluem economia e fortificações.
- A aba de Sorte e ações, a seção de recrutamento militar e a compra de construções militares passam a receber apenas a permissão mensal efetiva.
- Um aviso visível explica por que a ação foi bloqueada e indica a conciliação necessária.
- O assistente de compra deixa de ficar aberto se a Casa perder alinhamento. Ao mudar o mês oficial, o formulário é remontado e sua prévia de preço não é reutilizada como se o período anterior ainda estivesse vigente.
- A função central que envia operações também verifica o alinhamento da data exibida antes do envio, evitando comandos originados de um formulário desatualizado. Isso é apenas pré-voo do cliente.

### Autorização do servidor

Em \`src/lib/house/house.functions.ts\`, ações de custo militar agora usam o **mesmo RPC oficial \`get_campaign_calendar\`**, protegido pela checagem \`requireCalendarAlignment\`, já utilizada por compras e Sorte.

A consulta acontece novamente no servidor, depois de validar autenticação e acesso à Casa, **no momento da operação**, pois a versão exibida no navegador pode ter mudado. Permissão de Narrador não ignora a necessidade de conciliar o mês para recrutamento ou compra.

Uma correção de recursos por Narrador, edição de nome/cargo ou conciliação auditada continua sendo uma categoria distinta de ação; a política mensal não deve bloquear a recuperação da Casa depois de um erro.

## Testes

\`src/test/house-monthly-operation-policy-lote23.test.ts\` cobre a política para rascunho, revisão, alinhamento, atraso, adiantamento, data indisponível, todos os tipos de ação mensal e a separação das correções administrativas. Também verifica que o servidor consulta a data oficial **antes** dos ramos de recrutamento e equipamento, e que a UI usa o mesmo contrato de pré-voo.

A suíte continua incluindo os testes de anos, bônus de posses, histórico de missivas, Realtime, RLS e projetos dos Lotes 1–22. Os testes TypeScript são acionados automaticamente pelo comando \`bun run test\` do CI; este lote não altera migrações SQL.

## Limitações importantes

- O alinhamento do mês no frontend não prova que uma ação está autorizada. O servidor relê a data oficial; o formulário nunca se torna a fonte da verdade.
- O período registrado na Casa pode ficar à frente do Reino após uma retificação. Nunca retroceder recursos ou reconstruir automaticamente projetos; usar revisão administrativa.
- O cadastro em rascunho, lançamentos de histórico e correções manuais não devem ser confundidos com compras mensais.
- O bloqueio cobre as ações explicitamente enumeradas. Outros fluxos financeiros/administrativos exigem avaliação futura de sua semântica temporal. Não se afirma que todas as telas do site passaram por testes exploratórios de navegador.
- Continuam pendentes a reconciliação do diário Drizzle (27 migrações SQL fora do journal e ordinal 0041 duplicado) e a homologação de backup real autorizado. Nenhum lote nesta cadeia aplica SQL à produção.

**Implantação: NO_GO.** Este lote é uma proteção adicional de UI + autorização e não faz merge, deploy ou edição de personagens reais.
