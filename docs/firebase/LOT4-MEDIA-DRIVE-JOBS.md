# Lote 4 — arquivos, Google Drive e automações

## Situação verificável

Fatia técnica implementada em branch de homologação. O sistema ativo continua com o backend Supabase/Lovable Cloud; **não** substituir Storage, Drive ou agendadores reais enquanto Auth, Firestore, permissões e adaptadores não passarem na nuvem. `readyForCutover=false`.

| Frente | Implementação | Limite |
| --- | --- | --- |
| Mídia da campanha | `verify-storage-homologation.mjs` lista metadados de objetos por Google Cloud Storage JSON API e compara caminho relativo, tamanho, CRC32C e MD5 (se presente dos dois lados) | Não faz cópia, não altera ACLs e não verifica as permissões do aplicativo |
| Bucket privado | CI somente leitura com OIDC `cormyr-gh-reader` audita existência de checksum CRC32C e tamanho em `gs://cormyr-migration-homolog-477785088395/campaign-images/` | Só tem acesso ao destino. **Não comprova igualdade com origem** |
| Google Drive | `google-drive-read-adapter.mjs` usa Google Drive v3 para listar e ler JSON em pasta explicitamente permitida e valida o envelope do jogo | `write()` nega sempre; não conectado à sincronização de produção |
| Verificação do Drive | `probe-google-drive-homologation.mjs` consulta até 20 arquivos com token temporário, expondo só contagens | Só leitura e só por execução explícita do operador |
| Jornal/espionagem | `serve-jobs-emulator.mjs` conecta os serviços existentes `publishDue` e `advanceMissions` a um HTTP local limitado a loopback, protegido por `CRON_SECRET` | **Cloud Scheduler não configurado**, nenhum job de produção criado |

## Storage — verificação da cópia sem escrever nada

Já havia registro de **986 objetos** copiados em 13/11/2026 do prefixo original `migration-staging/campaign-images/` para o bucket privado de homologação, mas isso prova somente quantidade, não igualdade de bytes.

### Evidência real e diferença entre métodos de listagem

A verificação autenticada após PR #466 obteve **779 objetos reais** pelo JSON API (2.107.760.075 bytes com CRC32C válido). A execução após PR #467 confirmou **986 linhas `gs://...`** no comando `gcloud storage ls --recursive` sobre o mesmo prefixo. Não é correto comparar automaticamente as duas contagens como se cada linha CLI fosse um objeto: o `gcloud` pode emitir também entradas de diretório/prefixo virtual.

O auditor do Lote 4 agora analisa **ambas as listagens em memória**, diferencia entradas de pasta que não aparecem como objetos no JSON API, deduplica nomes e verifica se os conjuntos de objetos são equivalentes. Só mostra quantidades (não nomes, paths privados, tokens nem hashes individuais).

A marcação de sucesso exige que as listagens correspondam aos mesmos objetos e que a contagem histórica de **986 entradas CLI** seja explicada. Nenhum dado é copiado, criado ou excluído; **igualdade de listagem ainda não prova checksum dos bytes da origem**.

O proprietário continua precisando executar `--readonly-live` no Cloud Shell com permissão de leitura dos dois buckets para validar a cópia por CRC32C/tamanho. Não alterar o baseline de forma automática nem afirmar perda de 207 imagens sem inventário reconciliado.

O workflow **Firebase Lote 4 - media Drive and jobs**, na `main`, autentica a conta de serviço limitada `cormyr-gh-reader` somente no bucket privado e confere os campos CRC32C dos objetos existentes. Os resultados incluem contagens e tamanho total em bytes, nunca nomes.

Para comparar **origem x destino**, o proprietário pode executar no Cloud Shell (sessão previamente autorizada a listar ambos):

```bash
cd ~/cormyr-chronicle-atlas
git pull --ff-only origin main
node scripts/firebase/verify-storage-homologation.mjs --readonly-live
```

O script exige `gcloud` com projeto ativo `cormyr` e compara integralmente todas as páginas da API JSON (até 50.000 objetos) sem imprimir caminhos. As funções usam requisições apenas `GET` autenticadas com token temporário do `gcloud`. Se houver arquivo ausente, extra, checksum ou tamanho divergente, retorna falha. **Uma comparação perfeita ainda não prova freeze da origem, permissões de leitura por Casa ou integridade de outros buckets.**

Somente os objetos do prefixo `campaign-images` estão cobertos por esta auditoria. Os buckets `campaign-newspapers`, `campaign-newspaper-staff`, `campaign-newspaper-commissions` e `campaign-newspaper-engravings` precisam de transferência, manifests e reconciliação próprias. Não conceder IAM na origem nem habilitar Uniform Bucket-Level Access no bucket antigo.

## Google Drive — leitura isolada, sem escrita

O adaptador aceita apenas IDs de pastas incluídos na configuração do servidor. Cada arquivo precisa ter MIME JSON, estar na pasta autorizada, declarar tamanho seguro e passar na validação estrita do `cormyr-record-v1`. A leitura reconfere os metadados após listagem; não aceita URLs arbitrárias nem retorna tokens ao navegador.

Para homologar com uma identidade OAuth que possua `drive.readonly`, fornecer no ambiente local, **sem colocar credenciais no GitHub ou em logs**, as variáveis `GOOGLE_DRIVE_HOMOLOGATION_FOLDER_ID` e `GOOGLE_DRIVE_HOMOLOGATION_ACCESS_TOKEN`. Em ambiente privado:

```bash
node scripts/firebase/probe-google-drive-homologation.mjs --readonly-probe
```

O probe lista só a pasta escolhida e valida até 20 arquivos de envelope; não importa nem modifica documentos. A sincronização em mão dupla continua bloqueada até a conexão oficial com Google OAuth/Service Account, teste real de ETag/conflito e autorização de todas as pastas.

## Automações — homologação local

O servidor local exige `FIRESTORE_EMULATOR_HOST=127.0.0.1:8080`, o snapshot de homologação `CORMYR_JOBS_SNAPSHOT` (hash de 64 caracteres), `CORMYR_JOBS_ACTOR_UID` de um Narrador ativo fictício e `CRON_SECRET` aleatório de no mínimo 32 caracteres. Porta padrão `8790` somente em `127.0.0.1`.

```bash
node scripts/firebase/serve-jobs-emulator.mjs
```

As rotas aceitam somente `POST`, com `Authorization: Bearer` válido, sem corpo, sem cookie, sem origem remota ou encaminhamento de host:

- `/api/firebase-jobs/publish-due` — publicação de jornal;
- `/api/firebase-jobs/advance-missions` — avanço de espionagem;
- `/api/firebase-jobs/all` — ambas, com resposta agregada.

O componente de domínio já testa idempotência, Narrador autorizado e resultados sem dados privados.

**Cloud Scheduler real é pendência, não ativar ainda.** A produção precisa de endpoint HTTPS implantado no backend Firebase, conta de serviço com mínimo IAM e validação OIDC (ou segredo com rotação e proteção equivalentes), além do Firebase Cloud transacional. O runner só existe em `localhost` e jamais deve ser publicado na Internet.

## Critérios para aceitar o Lote 4 integralmente

1. Provar igualdade de checksum/bytes entre fonte ativa congelada e **todos os cinco** buckets de destino. Resolver divergências sem apagar a origem.
2. Implementar autorização de Storage para narrador, jogador da Casa, outra Casa, editor e anônimo, com URLs de curta duração ou gateway que confira os fatos reais a cada requisição.
3. Conectar Drive real ao app com autorização das pastas e operações condicionais de escrita, incluindo ETag, revisão de conflitos e fila de reprocessamento. Testar migração de registros, cartas e respostas.
4. Implantar de forma controlada os dois agendamentos em Cloud Scheduler, sem criar duplicidade com os jobs existentes do Supabase, testando credenciais, execução idempotente e retry.
5. Validar end-to-end no Firebase Cloud e preservar rollback. Não desativar Supabase, não alterar SQL/RLS da origem e não publicar regras permissivas.

**Status:** código e testes de homologação avançados; as operações Cloud, Storage completo, Drive com escrita e Scheduler ainda não foram concluídos. Não contar os 9 pontos percentuais inteiros do Lote 4.


## Auditoria local dos ZIPs privados contra o manifesto

Para os arquivos exportados anteriormente em ZIP, a verificação abaixo usa
**somente Python padrão em máquina local**, nunca envia arquivos ou caminhos ao
GitHub, Firebase, Drive ou qualquer API. Os testes de CI usam apenas dados
fictícios, nunca os ZIPs privados da campanha.

```bash
python3 scripts/firebase/audit-local-media-coverage.py \
  --manifest "/CAMINHO-PRIVADO/campaign-images.manifest.json" \
  --campaign-images-zip "/CAMINHO-PRIVADO/bucket-campaign-images-files.zip" \
  --campaign-images-zip "/CAMINHO-PRIVADO/bucket-campaign-images-files (1).zip" \
  --campaign-newspapers-zip "/CAMINHO-PRIVADO/bucket-campaign-newspapers-files.zip" \
  --campaign-newspaper-staff-zip "/CAMINHO-PRIVADO/bucket-campaign-newspaper-staff-files.zip"
```

Adicione um `--campaign-images-zip` por arquivo até incluir todos os volumes.
Os outros dois buckets suportados são
`--campaign-newspaper-commissions-zip` e
`--campaign-newspaper-engravings-zip`, quando houver arquivos disponíveis.

O auditor valida o manifesto SHA-256, rejeita referências duplicadas ou
inseguras, lê integralmente os ZIPs e verifica CRC32 e hash dos bytes sem
extraí-los. Pode identificar a mesma imagem referenciada por diferentes
caminhos mediante hash idêntico; isso **não** comprova a associação original
do caminho nem autoriza importar ou liberar leitura por Casa.

A saída contém somente contagens agregadas por bucket, nunca nomes, IDs,
paths privados, checksums individuais ou conteúdos. Um manifesto com
`complete=false` sempre impede `imageArchiveCoverageComplete=true`,
mesmo quando os ZIPs cobrem todas as entradas conhecidas. Buckets sem
manifesto próprio só recebem verificação local de integridade, não de
cobertura. O retorno não significa igualdade dos bytes no destino GCS, nem
congelamento da origem ou aceite das ACLs: `readyForCutover=false` permanece
obrigatório.

É seguro repetir em novas exportações privadas, sem commit ou upload dos
arquivos para o repositório público.
