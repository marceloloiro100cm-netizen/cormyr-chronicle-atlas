# Firebase Cloud — consulta da economia operacional por Casa

## Nova interface

O portal `/firebase-access` apresenta um quadro **Economia operacional da Casa**, separado do balanço e da ficha histórica.

A consulta Firebase-only `POST /api/firebase-cloud-house-economy` aceita apenas `action=summary` e `houseId`. Ela devolve, exclusivamente para a Casa autorizada:

- versão econômica operacional e versão da ficha histórica de origem;
- balanço dos sete recursos, calculado pelo motor `balances(state)` oficial: Total, Alocado, Comprometido e Disponível;
- nomes, situações e domínios das posses operacionais, sem efeitos internos ou dados de outras Casas;
- nomes e situações dos projetos operacionais e durações registradas;
- contagem completa e avisos de limitação visual para listas grandes.

Nenhum `state` bruto, identidade de usuário, `requestKey`, documento de auditoria, documento privado do Firestore, ficha de outra Casa ou histórico de operações é retornado. Os projetos e recursos exibidos são dados atuais do estado operacional conciliado, não da simulação histórica.

## Autorização

1. O gateway de leitura da Casa existente, `createFirebaseCloudReadonly().getHouse`, valida token Firebase Auth com revogação, usuário habilitado, vínculo privado à Casa e integridade dos snapshots. Jogador só visualiza Casas de `memberHouseIds`; Narrador autorizado visualiza as Casas da campanha. Editor é recusado.
2. Só **depois** dessa autorização são consultados o calendário oficial, runtime reconciliado e o documento operacional `houseEconomies/<hash da Casa>`.
3. A aprovação de leitura é independente da aprovação de compra. São exigidos `CORMYR_FIREBASE_CLOUD_READ_ENABLED=true`, `CORMYR_FIREBASE_CLOUD_HOUSE_ECONOMY_READ_ENABLED=true` e, no documento de runtime privado, `constructionReadApproved=true` mais `constructionSeededVerified=true`. Nenhuma dessas flags foi ativada nesta implementação.
4. O runtime ainda exige `private=true`, `sourceSnapshotId`, `sourceSnapshotReconciled=true`, `applicationEnabled=true` e versão do calendário conciliada.
5. O documento operacional deve existir, pertencer à mesma Casa, ter versionamento e `sourceSheetVersion` exatos, `sourceStateHash` igual à origem preservada e `stateHash` igual ao estado operacional. Na versão zero, o estado operacional deve coincidir integralmente com a fonte. O mês deve coincidir com o relógio Harptos oficial.
6. Se faltar aprovação, seed, integridade, calendário ou documento, o retorno é apenas `{available:false,readOnly:true}`. O navegador informa que o estado operacional ainda não está disponível e **não inventa saldos**.

## Sem mutações

- Não existe POST de compra ou botões de alteração no painel. A API executa exclusivamente leitura do Firebase Admin no servidor.
- A rota de compra `/api/firebase-cloud-construction` e sua aprovação `constructionWriteApproved` **permanecem independentes e desligadas**.
- Não altera as coleções `migration*` nem os snapshots de origem. Não modifica IAM, Auth, Firestore Rules, Storage, dados reais ou o `readyForCutover=false`.
- O Tesouro operacional continua independente dos sete recursos nobres. O cronograma histórico do PR #533 segue separado.
- O acesso à economia operacional ainda depende de reconciliação administrativa real e da pendência IAM #513.

## Testes e validação

- `firebase-operational-house-read.test.ts`: leitura autorizada com escrita desativada, isolamento entre Casas, perfil Editor, conta desabilitada, falta de seed e de gate privado, incompatibilidade de hash e calendário, projeção dos sete recursos com estado operacional atualizado e imutabilidade.
- `FirebaseOperationalHouseEconomy.test.tsx`: interface indisponível, versão, valores, escape de HTML, listas parciais e ausência de controles de escrita.

O CI utiliza `Build check`, `Validate`, testes de componentes e contratos de segurança existentes. Não exige Cloud Shell, exportação adicional ou Supabase.
