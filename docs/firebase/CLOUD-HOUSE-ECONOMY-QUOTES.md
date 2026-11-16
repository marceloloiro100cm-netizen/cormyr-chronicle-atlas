# Firebase Cloud — balanço canônico e orçamento de construções (somente leitura)

## Objetivo

A rota piloto `/firebase-access` passa a mostrar uma **segunda visão
econômica da Casa**, logo abaixo dos valores registrados da ficha.
A consulta usa somente o `house.state` da Casa autenticada,
já autorizado pelo backend Firebase Cloud. Não faz consultas a
outras Casas e não acessa Supabase.

## Fonte de verdade

Os dados são calculados diretamente pelo motor original:
`src/lib/house/engine.ts`, usando `balances(state)` e
`quote(item,state,domainId)` e o catálogo oficial
`src/lib/house/catalog.ts`. Isso preserva:

- bônus regionais efetivamente aplicados;
- consequências de missivas, eventos de fundação e bônus dos jogadores;
- alocações e custos comprometidos por posses e projetos;
- descontos por construções ativas e requisitos territoriais;
- custos de unidades e penalidades de vassalagem.

O validador `verifiedEconomicState` rejeita
fichas sem `schemaVersion`, recursos base/permanentes completos,
identidade, importações e matrizes necessárias, ou com números
e custos inválidos. Se uma ficha falhar, a UI exibe
`Apuração indisponível`: não converte dados desconhecidos em zero,
não aproxima uma regra e não exibe saldo disponível fictício.

## Visão do jogador

1. Total, Alocado, Comprometido e Disponível por recurso.
2. Prévia de fortificações, explorações e povoamentos por domínio:
   custo permanente/alocação, descontos, restrições e fonte.
3. Aviso separado quando há adaptações pendentes ou recursos negativos.

Uma simulação favorável **não autoriza** a compra. Não há botão Comprar,
reserva de recurso, gravação de projeto ou mudança de ficha. Este lote
prepara a dependência funcional para um futuro serviço
transacional com validação de versão, regra de custo e ledger.

## Isolamento

- Não altera o snapshot em `migrationNobleHouseStage`.
- Não habilita as coleções operacionais do Tesouro ou regras Firestore.
- Não altera flags, contas, segredos nem a issue administrativa #513.
- Não afirma que os dados reais estão migrados ou homologados.
- `readyForCutover=false` permanece.

## Testes automatizados

`src/lib/house/firebase-economic-readonly.test.tsx` valida:
paridade do balanço e da cotação com o motor original, falta de campos,
cálculo impossível, não mutação, ausência de ações de compra e
tratamento de texto potencialmente hostil.

A execução ocorre na suíte Vitest do workflow **Validate**.
