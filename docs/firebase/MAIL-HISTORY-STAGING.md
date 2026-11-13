# Lote Firebase — histórico de missivas e respostas (emulador privado)

## Conteúdo convertido

O processo de migração `stage-mail-history-emulator.mjs` agora acompanha
o estágio integrado de Auth e Firestore em `stage-all-emulators.mjs`.

Requer as oito tabelas históricas: `letter_replies`, `letter_receipts`,
`letter_versions`, `letter_reply_versions`, `letter_rounds`,
`mail_submissions`, `narrator_mail_notes` e
`campaign_letter_consequences`. A integridade também é conferida
contra `auth.users` e `campaign_letters`.

Todos os registros são preservados no
`migrationMailHistoryStage/<snapshot>/archive`, com fragmentação para
documentos grandes. A contagem é verificada, incluindo tabelas sem PK.
Ninguém pode ler ou escrever nessa área via SDK cliente, **inclusive
Narrador, Editor-Chefe e demais jogadores**.

Somente respostas efetivamente **entregues** e não excluídas, com
remetente e destinatário reais e missiva original entregue e
inequivocamente endereçada, são projetadas em
`migrationMailHistoryStage/<snapshot>/replies`.
Mesmo a coleção de respostas entregues é **deny-all no SDK cliente**:
é destinada exclusivamente ao backend que revalida o token e
o escopo ativo de cada conta.

Rascunhos, respostas agendadas, conteúdos excluídos, vínculos
ambíguos, IDs não resolvidos ou documentos grandes ficam apenas no
arquivo privado. Não são perdidos nem classificados como entregues.
O relatório contém apenas contagens agregadas, como
`deliveredReplies`, `privatelyArchivedReplies`, `archiveRows`
e `privateReasons`.

## Segurança de missivas originais

O importador tipado `stage-typed-domain-emulator.mjs` passou a conservar
`publicationState` com valor explícito `draft`, `scheduled` ou
`delivered`. Se não existir ou não for reconhecido, a migração tipada
é bloqueada para revisão; não se presume entrega.

O backend de caixa de entrada e as Firestore Rules do emulador exigem
`publicationState == 'delivered'` antes de entregar o conteúdo,
mesmo ao Narrador nessa visão mínima. Essa é uma política
deliberadamente conservadora; não substitui os fluxos completos de
rascunho, representação ou gestão do Narrador.

O backend `letter-inbox-service.mjs` recebeu
`listReplies({idToken,letterId})`: só entrega conteúdo de respostas
efetivamente publicadas e, para jogadores, exige que o usuário seja
**autor ou destinatário daquela resposta**, além de poder consultar
a carta pai. Ser membro de outra Casa ou apenas membro da Casa
da carta não dá acesso automático a uma resposta endereçada a
outra pessoa. A caixa de entrada mantém consulta por Casa,
revogação imediata, limite de leitura e validação de token revogado.

**Este arquivo não cria um endpoint público**; toda chamada acontece
apenas em emulador local e com tokens Auth validados pelo servidor
no momento da futura integração. Os testes de integração usam
atores sintéticos, nunca dados dos jogadores reais.

## Execução somente leitura no backup normalizado

Depois de integrar o PR na `main`, no Cloud Shell:

```bash
ROOT="$HOME/cormyr-chronicle-atlas"
git -C "$ROOT" fetch origin main
WORK="/tmp/cormyr-mail-history-$(date +%s)-$$"
git -C "$ROOT" worktree add --detach "$WORK" FETCH_HEAD

NORMALIZED="$ROOT/.firebase-migration/inspecao-12nov-E4pokAhB/normalized"
node "$WORK/scripts/firebase/stage-mail-history-emulator.mjs" \
  --normalized "$NORMALIZED"
```

A execução é local e não altera qualquer usuário, site, missiva ou
documento do Firebase Cloud. Se `planValid:true`, o estágio
completo poderá ser executado com os emuladores após reconciliação.
Não colocar o backup privado em repositório, workflow público
ou logs.

## O que ainda está pendente neste módulo

- Serviços transacionais de envio, resposta, edição, recibo de
  leitura, rascunhos e agendamento com regras e idempotência.
- Regras de mediação Narrador entre Casas, consequências, versões,
  revisão, histórico de representações e sincronização temporal.
- Conexão da interface de missivas ao novo backend de homologação.
- Testes com login real Auth Emulator e reconciliação da origem ativa.
- Implantação cloud com regras seguras, apenas após homologação.

A versão atual no Lovable/Supabase permanece em operação.
Nenhuma publicação ou mudança de domínio é feita neste lote.
