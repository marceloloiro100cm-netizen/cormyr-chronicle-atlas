# Firebase Cloud — leitura operacional da economia das Casas

## Entrega

O portal `/firebase-access` agora inclui um painel próprio **Economia operacional · Firebase**, sem substituir ou reescrever a ficha histórica. O endpoint `POST /api/firebase-operational-economy` recebe apenas `{"action":"getHouse","houseId":"..."}` via Firebase Auth e retorna uma projeção **somente leitura** do documento operacional autenticado da Casa.

A resposta divulga exclusivamente: identificador da Casa, versões da ficha de origem e operacional, mês canônico; sete recursos (total, alocado, comprometido, disponível), totais de posses/projetos e até 100 registros reduzidos de cada tipo (ID, nome, status e vínculos não sensíveis).
Os vínculos apresentam o nome do domínio da posse e o nome da posse associada ao projeto **somente a partir do estado da própria Casa já autorizado**, sem consultas externas. Nunca retorna `state` inteiro, auditoria, UIDs, `sourceStateHash`, notas privadas, registros de corte ou espionagem, dados de outra Casa ou atributos de jogadores.

## Portões de leitura independentes

- A nova flag de servidor `CORMYR_FIREBASE_CLOUD_CONSTRUCTION_READ_ENABLED=true` é necessária **além** de `CORMYR_FIREBASE_CLOUD_READ_ENABLED=true` e `CORMYR_FIREBASE_SNAPSHOT_ID` válido. A flag nova **não é ativada por este PR**.
- O runtime `campaignCloudRuntime/<snapshot>` deve ter `status=active`, `private=true`, `sourceSnapshotId` igual ao snapshot, `sourceSnapshotReconciled=true`, `applicationEnabled=true`, `constructionReadApproved=true`, `constructionSeededVerified=true`, e `calendarVersion` igual ao calendário oficial.
- A autorização de **leitura** é independente de `CORMYR_FIREBASE_CLOUD_CONSTRUCTION_ENABLED` e `constructionWriteApproved`. É possível liberar consulta sem habilitar compras.
- Cada `houseEconomies/<sha256('house:'+houseId)>` deve existir, ser privado, ativo, possuir `seedVerified=true`, `sourceReconciled=true` e corresponder à ficha importada mediante `sourceSheetVersion`, `sourceStateHash` e `stateHash`. A versão zero exige identidade integral com o snapshot importado. Nenhuma provisão ou reparo acontece via API.

## Privacidade e integridade

1. O Firebase Admin valida token e revogação (`verifyIdToken(token,true)`) e o estado da conta (`getUser`).
2. O escopo é lido no servidor a partir da coleção privada. Narrador precisa ser administrador legítimo com vínculos vazios; jogador precisa ter a Casa na lista `memberHouseIds`; editor e outras Casas recebem 403.
3. A verificação lê todas as raízes, a Casa, a ficha fonte, o runtime, o documento operacional e o calendário em **uma transação Firestore somente leitura**.
4. A função `constructionStateHash` é a **mesma** utilizada no serviço transacional do PR #534; o balanço usa `calculateFirebaseHouseEconomy` (motor canônico `balances`). Fontes ausentes, hashes divergentes, dados inválidos ou calendário desalinhado falham fechados, sem estimar saldo.
5. A resposta é allowlist, `Cache-Control: private, no-store`, com autenticação no header, sem cookies, sem parâmetro query, com origem restrita, corpo limitado, payload limitado a 120 KiB.
6. O cliente mostra a fonte histórica e a operacional separadas, sem misturar seus saldos. Se a economia operacional não estiver aprovada, exibe mensagem de indisponibilidade e preserva a ficha histórica.

## Testes

- `src/lib/house/firebase-operational-economy-read.test.ts`: saldo pós-compra em estado sintético, privacidade, ausência de mutação, autorização Narrador/Jogador/Editor, cross-House, fontes adulteradas, flags independentes e calendário.
- Integridade complementar: projeto sem ID, nome, estado conhecido ou prazo inteiro é recusado mesmo quando o hash do documento é válido; nomes dos vínculos são derivados exclusivamente do mesmo snapshot.
- `src/components/houses/FirebaseOperationalEconomy.test.tsx`: apresentação, falha fechada por Casa, renderização segura de texto e ausência de botões de compra.

## Sem alteração de produção

Não altera Firestore Rules, IAM, Firebase Auth, Storage, snapshots históricos, flags reais, permissões de compras, Hub Temporal, `readyForCutover=false` nem Supabase. A issue administrativa #513 segue pendente; testes de dados reais são obrigatórios antes de ativar a consulta.
