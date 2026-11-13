# Missivas: primeiro backend funcional de leitura no Firebase Emulator

## Entrega

`scripts/firebase/letter-inbox-service.mjs` implementa um serviço de
consulta de missivas **somente leitura**. A aplicação web ainda não
consome esse serviço e ele não é publicado como endpoint HTTP, Cloud
Function ou API de produção.

O construtor `createEmulatorInbox` exige:
- Firestore Emulator no loopback `127.0.0.1:8080` e projeto de teste fixo
  `demo-cormyr-migration`;
- Auth Admin com `verifyIdToken(token, true)` e `getUser(uid)`;
- hash de snapshot passado pela configuração interna do servidor,
  **nunca pelo jogador**.

A autenticação precisa realmente ser fornecida pelo Firebase Auth no
ambiente de integração futuro. Os testes de backend simulam o token
para isolar a política de acesso; os testes de Firestore Rules usam
Firestore Emulator real e perfis sintéticos. Não afirmamos login
de ponta a ponta das 14 contas reais.

## Consultas disponíveis

- `listLetters({idToken,pageSize,cursor})` monta caixa de entrada,
  consultando remetente, destinatário jogador e Casas autorizadas;
  devolve ordenação estável, páginas de no máximo 50 missivas e cursor
  opaco. Não aceita Casa selecionada pela UI como fonte de privilégio.
- `getLetter({idToken,id})` lê uma carta específica, ou retorna
  `null` quando o usuário não possui autorização.

A autorização consulta a cada chamada o documento atual
`migrationDomainStage/<snapshot>/access/<uid>`, sob um snapshot
que precisa estar `status:complete`. Verifica se a identidade não
está desabilitada, se o perfil está ativo, se não há troca de senha
pendente e se a carta pertence ao remetente, jogador destinatário ou
Casa da lista de vínculos. Narrador precisa de perfil narrador ativo
**e** privilégio admin no documento autorizado. Editor e conta sem
perfil não entram nessa API.

O SDK cliente permanece com `list`, `create`, `update` e `delete`
negados nas regras de homologação. O backend usa Admin SDK com
checagens próprias, não regras do SDK cliente.

## Correção de segurança no modelo de missivas

O modelo tipado passa a preservar `senderName` e `deletedAt`
por carta, a partir do backup PostgreSQL. Isso evita expor cartas
excluídas como se ainda estivessem ativas. Nas regras e no serviço,
**a ausência do campo `deletedAt` impede leitura**: snapshots antigos
precisam ser reimportados com a nova projeção. Acesso a carta
excluída fica apenas com narrador ativo, conforme a política histórica.

Somente uma referência de destinatário é admitida. Cartas com nenhum
ou dois destinatários permanecem em `lettersQuarantine`, inacessível
inclusive ao narrador via SDK cliente. Nenhum conteúdo de quarentena
é listado pelo serviço.

Os testes também cobrem revogação imediata de vínculo de Casa, token
inválido, conta desabilitada, claims falsas, paginação, documentação
privada e acesso entre Casas diferentes.

## Limites explícitos

- Não há envio, resposta, rascunho, agendamento, rodadas, anexos ou
  notificações. Essas operações exigem backend transacional com
  idempotência e checagem do estado temporal.
- Não há sincronização delta com a origem. O backup existente pode
  estar desatualizado.
- Para preservar performance na fase de homologação, cada consulta
  tem limite interno de 5.000 documentos; o serviço falha em vez
  de entregar uma caixa incompleta quando o limite é excedido.
- Não publicar esse arquivo como HTTP sem autenticação verificada,
  CORS/restrição de origem, limitação de taxa, auditoria e revisão.
- Nenhuma gravação no Firebase Cloud, no domínio da campanha, nem
  alteração em Auth/Storage. O Lovable segue ativo até o corte
  formalmente homologado.

## Próximos lotes

1. Migrar o arquivo de respostas `letter_replies`, recibos,
   versões e agendamento, conservando histórico e redação privada.
2. Implementar operações de escrita validadas: envio ao narrador,
   envio entre Casas, resposta, encaminhamento e auditoria.
3. Testar com tokens reais do Auth Emulator e perfis especiais.
4. Conectar somente o backend de homologação à interface Cormyr.
5. Validar E2E, reconciliação final e futura publicação separada.
