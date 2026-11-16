# Firebase Cloud — diagnóstico seguro de Auth 400 (OIDC sem Cloud Shell)

A auditoria já existente `Firebase Cloud access readiness — read-only OIDC` foi ampliada para ajudar na pendência [#513](https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas/issues/513), sem alterar IAM, contas, configuração ou dados reais.

## Chamadas autorizadas

- `GET https://identitytoolkit.googleapis.com/v1/projects/cormyr/accounts:batchGet?maxResults=1000`: listagem limitada de usuários, com agregação apenas quando a página inteira tiver sido carregada.
- Se esta chamada responder HTTP 400, tenta apenas o alias numérico fixo `477785088395`.
- **Somente quando a primeira tentativa retornou 400 e o alias numérico não retornou 200**, faz uma única `GET https://identitytoolkit.googleapis.com/admin/v2/projects/cormyr/config`. Essa resposta é interpretada exclusivamente pelo **código HTTP**. O corpo pode conter informações de provedores de autenticação, por isso **não é analisado**.
- A listagem de estágios e o probe do Firestore são idênticos aos da implementação anterior.

O endpoint de configuração `projects.getConfig` é documentado pelo Google com permissão `firebaseauth.configs.get`. Não se deve conceder novas permissões só para fazer esse diagnóstico. HTTP 403 nesse endpoint significa somente que esta leitura da configuração não está acessível à identidade de auditoria; não comprova falha nas contas do projeto.

## Saída pública permitida no GitHub Actions

Somente números totais sem identificadores, códigos HTTP e categorias padronizadas de RPC pertencentes à lista fixa de enums conhecida e testada (`INVALID_ARGUMENT`, `FAILED_PRECONDITION`, `PERMISSION_DENIED`, `UNAUTHENTICATED`, `NOT_FOUND`, `UNAVAILABLE`, `RESOURCE_EXHAUSTED`). Qualquer outro valor é descartado.

Campos adicionados:
- `authRpcStatus`: enum seguro da tentativa pelo ID do projeto, se existir;
- `authProjectNumberRpcStatus`: enum seguro da tentativa pelo número do projeto, se existir;
- `identityConfigHttpStatus`: apenas o status HTTP do projeto Auth, ou `null` quando a sondagem não foi necessária.

Jamais imprimir `error.message`, `error.details`, `users[]`, e-mails, UIDs, configuração de provedores, tokens ou snapshots de migração. A rotina não ativa usuários, não altera roles ou flags e preserva `readyForCutover=false`.

## Interpretação

- `Auth batchGet = 400` e `config = 200`: a configuração do projeto pode ser lida, mas **a listagem continua inválida**. Ainda não é seguro concluir que se trata de IAM nem contar as contas.
- `Auth batchGet = 400` e `config = 403`: a configuração não pode ser consultada por esse principal; causa do 400 permanece indefinida.
- `Firestore = 403`: a identidade OIDC atual não pode ler o documento solicitado, deixando a reconciliação real pendente.
- Mesmo `Auth = 200` e `Firestore = 200` não liberam a migração sem todos os testes de perfis, snapshots e transações.

O workflow executa testes sintéticos no PR e reexecuta a sondagem real somente após merge na `main`, usando a identidade OIDC já configurada. Não utiliza Cloud Shell nem Supabase.
