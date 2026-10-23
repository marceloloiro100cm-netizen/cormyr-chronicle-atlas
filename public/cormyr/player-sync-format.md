# Cormyr Chronicle — arquivos da segunda temporada

## Estado atual
Executor server-side implementado; leitura e gravação verificadas na conexão existente. Oito pastas de jogadores e uma pasta privada do Narrador estão autorizadas. Cada cópia é confirmada por leitura de retorno; pendente não significa sincronizado.

## Acesso necessário
Conectar a conta do proprietário pelo conector Google Drive do Lovable. A conta deve poder ler, criar e atualizar arquivos nas pastas individuais dos jogadores e compartilhadas das casas. Confirmar IDs das pastas; não tornar pastas privadas públicas. A pasta de segredos do mestre deve ser separada e inacessível aos jogadores. A autorização da conta do site não concede acesso direto ao Drive.

## Formato previsto: cormyr-record-v1
Arquivos JSON UTF-8 `cormyr-<record|letter|reply>-<UUID>.json`. Campos obrigatórios: schema="cormyr-record-v1", entityType, id (UUID), houseId (string ou null), playerId (UUID ou null), visibility=house|player|master, version (inteiro positivo), baseVersion (inteiro não negativo), title, content, createdAt, updatedAt, origin=site|drive, mutationId (UUID). `kind=document|character|details` nos registros; `letterId` nas respostas; `authorName` opcional. Campos desconhecidos são rejeitados. Não incluir credenciais, papéis ou permissões. Autor de importação é derivado da confirmação administrativa, nunca de texto externo. Segredos `gm` não são exportados, inclusive para a pasta do mestre; `master` destina-se às cópias de missivas e respostas na pasta privada do Narrador.

Para editar registro já sincronizado: conservar ID, escopo e kind; incrementar version em 1, definir baseVersion para a versão anteriormente lida, origin="drive" e mutationId novo. Novos documentos/respostas exigem aprovação na administração antes de entrar no site. O Narrador pode editar missivas no site: a versão aumenta e o histórico anterior permanece em letter_versions. Respostas são novos arquivos reply na pasta individual. O autor deve estar autenticado e autorizado a receber a missiva.

Individuais vão à pasta do jogador; compartilhados à pasta da casa. Segredos nunca vão à pasta compartilhada. Missivas de casa também chegam às pastas individuais de seus membros autorizados. Os documentos compartilhados da casa podem ter cópias nas pastas dos membros com autorização confirmada. As respostas mantêm vínculo com a original e cópias nas pastas dos destinatários autorizados. Documentos antigos permanecem intocados; arquivos incompatíveis não são importados automaticamente.

## Executor e acionamento
Reconciliação por polling consolidado a cada hora, usando `/api/public/jobs/drive-sync` com autenticação gerenciada; a administração também pode executar/retentar. O site está publicado; esta atualização ainda depende de publicação autorizada para o agendamento usar o executor atualizado. Não depende de navegador aberto. Mantém retentativas exponenciais (30 segundos até uma hora); a execução horária determina o atraso efetivo. Não há watch/webhook Google configurado. Pode haver dispersão de aproximadamente 30 segundos após a hora. Custo: 24 chamadas de reconciliação por dia; pastas não autorizadas não são consultadas nem escritas.

Mapeamentos têm lease persistente (2 minutos), versão remota ETag e comparação de conteúdo sem campos de transporte; exportação usa If-Match e só confirma após leitura de retorno. Sem ETag, nunca sobrescreve: cria versão imutável cormyr-<tipo>-<UUID>-v<versão>-<SHA256>.json. O hash identifica a cópia lida, não autoriza atualização. Antes de repetir upload busca esse nome estável. Duplicatas exigem revisão. Versões anteriores e documentos-fonte ficam intactos. Exclusões remotas não apagam conteúdo do site: nunca há exclusão automática. Arquivos históricos/incompatíveis permanecem intocados.

Conflitos e novas importações guardam os dois snapshots em `drive_sync_inbox`, somente visíveis ao administrador. Resolução aceita pasta/site/conciliação/rejeição; histórico anterior continua em `record_versions`, snapshot externo permanece na revisão. Registros já mapeados podem importar edições sequenciais automaticamente por transação; novas respostas exigem revisão e autor autorizado. Respostas só exibem sincronizado após confirmação dos destinos privados do autor e destinatário; cópia compartilhada da casa, quando apropriada, é adicional. Segredos do mestre permanecem exclusivamente no site.

## Pendências operacionais
Gravações novas foram confirmadas na conexão atual, sem pedir novas credenciais. Edições em documentos-fonte antigos não são feitas: o site cria cópias versionadas. Confirmar entrega do agendamento após publicar esta atualização; revisões de grafias Silverky/Silversky e Hardcourt/Harcourt permanecem administrativas. Nenhum segredo deve ser enviado no chat.

## Cadastros de jogadores
Administrador pode importar uma lista JSON com name, houseId, userId opcional, folderId opcional e canEdit. Casas oficiais ativas: erdenor, silverky, everlost, hardcourt, fewmerry, goldfin, grantass, ashkar. Cadastro sem userId guarda apenas afiliação oficial (roster_house_id), não autorização. O administrador autoriza vínculo; nenhum arquivo ou cadastro público pode promover uma conta a administrador. Registros históricos silversky e harcourt são preservados inativos, sem associação automática às grafias oficiais.

## Primeiro administrador
Precisa de uma identidade autenticada do proprietário, confirmada fora de campos editáveis pelo usuário. A primeira atribuição é feita por operação privilegiada auditável, nunca pelo primeiro login, email presumido, senha fixa ou metadados da conta. Até essa confirmação, a administração permanece inacessível.