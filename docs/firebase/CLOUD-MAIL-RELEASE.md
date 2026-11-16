# Cormyr — envio de missivas em Firebase Cloud (fase protegida)

## Situação
A interface `/firebase-access` e a API
`POST /api/firebase-cloud-mail` estão implementadas sem Supabase.
**O envio permanece desabilitado por padrão**, inclusive quando publicado
no App Hosting. Não habilitar usuários antes da homologação Cloud.

## Modelo

- Firebase Auth (token revogado verificado, usuário habilitado) e associação
  UID/Casa do `migrationDomainStage` são validados no servidor.
- Usuários com perfil Jogador e `editHouseIds` enviam apenas da própria Casa;
  podem endereçar uma Casa ativa da temporada 2 ou o Narrador.
- Narrador autorizado envia apenas para Casas ativas.
- Editor-chefe não tem acesso a missivas.
- As novas cartas são gravadas em
  `campaignCloudRuntime/<hash>/letters/<id>`, não em `migration*`.
- As operações são transações Firestore atômicas com chave idempotente,
  limite de 100 novas cartas por remetente e rodada, data Harptos canônica,
  contador e auditoria.
- A leitura combina somente missivas históricas entregues e autorizadas
  com mensagens desse runtime (caso aprovado). Rascunhos, mensagens apagadas,
  quarentena e Casas não autorizadas ficam inacessíveis.
- `firebase/firestore.rules` de produção permanece **deny-all**;
  somente o Firebase Admin no servidor pode acessar essas coleções.

## Gates obrigatórios antes de ativar

Configuração do **servidor** App Hosting, não do navegador:

1. `CORMYR_FIREBASE_SNAPSHOT_ID`: hash SHA-256 do snapshot verificado.
2. `CORMYR_FIREBASE_CLOUD_READ_ENABLED=true`:
   exige IAM de leitura, Firebase Auth, contas ativas e isolamento das Casas.
3. `CORMYR_FIREBASE_CLOUD_MAIL_ENABLED=true`:
   habilita o endpoint de envio, que continua bloqueado até o gate abaixo.

O documento `campaignCloudRuntime/<hash>` precisa ser **criado por uma
operação administrativa independente**, após reconciliação das fontes e
verificação real das contas/permissões. O aplicativo jamais o cria
automaticamente. Campos exatos requeridos:

```json
{
  "status": "active",
  "private": true,
  "sourceSnapshotId": "<hash SHA-256 aprovado>",
  "sourceSnapshotReconciled": true,
  "mailWriteApproved": true,
  "applicationEnabled": true,
  "openRound": 3,
  "calendarVersion": 1
}
```

**Os números no exemplo são ilustrativos; o valor de `openRound` e
`calendarVersion` deve vir do calendário atual verificado no Cloud,
não deste arquivo.** Não copiar o JSON acima para produção sem reconciliação.

A API exige a identidade de usuário no cabeçalho `Authorization: Bearer`
e JSON (limite 22 KiB), `action:"status"` ou `action:"send"`, sempre
na mesma origem. O servidor recusa todas as escritas quando os estágios,
o calendário, a autorização ou a rodada não correspondem.
A tentativa repetida com a mesma `requestKey` devolve a mesma carta;
a chave usada para conteúdo diferente retorna conflito HTTP 409.

## Conclusão do escopo nesta fase

O código novo foi desenvolvido, com testes sintéticos e CI. Isso NÃO
significa que a migração funcional do jogo tenha terminado.
Permanecem pendentes: serviço Cloud de respostas/edição de cartas,
notificações, interface definitiva do conselho, fichas transacionais,
Espionagem, Jornal, Batalhas e Hub Temporal de produção.

Não usar Cloud Shell como requisito do projeto. A automação GitHub OIDC
existente possui leitura de metadados, **não** possui permissão suficiente
para provisionar o runtime no Firestore nem reativar contas. Qualquer
alteração IAM/contas deve ser auditada e aplicada somente após homologação
real, sem ampliar privilégios genéricos nem registrar segredos no repo.
