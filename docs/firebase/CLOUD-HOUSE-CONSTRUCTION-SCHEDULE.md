# Firebase Cloud — cronograma de obras por Casa (somente leitura)

## Entrega

A ficha de Casa autorizada em `/firebase-access` inclui **Cronograma de obras e projetos**, com:
- projetos da lista `state.projects` do snapshot previamente autorizado pelo servidor;
- nome da obra, posse vinculada da própria ficha, início e duração registrados;
- mês estimado de vencimento (start + duration + modifier) **apenas** quando todos os valores existem e são inteiros válidos;
- aviso de "Prazo atingido — precisa de revisão" em vez de concluir obras automaticamente;
- situação "Concluído no registro histórico" somente quando o dado de origem está explicitamente como `completed`;
- identificação de divergência entre mês da ficha e calendário oficial do Firebase.

A lógica de prazo usa `monthFromHarptosDate` e `projectTemporalNotice` do motor temporal compartilhado em `src/lib/calendar/house-time-impact.ts`. Não reproduz calendários e não converte meses em datas civis fictícias.

## Privacidade e consistência

- Apenas `house.state` obtido pela consulta autenticada `getHouse` é apresentado; nenhuma requisição adicional ao Firestore e nenhuma outra Casa é consultada.
- Nenhum estado de projeto é alterado nem avançado. Sem formulário, compra, liberação de recurso ou execução de construção.
- Sem calendário, mês da ficha ou modificador, os prazos ficam **não verificáveis** e o total de vencimentos fica "Não apurado".
- Quando mais de 100 projetos ou registros inconsistentes impedem uma visão integral, o quadro sinaliza resultado parcial e não publica totais de vencimentos enganadores.
- Os textos são renderizados como conteúdo React, sem HTML de dados inserido.
- Importações históricas continuam imutáveis. Nenhum comportamento depende de Supabase.

## Testes

`src/components/houses/FirebaseConstructionSchedule.test.tsx`: 
1. prazo atingido sem conclusão automática e uso do mês canônico;
2. tratamento de calendário ou modificador ausentes;
3. indisponibilidade ao faltar coleção de projetos;
4. HTML malicioso exibido apenas como texto;
5. limite de 100 registros e contagem não presumida.

## Ativação

O painel usa apenas o fluxo de leitura existente do portal Firebase. **Não altera flags, IAM, Auth, Firestore Rules, Storage ou `readyForCutover=false`.** Operações reais de aprovação/conclusão de obras continuam dependentes da reconciliação do estado operacional e de um caminho transacional próprio.

A issue administrativa #513 continua separada e pode ser resolvida sem executar Cloud Shell nesta etapa.
