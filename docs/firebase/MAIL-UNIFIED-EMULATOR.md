# Cormyr / Firebase — caixa unificada de Missivas (somente emulador)

Este lote permite **consultar juntos** os registros históricos importados e
as novas missivas geradas no Firebase Emulator. Não faz corte para produção,
não publica API HTTP, não sincroniza Firebase Cloud e não altera dados da
origem Supabase/Lovable.

## Serviço

`scripts/firebase/mail-unified-service.mjs`:

```js
const mailbox=createEmulatorUnifiedMailbox({
  db,auth,snapshotId:trustedSnapshotHash,env:process.env,
});
const page=await mailbox.list({
  idToken,folder:'all',source:'all',query:'',pageSize:20,cursor:null,
});
const thread=await mailbox.getThread({idToken,letterId});
await mailbox.markRead({idToken,letterId});
```

As credenciais de backend, snapshot e ID do Firebase devem vir de
configuração **servidora**. Nenhum identificador de fonte é aceito como
permissão ou escolha livre do cliente.

### Listagem

- Mescla as missivas históricas endereçadas e publicadas
  (`migrationDomainStage/<snapshot>/letters`) com as mensagens recentes
  (`migrationMailRuntimeStage/<snapshot>/letters`).
- Pastas: `all`, `received`, `sent`, `drafts`, `scheduled`.
  Filtros por fonte `all`, `imported`, `runtime` e pesquisa textual.
- Ordenação UTC decrescente por data e ID; cursor opaco limitado e sem
  permissões embutidas; tamanho de página de 1 a 50.
- Rascunhos e agendadas só aparecem aos próprios autores.
  Narrador vê cartas entregues entre Casas para acompanhamento, mas
  isso não é o mesmo que recebê-las pessoalmente.
- Remetente é um indicador derivado no servidor. A projeção histórica
  não expõe UIDs de remetentes ou autorizações de outras Casas.
- `readAt` só consulta o recibo do usuário autenticado. Não divulga
  outros leitores nem arquivos de recibos históricos da origem.

### Fios de resposta

A mesma consulta abre a carta original e agrega respostas entregues
da projeção histórica com respostas novas do runtime, respeitando a
permissão de **autor ou destinatário de cada resposta**. Um membro
de uma Casa não recebe automaticamente conteúdo de uma resposta
endereçada particularmente a outro membro da mesma Casa.

Missivas em quarentena por endereço ambíguo, excluídas, não entregues
ou com remetente inválido permanecem fora da caixa pública. O acervo
privado completo é preservado sem reclassificar dados.

### Escrita de recibo

`markRead` identifica a origem autorizada da carta e chama o
serviço correto. O registro é por carta e por conta, com transação
e idempotência; não existe leitura coletiva da Casa. A chamada sempre
revalida os direitos do solicitante.

### Segurança e escala

- `verifyIdToken(idToken,true)`, `getUser(uid)`, perfis ativos e
  vínculos atuais verificados no servidor.
- Os dados são filtrados novamente após as consultas independentes,
  evitando utilizar uma autorização antiga de Casa para montar o
  resultado final.
- Não há leitura de Firestore pelo navegador: todas as coleções de
  runtime e histórico de respostas permanecem deny-all nas Rules.
- Existe um limite conservador de 7.000 cartas consultadas, além dos
  limites de cada serviço de origem. É um backend de **homologação**,
  não uma arquitetura escalável de paginação para campanhas grandes.
- Pesquisas, cursores e contagens não concedem autorização.

## Testes

`.github/workflows/firebase-mail-unified.yml` executa apenas
usuários e mensagens fictícios no Firestore Emulator. Verifica
mesclagem histórica/recente, pastas, paginação, busca, histórico de
respostas com destinatários individuais, recibos, revogação,
editor sem acesso e proibição de leitura/escrita pelo SDK cliente.

## Bloqueios restantes para migração completa

- Interface dos jogadores e narrador continua usando chamadas Supabase
  (em `src/components/players/missivas-tab.tsx` e `mail-compose.tsx`).
- Existe API HTTP local autenticada pelos emuladores, documentada em
  `MAIL-HTTP-EMULATOR.md`. Ainda não há endpoints publicados nem autenticação
  Firebase Cloud ligados ao front-end. O serviço não deve ser importado no browser.
- Consequências nas fichas, estornos, Corte, unidades, representantes
  do Narrador, assinatura de NPC e anexos de imagens ainda demandam
  implementação equivalente com autorização e auditoria.
- O Hub Temporal migrado é uma projeção e não controla as rodadas
  do novo serviço; reconciliar a origem, portar o agendamento canônico
  e garantir entrega exatamente uma vez.
- A origem pode ter recebido novas cartas após o backup. É
  indispensável delta final e testes com login real antes de corte.
- O ensaio de restauração temporal do banco SQL legado permanece
  falhando independentemente deste módulo.

Não declarar o sistema pronto para jogadores, desligar a origem,
alterar DNS ou abrir regras de produção com base neste lote.


## Fidelidade de datas e semanas históricas

A projeção tipada passa a preservar os metadados válidos da origem:
`campaignDate` (Harptos, inclusive Shieldmeet nos anos adequados),
`creationRound`, `deliveryRound`, `letterNumber`,
`letterKind`, `originHouseId`, `version` e `deliveredAt`.
A caixa unificada devolve estes campos nas consultas e fios.
Para um campo opcional que não existe no backup, retorna `null`,
nunca uma semana ou data suposta. Dados historicamente inválidos
continuam no arquivo bruto privado e aparecem somente como
**contadores agregados** em `metadataWarnings`.

Não se converte data Harptos para data gregoriana. Não se utiliza
metadado histórico como permissão de acesso nem para publicar cartas
agendadas da origem.
