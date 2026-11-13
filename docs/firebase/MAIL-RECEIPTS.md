# Firebase — comprovantes de leitura individuais (somente emulador)

## Escopo

Este lote implementa uma **operação de escrita funcional, mas isolada**:
`createEmulatorInbox(...).markLetterRead({idToken,letterId})`.
Ela executa no backend com Admin SDK e requer o projeto
`demo-cormyr-migration` e `FIRESTORE_EMULATOR_HOST` em loopback.
Não é uma API HTTP, não publica Firebase Cloud, não altera a aplicação
do jogador e não consulta nem escreve na fonte Supabase/Lovable.

O recibo é individual. Para missivas destinadas a uma Casa, cada jogador
autorizado registra a própria leitura, nunca a leitura coletiva da Casa.
Uma missiva endereçada diretamente a um jogador só pode ser confirmada
por aquele destinatário. O remetente não pode marcar como lida a própria
carta; a permissão global do Narrador também não cria recibos em nome
de outro usuário; Editor-Chefe não herda acesso a missivas.

## Segurança e consistência

1. Valida `verifyIdToken(idToken,true)` e `auth.getUser(uid)` no servidor;
   não confia em claims do token, ID de usuário ou Casa fornecidos pelo
   cliente.
2. Exige snapshot de migração completo e escopo ativo, revisto no banco.
3. Usa uma transação Firestore para **reler** o estado do snapshot,
   os vínculos do usuário e a carta pai antes da gravação. Revogação
   durante a operação faz a transação ser reavaliada ou falhar.
4. Bloqueia cartas não entregues, excluídas, ambíguas, de outra Casa ou
   de outro destinatário. Não permite alteração do histórico original.
5. Cria somente `migrationMailRuntimeStage/<snapshot>/readReceipts/<hash>`,
   com `schemaVersion`, `letterId`, `viewerUid` e hora UTC do servidor.
   O ID é um SHA-256 determinístico por carta e UID; uma segunda
   solicitação é idempotente e retorna `alreadyRecorded:true`.
6. Firestore Emulator Security Rules negam leitura, listagem e TODAS as
   escritas por SDK cliente, inclusive para Narrador, Editor-Chefe,
   destinatários e anônimos. A coleção só é acessível via backend.

Os recibos históricos da fonte continuam em arquivo privado de staging;
**não há reconciliação ou mesclagem automática** entre esses registros
e os novos recibos experimentais. Nenhum dado privado vai ao GitHub.

## Verificação

O workflow `.github/workflows/firebase-read-receipts.yml` valida
a sintaxe, testes anteriores do serviço e o script de integração real
com Firestore Emulator. O teste usa somente cartas, usuários e Casas
fictícios e valida: duas leituras repetidas, destinatários distintos,
revogação, rascunho, exclusão, ator sem permissão e Rules deny-all.

O backend continua **sem envio, edição, exclusão, agendamento ou
publicação de missivas**, sem integração com a UI, sem importação
para Firebase Cloud e sem cutover do domínio. A operação só pode
ser disponibilizada a jogadores após homologação completa e validação
do estado atual da origem.
