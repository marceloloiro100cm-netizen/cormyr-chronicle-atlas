# Cormyr — Storage privado de homologação (compatível com ACLs antigas)

## Bloqueio detectado e solução

A execução do proprietário em 13/11/2026 confirmou que o bucket original
`gs://cormyr.firebasestorage.app` **não usa uniform bucket-level access**.
Por isso a versão anterior do script interrompeu a operação **antes de
conceder qualquer permissão**. Essa proteção foi correta: habilitar acesso
uniforme na origem desativaria ACLs individuais e poderia comprometer
arquivos usados pela aplicação atual.

A estratégia foi modificada. **O script NÃO altera configuração, ACL ou IAM
do bucket original.** A conta Google do proprietário, já autenticada no
Cloud Shell, faz uma cópia somente dos objetos existentes em
`migration-staging/campaign-images` para um bucket privado, com
`--no-clobber --no-preserve-acl`. Não há remoção de arquivos de origem.

## Papéis de menor privilégio

| Identidade | Bucket de origem | Bucket privado de homologação |
| --- | --- | --- |
| `cormyr-gh-reader@cormyr.iam.gserviceaccount.com` | **Nenhum papel novo** | `roles/storage.objectViewer` |
| `cormyr-gh-stager@cormyr.iam.gserviceaccount.com` | **Nenhum papel novo** | `roles/storage.objectCreator` + `roles/storage.objectViewer` |

O bucket privado é `gs://cormyr-migration-homolog-477785088395`, criado
na mesma região da origem, com acesso uniforme e bloqueio de acesso público.
A conta `cormyr-gh-stager` recebe apenas permissão de criação e leitura:
não pode sobrescrever ou excluir os objetos anteriores.

O provedor OIDC anterior só aceita GitHub repo ID `1436424408` na
branch `main`. A migração não recebe permissões de Firebase Auth, Firestore,
IAM geral, funções administrativas ou deploy de produção.

## Executar no Cloud Shell

O proprietário deve atualizar o script de uma branch de PR **ainda não
integrada** e executar uma vez:

~~~bash
cd ~/cormyr-chronicle-atlas
git fetch origin feat/firebase-storage-scoped-access-20261113
git show FETCH_HEAD:scripts/firebase/grant-scoped-staging-storage.sh \
  > /tmp/cormyr-storage-iam.sh
bash -n /tmp/cormyr-storage-iam.sh && bash /tmp/cormyr-storage-iam.sh
~~~

O comando cria o bucket privado e a conta restrita, aplica IAM **apenas
no novo bucket**, copia as imagens via sessão do proprietário no Cloud
Shell e verifica contagens sem mostrar nomes de objetos no terminal.

Ao copiar, usa `--no-clobber` para nunca sobrescrever arquivos já
transferidos e `--no-preserve-acl` para não copiar ACLs antigas ao
bucket de acesso uniforme. O script armazena logs com nomes de objetos
apenas em diretório temporário privado e os elimina ao finalizar.

Não publicar logs de cópia, nomes de arquivos privados, JSONs de
credenciais ou backups em PRs ou no chat. Uma segunda execução não
deve sobrescrever dados: se houve cópia parcial, o script detecta
diferença na contagem e exige análise antes da homologação.

## GitHub Actions

Com o script executado, integrar o PR. O workflow
**Firebase Storage - verify scoped staging access** checa a nova
conta e só lista o bucket **privado de homologação**, sem acessar
o bucket original por GitHub. Mostra apenas a contagem total e
compara com a referência histórica de 779 objetos.

Se a contagem divergir, nenhuma imagem é excluída nem corrigida
automaticamente. Uma cópia de 779 objetos não significa que o
Storage atual esteja congelado — ainda haverá reconciliação final
do delta antes do corte.

## Limites que permanecem

O backup PostgreSQL existente já foi auditado (5.209 registros);
Auth tem 14 candidatos, dos quais 13 com BCRYPT e 1 com Google,
com um vínculo `custom:` adiado. Essas contas e os documentos
**ainda não foram importados** no Firebase.

Os emuladores Firebase locais estão configurados no repositório;
isso não equivale a um projeto Firebase de homologação com Auth,
Firestore e regras autorizadas. Essas fases terão contas de serviço
específicas, validação de acesso por Casa e importadores idempotentes.

Criar e armazenar dados no novo bucket pode gerar custos de
armazenamento e operações. Não alterar DNS, não desligar a origem,
não publicar regras de cliente permissivas e não usar tokens Lovable.

Fontes:
- https://docs.cloud.google.com/storage/docs/uniform-bucket-level-access
- https://docs.cloud.google.com/sdk/gcloud/reference/storage/cp
- https://docs.cloud.google.com/iam/docs/roles-permissions/storage

## Correção de formato de metadados (13/11/2026)

Na execução inicial da estratégia de bucket separado, o Cloud Shell criou
`gs://cormyr-migration-homolog-477785088395`, mas a validação em Python
interrompeu com `AssertionError: Wrong owner`. **Isso não comprova** que
o bucket pertença a outro projeto: o comando `gcloud storage buckets describe`
normaliza os nomes dos atributos e pode omitir `projectNumber` do formato
exibido. A verificação esperava exatamente o nome da API JSON.

O script passou a usar `gcloud storage buckets describe --raw --format=json`
para verificar os valores originais da API: `projectNumber`,
`iamConfiguration.uniformBucketLevelAccess.enabled`,
`iamConfiguration.publicAccessPrevention` e `location`. **Não** removemos
a conferência da titularidade; um bucket de outro projeto ou com segurança
insuficiente continua bloqueado.

É seguro repetir o script atualizado: ele detecta o bucket privado já
existente, confere suas propriedades e só então aplica papéis restritos.
A etapa anterior falhou **antes** de conceder IAM ou copiar objetos.
