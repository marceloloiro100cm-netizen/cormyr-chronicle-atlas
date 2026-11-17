# Ativar o piloto de leitura no Firebase (passo a passo do proprietário)

**Data:** 17/11/2026. **Objetivo:** liberar aos jogadores a consulta (somente
leitura) da ficha da Casa, missivas, calendário, Jornal, espiões e batalhas
pela página `/firebase-access`, lendo o snapshot já importado no Firestore.

## Por que este é o próximo passo

O código da leitura já está pronto e publicado:

- a página `/firebase-access` já exibe ficha da Casa, recursos, posses,
  exército, construções, crônica, calendário, missivas e Jornal
  (`src/routes/firebase-access.tsx`, componentes `src/components/houses/Firebase*`);
- a API `/api/firebase-cloud-read` já passa pela barreira do modo arquivo
  (`src/lib/archive-only.ts`) e só lê com token Firebase válido, acesso ativo
  e escopo por Casa (`scripts/firebase/cloud-readonly-service.mjs`);
- ela lê os estágios `migrationDomainStage`, `migrationAuthStage`,
  `migrationNobleHouseStage`, `migrationTimeEngineStage`,
  `migrationNewspaperRuntimeStage` e `migrationSpyStage`, exatamente os seis
  que a auditoria protegida de 17/11 confirmou importados (6/6).
- a única exceção é a lista de batalhas, que lê `migrationBattleStage`. Esse
  estágio não está entre os seis auditados; se não existir, só o quadro
  "Batalhas registradas" mostra indisponível, o resto funciona.

**Não depende** de `campaignCloudRuntime`, `campaignMailRuntime` nem do
conteúdo público pendente. Esses só são necessários para gravar (enviar
missiva, publicar Jornal, comprar construção).

O único motivo de a API responder 503 hoje é que as duas variáveis abaixo
não estão configuradas no App Hosting.

## O que o jogador verá

Os dados do snapshot privado da migração (cópia de novembro), em modo
somente leitura. Nada que aconteceu depois do snapshot aparece até a
reconciliação do delta. Contas com acesso inativo ou troca de senha
pendente continuam recebendo "acesso negado" (ver
`VINCULOS-PENDENTES-FORMULARIO.md`).

## Passos (cerca de 10 minutos, no terminal com o Firebase CLI)

1. **Obter o ID do snapshot.** É o identificador de 64 caracteres
   hexadecimais do documento em `migrationDomainStage` (Console do
   Firebase, Firestore, coleção `migrationDomainStage`; há um único
   documento). Não cole esse ID no GitHub: o repositório é público.

2. **Criar o segredo no App Hosting:**

   ```bash
   firebase apphosting:secrets:set CORMYR_FIREBASE_SNAPSHOT_ID --project cormyr
   # cole o ID quando pedir; aceite conceder acesso ao backend
   ```

3. **Conferir as permissões da conta de serviço do App Hosting**
   (`firebase-app-hosting-compute@cormyr.iam.gserviceaccount.com`, ou a que
   aparecer no backend). Ela precisa ler o Firestore e consultar usuários do
   Auth. No IAM do projeto `cormyr`, confirme que ela tem leitura do Firestore
   (`Cloud Datastore Viewer`) e leitura do Auth (`Firebase Authentication
   Viewer`). Se já tiver papéis mais amplos (Firebase Admin), não precisa
   mudar nada.

4. **Descomentar o bloco "Piloto de leitura" em `apphosting.yaml`** (já
   deixado pronto neste PR) e fazer o merge. O App Hosting gera um novo
   rollout automaticamente.

   Atenção: faça o passo 2 **antes** deste. Se o segredo não existir, o
   rollout falha (o site atual continua no ar, mas novos deploys travam
   até o segredo ser criado).

5. **Testar** seguindo `ROTEIRO-TESTE-REAL-POR-PERFIL.md`, parte A.

## Como desligar

Comentar de novo o bloco em `apphosting.yaml` (ou trocar
`CORMYR_FIREBASE_CLOUD_READ_ENABLED` para `"false"`) e fazer o merge. A API
volta a responder 503 sem afetar mais nada.

## O que continua bloqueado depois disso

- gravação (missivas, Jornal, construções, tesouro): exige os runtimes
  `campaignCloudRuntime` e `campaignMailRuntime` e as flags próprias;
- conteúdo público revisado (catálogo, traduções, galeria);
- desligamento definitivo do Supabase.
