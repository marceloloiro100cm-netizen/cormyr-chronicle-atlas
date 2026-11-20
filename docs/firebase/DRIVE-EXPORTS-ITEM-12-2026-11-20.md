# Item 12 — Drive e exportações após migração Firebase

## Correções integradas no código

- O painel **Ficha no Google Drive** diferencia explicitamente o workspace Firebase. Nesse modo, não consulta a tabela legada `noble_house_drive_exports` no Supabase e não dispara `exportHouseToDrive` (função legada). Em vez de apresentar um falso sucesso, informa que a sincronização automática está aguardando homologação.
- O adaptador de leitura Google Drive v3 segue estritamente **somente leitura**. Cada arquivo listado deve ter nome canônico `cormyr-(record|letter|reply)-<uuid>.json`, pertencer à pasta permitida, manter a identidade e o tamanho entre listagem e metadados e conter um envelope cujo tipo e ID coincidam com o nome do arquivo. ETags divergentes entre metadados e bytes impedem aceitação da leitura.
- O workflow de Drive agora também reage a alterações do adaptador Google; executa sua verificação de sintaxe e testes de isolamento/identidade. A suíte geral verifica a interface Firebase sem qualquer chamada ao Supabase.

## Limites mantidos

O endpoint `POST /api/public/jobs/drive-sync` continua aceitando apenas auditoria autorizada e responde 503 ao pedido de `reconcile`. A identidade e as permissões Google reais, a lista de pastas autorizadas, o executor Cloud Firestore com leases, a resolução de conflitos por revisão e o Cloud Scheduler exigem homologação independente antes de qualquer gravação no Drive.

Não criar uma pasta nem copiar/reescrever arquivos automaticamente. Não publicar IDs de pastas, tokens OAuth, nomes de arquivos privados ou registros no GitHub e nos logs. Não usar Supabase, Lovable ou Vercel como destino operacional.

**Aceite final pendente:** OAuth/conta de serviço conectada, prova das pastas e donos, invariantes do snapshot, importações de registros/cartas/respostas, escrita condicional testada em Drive real, exclusões e conflitos por Casa, Scheduler controlado e verificação do commit servido no Firebase App Hosting. Nenhuma execução do Drive real é afirmada neste documento.
