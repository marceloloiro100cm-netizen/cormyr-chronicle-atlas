# Firebase — núcleo transacional de Missivas (homologação isolada)

Este lote transforma o arquivo do Firebase Emulator em **operações de uso
real de correspondência no ambiente isolado**, preservando a origem e
bloqueando qualquer caminho para Firebase Cloud.

## Implementações

- Criar missivas em lote para Casas ativas, ou, para jogadores, exclusivamente
  para o Narrador. O Narrador só endereça Casas. Cada envio possui um ID por
  destinatário; o Narrador acompanha as cartas entregues.
- Autorizar a Casa remetente no servidor pelo conjunto `editHouseIds` da
  conta ativa; selecionar uma Casa na interface não é autorização.
- Chave de idempotência determinística para lote, envio e resposta;
  repetição com a mesma chave e conteúdo não duplica cartas, e reutilização
  com conteúdo divergente falha.
- Registrar rascunhos e permitir edição com versão esperada (optimistic
  concurrency), histórico de conteúdo anterior em trilha privada.
- Programar rascunhos, abrir/fechar rodadas sequenciais e entregar
  automaticamente documentos programados na rodada correspondente.
- Responder ao remetente da carta ou ao autor de uma resposta entregue
  e visível ao usuário; impedir resposta para si ou envio para autor que
  perdeu acesso.
- Lixeira/restauração limitada a rascunhos próprios ou ao Narrador;
  as exclusões são lógicas. A carta histórica importada nunca muda.
- Notas privadas do Narrador e registros de auditoria em namespace
  inacessível por cliente.
- Consultas para cartas do runtime, cartas históricas individuais e
  respostas do runtime com revalidação da autorização; limite conservador
  de varredura. Recibos individuais continuam no serviço anterior.

Tudo em `scripts/firebase/mail-command-service.mjs`, no projeto de
emulador `demo-cormyr-migration` e host loopback. Não existe endpoint
HTTP, API pública, chave de Admin SDK na UI nem acesso direto de
jogadores a esse serviço.

## Sequência lógica

1. Execute o `stage-all-emulators.mjs` com seu snapshot privado.
2. Inicialize `createEmulatorMailCommands({db,auth,snapshotId})` **no
   backend local com ID tokens Firebase revogáveis**.
3. O Narrador chama `initialize` após validar os estágios de domínio,
   histórico e Harptos completos. A leitura do `lastRound` inicial
   não altera nem avança o relógio canônico.
4. `openRound` e `closeRound` simulam rodadas somente neste ambiente.
   `send`, `reply`, `editDraft`, `scheduleDraft`, `changeTrash`,
   `list`, `get`, `listReplies` e `note` compõem o fluxo de testes.
5. Consulte os testes de integração fictícios:
   `mail-command-service.integration.mjs` e workflow
   `firebase-mail-commands.yml`.

Dados e identidades reais nunca são incluídos nos testes públicos.

## Proteções deliberadas

- `firebase/firestore.domain.rules` nega acesso SDK cliente a
  `migrationMailRuntimeStage` integralmente; só o Admin SDK interno
  manipula esse conjunto.
- A origem `migrationDomainStage` e o arquivo bruto histórico permanecem
  imutáveis, e suas identidades são recuperadas sob escopo renovado.
- O ID do token nunca concede privilégio por claims `admin`/Casa.
- O Narrador não pode se passar por uma conta e escrever como destinatário.
- Cartas rascunhadas ou programadas permanecem privadas até a entrega,
  inclusive quando pertencem a uma Casa.
- O envio não executa efeitos sobre exércitos ou recursos.

## O que ainda NÃO está migrado (bloqueio para declarar módulo finalizado)

1. Interface de Missivas: componentes em `src/components/players/`
   ainda chamam RPCs Supabase. Nenhuma tela foi redirecionada aqui.
2. Fluxos SQL de consequências e estornos vinculados a
   `noble_house_sheets`, vínculos de Corte/unidades, assinaturas
   de NPC e representações auditadas do Narrador. Não inventar estados
   financeiros/militares sem o ledger oficial do Firebase.
3. Arquivos de imagem anexados e sincronização Drive com políticas
   privadas equivalentes; conteúdo em texto funciona no emulador,
   mas Upload/Storage ainda requer mediação segura.
4. Publicação dos consumidores do HUB Temporal, reconciliação da
   rodada de origem com `campaign_calendar`, a cronologia anual
   Harptos e o mecanismo de entregas temporais. O relógio de
   `openRound` **não é** substituto sincronizado do Hub.
5. Mesclagem paginada de cartas importadas e novas na visão única,
   consultas KPI/por grupo, pesquisas, cópias mediadas e leitura
   individual histórica; os serviços atuais são separados.
6. Login Firebase Cloud, importação final Auth/Firestore/Storage,
   endpoints autenticados e testes manuais com a interface completa.
7. O teste legado `mail-database` do PostgreSQL falhava no GitHub
   Actions por divergência de restauração temporal, inclusive antes
   da implementação de comandos. Resolver separadamente para corte.

**O código é uma etapa real e testável da migração, mas não é ainda
uma substituição de ponta a ponta do módulo no site.** Não publicar nem
desativar o Supabase/Lovable enquanto esses critérios não passarem.
