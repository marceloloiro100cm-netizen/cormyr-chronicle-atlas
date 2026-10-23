# Cormyr Chronicle — arquivos da segunda temporada

## Estado atual
Conexão Google Drive vinculada. Registros e respostas são persistidos no banco; uma fila durável contém as versões a exportar. Leitura pode ser verificada pela administração; gravação bidirecional e eventos ainda não foram ativados/validados. Nenhuma entrada pendente significa sincronização concluída.

## Acesso necessário
Conectar a conta do proprietário pelo conector Google Drive do Lovable. A conta deve poder ler, criar e atualizar arquivos nas pastas individuais dos jogadores e compartilhadas das casas. Confirmar IDs das pastas; não tornar pastas privadas públicas. A pasta de segredos do mestre deve ser separada e inacessível aos jogadores. A autorização da conta do site não concede acesso direto ao Drive.

## Formato previsto: cormyr-record-v1
Arquivos JSON UTF-8 com nome `cormyr-<tipo>-<id>.json`. Campos: schema = "cormyr-record-v1", entityType = record|letter|reply, id (UUID estável), houseId, playerId, visibility = house|player|gm, version (inteiro), title, content (texto), createdBy, updatedBy, createdAt, updatedAt, origin = site|drive, mutationId (UUID), baseVersion. Respostas acrescentam letterId, authorUserId, recipientUserId, idempotencyKey. ID e escopo são imutáveis; não permitir conceder permissões por conteúdo do arquivo.

Individuais vão à pasta do jogador; compartilhados à pasta da casa. Segredos nunca vão à pasta compartilhada. Uma missiva de casa pertence à pasta da casa destinatária; uma missiva individual, à pasta do jogador destinatário. As respostas mantêm vínculo com a original e cópias nas pastas dos destinatários autorizados. Documentos antigos permanecem intocados; arquivos incompatíveis não são importados automaticamente.

## Executor a ativar após conexão
Validar scopes e leitura/gravação em pastas de teste, armazenar mapeamento de arquivo e versão do provedor, usar Drive Changes/watch com callback autenticado ou reconciliação por polling documentado. Aplicar autorização da casa e do jogador no servidor antes de cada importação/exportação. Processar a fila com exclusão mútua, tentativas exponenciais e IDs idempotentes; não marcar sincronizado antes de verificar a leitura de retorno. Comparar mutationId/hash de conteúdo para evitar loops. Guardar site_snapshot e folder_snapshot em sync_conflicts quando baseVersion divergir; não sobrescrever. Resolução administrativa gera nova versão preservando ambas. Exibir falha do provedor, última tentativa e última sincronização confirmada.

## Cadastros de jogadores
Administrador pode importar uma lista JSON com name, houseId, userId opcional, folderId opcional e canEdit. Casas oficiais ativas: erdenor, silverky, everlost, hardcourt, fewmerry, goldfin, grantass, ashkar. Cadastro sem userId guarda apenas afiliação oficial (roster_house_id), não autorização. O administrador autoriza vínculo; nenhum arquivo ou cadastro público pode promover uma conta a administrador. Registros históricos silversky e harcourt são preservados inativos, sem associação automática às grafias oficiais.

## Primeiro administrador
Precisa de uma identidade autenticada do proprietário, confirmada fora de campos editáveis pelo usuário. A primeira atribuição é feita por operação privilegiada auditável, nunca pelo primeiro login, email presumido, senha fixa ou metadados da conta. Até essa confirmação, a administração permanece inacessível.