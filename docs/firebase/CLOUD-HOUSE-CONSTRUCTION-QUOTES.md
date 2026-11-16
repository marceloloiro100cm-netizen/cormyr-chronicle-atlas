# Firebase Cloud — cotação de construções antes da compra (somente leitura)

A ficha autorizada no portal `/firebase-access` oferece o formulário
**Planejar construções · Simulação**. O comando
`POST /api/firebase-cloud-house-quote` com `action: "quote"`
calcula os custos e avisos **usando a própria implementação oficial**
`src/lib/house/engine.ts:quote` e o catálogo existente.

## Confidencialidade e cálculo

- Firebase Admin revalida o token Auth (inclusive revogação), perfil,
  habilitação e vínculo à Casa antes de obter `getHouse`; editor não pode
  consultar fichas, jogador só vê as Casas autorizadas e Narrador pode
  consultar as Casas da campanha.
- O endpoint ignora qualquer suposto saldo, perfil, documento de Casa,
  custo ou desconto informado pelo navegador. O cliente só seleciona IDs
  de Casa, item do catálogo, domínio e posses relacionadas.
- A ficha usada pelo motor é relida no **servidor** do snapshot privado;
  nenhuma requisição adicional é feita pelo navegador ao Firestore.
- O catálogo nunca é alterado para gerar um preço: vantagens, descontos,
  requisitos, limitações de domínio e evolução continuam calculados pelo
  mesmo `quote` usado na aplicação de compra.
- A resposta lista os sete recursos antes e depois da cotação, custos
  alocados/permanentes, descontos e erros de regra, apenas da Casa
  autorizada. Nenhuma informação de outra Casa ou anotações privadas
  é retornada pela operação.
- Chaves desconhecidas, documentos incompletos, IDs com barras de
  caminho, referências a posses de outro domínio e resultados ilegíveis
  são rejeitados sem inventar saldo ou completar dados falsamente.

## Proibições intencionais

- **NÃO é uma compra**: não gera nova posse, não cria construção,
  não inicia projeto, não lança custos, não reserva pontos, não joga
  dados, não avança o Hub Temporal e não altera recursos.
- Mesmo quando o motor retorna zero impedimentos, a interface informa
  que a compra está desabilitada e a liberação econômica definitiva
  depende de reconciliação e de um processo transacional separado.
- Custo calculado sobre dados **históricos do snapshot** pode ficar
  desatualizado antes da verdadeira execução. Nunca confiar no preço
  do navegador para realizar uma compra.
- O próximo serviço de compras deve aplicar a cotação **novamente dentro
  de uma transação Firestore**, comparar a versão esperada do estado
  operacional e registrar auditoria, sempre preservando os históricos.
- Não altera o Tesouro operacional do PR #527, o jornal, missivas,
  permissões IAM, regras do Firestore ou Storage, flags de produção
  ou Auth.

## Liberação

Depende do mesmo gate de leitura `CORMYR_FIREBASE_CLOUD_READ_ENABLED`
e de snapshot reconciliado no gateway Firebase-only.
`readyForCutover=false` permanece. Esta etapa não ativa escritas.

## Testes

- `src/lib/house/firebase-construction-quote.test.ts` verifica
  preços, descontos, impedimentos, cross-House, cross-domain,
  fontes incompletas e dados históricos imutáveis.
- `src/components/houses/FirebaseConstructionQuote.test.tsx`
  verifica simulação via UI, mensagens de impedimento e ausência
  de qualquer opção de compra ou gravação.
- O CI existente executa a suíte TypeScript/React e os checks de
  acesso público e emulator sintético, sem Cloud Shell.
