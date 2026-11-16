# Firebase — prévia determinística da ficha operacional (sem seed real)

## Entrega

A função pura \`prepareHouseEconomySeedDraft\` recebe um snapshot histórico já importado, a versão da ficha nobre, mês oficial de Harptos e informação da existência do documento operacional. Recalcula os sete recursos usando o **motor canônico da Casa** e prepara um documento-rascunho que replica exatamente o estado original.

**Não há gravação Firestore, criação automática de documento, aprovação ou ativação de flag.** O resultado é uma proposta privada para posterior revisão por operador com privilégios auditados, não uma migração executada.

O diagnóstico Narrador em \`/firebase-access\` passa a incluir apenas \`seedPreflightStatus\` na resposta privada, sem retornar a proposta, hash, os saldos, UIDs ou demais dados históricos.

## Barreiras de integridade

- Exige \`snapshotId\` SHA-256, identificador de Casa seguro, versão histórica não negativa e mês oficial válido.
- Rejeita origem com Casa diferente, ficha não ativa, esquema econômico inválido, recursos disponíveis negativos, calendário divergente ou hash modificado ao clonar.
- Rejeita **qualquer documento de destino já existente**, mesmo que aparentemente válido: nenhum overwrite. A presença tem de ser verificada novamente em uma transação antes de gravar no futuro.
- Impõe teto de 700.000 bytes de JSON para reservar margem frente ao limite de documento do Firestore.
- O candidato contém \`status:'pending'\`, \`sourceReconciled:false\`, \`seedVerified:false\`, \`version:0\`, hash de origem e cópia literal do estado. Esses valores **não passam** nas portas de leitura/escrita operacional. A aprovação da origem não é concedida pelo gerador.
- \`writesPerformed:false\`, \`automaticallyApproved:false\`, \`readyForCutover:false\` são invariantes em todos os resultados, incluindo o estado \`ready_for_operator_review\`.

## Próxima etapa para dados reais

Será necessário verificar a lista real de Casas importadas, conferir fichas, saldos, projetos e permissões com os usuários, corrigir a pendência IAM #513 e realizar provisionamento controlado, com verificação de CAS e trilha administrativa. Nenhuma dessas ações é executada por este pré-processamento.

O código não depende de Supabase ou de Cloud Shell para sua validação pelo GitHub Actions. O documento privado do preflight **não deve ser enviado pelo navegador** nem commitado no repositório público.
