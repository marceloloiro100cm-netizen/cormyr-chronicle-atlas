# Cormyr / Firebase — Storage com IAM restrito e homologação separada

## Escopo e status

**Mudança preparada no GitHub, ainda não aplicada ao Google Cloud.** Necessário um comando autenticado do proprietário no Cloud Shell para criar os recursos e conceder os papéis. A conta GitHub atual só consegue trocar identidade temporária; não recebeu direitos IAM para conceder papéis a si própria.

O acesso configurado pelo script é:

| Identidade | Origem: `gs://cormyr.firebasestorage.app/migration-staging/` | Destino: `gs://cormyr-migration-homolog-477785088395/` |
| --- | --- | --- |
| `cormyr-gh-reader@cormyr.iam.gserviceaccount.com` | `roles/storage.objectViewer` **somente na pasta gerenciada** | `roles/storage.objectViewer` |
| `cormyr-gh-stager@cormyr.iam.gserviceaccount.com` | `roles/storage.objectViewer` **somente na pasta gerenciada** | `roles/storage.objectCreator` + `roles/storage.objectViewer` |

A nova identidade `cormyr-gh-stager` reutiliza o mesmo provedor Workload Identity Federation limitado ao ID imutável do repositório e `refs/heads/main`. Nenhuma das contas recebe `roles/editor`, `roles/owner`, `roles/storage.admin` nem permissões de Auth/Firestore.

O diretório de **origem** já contém 779 imagens em staging. O script cria um recurso de *managed folder* para limitar concessões ao prefixo de migração; não mexe em conteúdo ou ACLs da produção. Se o bucket não tiver **uniform bucket-level access**, o script **para sem alterá-lo**, pois habilitar essa opção poderia afetar o acesso de jogadores. O novo bucket privado usa a mesma localização do bucket de origem, acesso uniforme e prevenção de acesso público. Ele pode gerar cobrança de armazenamento e operações futuras, mesmo sem upload automático.

## Único comando de autorização, após revisar o PR

No Cloud Shell do projeto `cormyr`, a partir do repositório já presente:

~~~bash
cd ~/cormyr-chronicle-atlas
git fetch origin feat/firebase-storage-scoped-access-20261113
git worktree add --detach /tmp/cormyr-storage-iam FETCH_HEAD
bash /tmp/cormyr-storage-iam/scripts/firebase/grant-scoped-staging-storage.sh
~~~

O script concede **somente** as permissões descritas. Ele:

1. Compara o número real do projeto com `477785088395` e confirma a conta já vinculada.
2. Verifica o acesso uniforme e a localização do bucket de origem; não altera a configuração antiga.
3. Cria a pasta gerenciada `migration-staging/` caso não exista.
4. Cria ou valida o bucket de homologação, garantindo o projeto proprietário, acesso privado e localização correta.
5. Cria a conta restrita `cormyr-gh-stager` e as permissões apenas nos recursos relevantes.
6. Confere as políticas IAM ao final sem imprimir nomes dos arquivos nem dados pessoais.

Não usar tokens do Lovable, chaves JSON ou privilégios de `roles/owner` para as contas do GitHub.

## Validação no GitHub

Depois de aplicar as permissões e integrar o PR, o workflow **Firebase Storage - verify scoped staging access** é executado no push da configuração a `main`. Também pode ser acionado manualmente em Actions.

- Conta *reader*: autenticação Google Cloud e contagem agregada dos arquivos dentro do prefixo de imagens. Diferenças com a referência de 779 geram alerta para reconciliação, sem imprimir os nomes.
- Conta *reader*: teste de leitura do bucket de homologação.
- Conta *stager*: troca de credenciais temporárias e confirmação do projeto, **sem upload**.
- Os PRs executam apenas `bash -n`; não recebem autorização de Cloud porque a federação exige a branch `main`.

Se a listagem falhar, **não conceder `roles/storage.objectViewer` no projeto inteiro** para contornar. Investigar o suporte de listagem por pasta gerenciada ou usar auditoria por objetos explicitamente relacionados ao manifesto.

## Próximo lote

Com os testes IAM aprovados, preparar transferência idempotente dos objetos para o bucket privado (sem overwrite, usando `ifGenerationMatch: 0` e leitura de verificação) e migração dos dados para emuladores Firestore/Auth antes de criar políticas finais.

Os emuladores Auth, Firestore e Storage já estão configurados no arquivo `firebase/firebase.json`, com regras de cliente fechadas em `firebase/firestore.rules` e `firebase/storage.rules`. Esse ambiente de testes é **local**, não um Firebase Authentication/Firestore em nuvem já liberado. A criação de um projeto Firebase de homologação separado e a ativação de billing/serviços que geram custos exigirão aprovação de escopo antes de acontecerem.

**Não executar importação Auth, Firestore ou deploy em produção com a conta de staging.** Os 14 UIDs preparados e 5.209 registros auditados ainda não foram importados; o delta da origem e as autorizações por Casa continuam pendentes.
