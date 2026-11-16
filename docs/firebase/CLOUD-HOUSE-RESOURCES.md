# Firebase Cloud — recursos e Tesouro da Casa (somente leitura)

A rota piloto `/firebase-access` já recebe `getHouse` do gateway restrito
Firebase Admin. O componente `FirebaseHouseResources` usa **somente** o
`state` daquela Casa, após autorização no servidor. Nenhuma consulta
adicional ao Firestore, nem uso de Supabase ou de APIs legadas.

## Campos apresentados

- Os sete recursos de `RESOURCE_KEYS` como **base** e **permanente**, sem
  somar parcelas e sem estimar saldo disponível.
- `treasury` é o valor do Tesouro **registrado**, não um extrato.
- `budget`, `phase`, `method`, `month`, `identity.region` e
  `regionalApplied` aparecem apenas se presentes e válidos.
- Valores zero são preservados; campos ausentes/ilegíveis exibem
  "Não informado", sem conversão de textos em números.
- Nenhum campo é editado e não são criados registros no Firestore.

## Limite de apuração

A função `balances` original depende de bônus regionais e históricos,
posses, unidades, penalidades, custos, construções e consequências de
missivas. O snapshot parcial do piloto não deve declarar um saldo
`available` derivado nem usar valores sintéticos para completar lacunas.

## Portões preservados

`readyForCutover=false`; nenhuma alteração de IAM, Firestore Rules,
Storage, Auth, flags de leitura/escrita ou contas reais. A issue #513
continua como pendência administrativa, separada desta apresentação.
