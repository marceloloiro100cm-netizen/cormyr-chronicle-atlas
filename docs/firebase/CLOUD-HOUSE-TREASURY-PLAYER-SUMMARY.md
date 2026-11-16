# Firebase Cloud — extrato-resumo protegido do Tesouro para jogadores

Este lote adiciona a ação `summary` a
`POST /api/firebase-cloud-treasury`, sem liberar lançamentos a jogadores
e sem modificar os dados históricos.

## Regras de acesso

- Narrador ativo com `admin=true`: pode consultar o resumo de uma Casa;
  sua permissão de lançar continua **separada**.
- Jogador ativo: somente uma Casa efetivamente incluída em seus
  `memberHouseIds`, recebidos do documento privado de acesso
  `migrationDomainStage/<snapshot>/access/<uid>`.
- É exigido `playerId` válido, admin=false, `editHouseIds` válido e
  contido em `memberHouseIds`; não se aceita afirmação de Casa, perfil ou
  usuário enviada pelo navegador.
- Editor, conta revogada/desabilitada ou perfil incoerente recebe
  bloqueio, sem revelar saldo ou existência de Tesouro alheio.
- `summary` não devolve auditorias, justificativas, usuários nem informações
  das demais Casas. Apenas `available`, `readOnly`, `balance` e
  `version`.

## Gates independentes

`summary` exige:

1. `CORMYR_FIREBASE_CLOUD_READ_ENABLED=true` e
   `CORMYR_FIREBASE_CLOUD_TREASURY_READ_ENABLED=true` no servidor;
2. runtime privado ativo e reconciliado,
   `treasuryReadApproved=true`, `treasurySeededVerified=true`,
   `applicationEnabled=true`, snapshot e calendário coincidentes;
3. documento de Tesouro operacional previamente criado e reconciliado,
   correspondente à ficha original.

**Nenhuma dessas flags é habilitada por este PR.**
O código retorna saldo indisponível, nunca zero presumido, quando
uma fonte ainda não foi verificada.

A operação `adjust` e o status de escrita do Narrador continuam exigindo
`CORMYR_FIREBASE_CLOUD_TREASURY_ENABLED=true` e
`treasuryWriteApproved=true`. Habilitar apenas leitura não habilita
nenhuma escrita nem aciona provisão de saldo.

## Interface

Na rota `/firebase-access` o jogador vê:
- Seu saldo operacional e a versão **somente depois da homologação**;
- Aviso explícito quando a consulta ainda não estiver homologada;
- Nenhum formulário de lançamento, botão para transferência ou ajuste;
- O Tesouro histórico permanece identificado separadamente no painel
  de recursos da Casa.

A seção administrativa do Narrador permanece inalterada.

## Segurança, testes e migração

Os testes sintéticos cobrem a própria Casa, Casa estrangeira, editor,
autorização indevida de escrita, conta bloqueada, scope forjado,
sequenciamento separado das flags, versão, falta de seed e fonte imutável.

Não altera Firestore Rules, IAM, Auth, Storage, secrets, dados reais ou
a marca `readyForCutover=false`. A migração financeira dos sete
recursos e a compra de construções permanecem pendentes.
