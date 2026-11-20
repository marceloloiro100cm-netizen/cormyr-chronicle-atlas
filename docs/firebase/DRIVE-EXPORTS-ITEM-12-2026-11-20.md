# Item 12 — Drive e exportações após migração Firebase

## Correções integradas no código

- O painel **Ficha no Google Drive** diferencia explicitamente o workspace Firebase. Nesse modo, não consulta a tabela legada `noble_house_drive_exports` no Supabase e não dispara `exportHouseToDrive` (função legada). Em vez de apresentar um falso sucesso, informa que a sincronização automática está aguardando homologação.
- O adaptador de leitura Google Drive v3 segue estritamente **somente leitura**. Cada arquivo listado deve ter nome canônico `cormyr-(record|letter|reply)-<uuid>.json`, pertencer à pasta permitida, manter a identidade e o tamanho entre listagem e metadados e conter um envelope cujo tipo e ID coincidam com o nome do arquivo. ETags divergentes entre metadados e bytes impedem aceitação da leitura.
- O workflow de Drive agora também reage a alterações do adaptador Google; executa sua verificação de sintaxe e testes de isolamento/identidade. A suíte geral verifica a interface Firebase sem qualquer chamada ao Supabase.

## Limites mantidos

O endpoint `POST /api/public/jobs/drive-sync` continua aceitando apenas auditoria autorizada e responde 503 ao pedido de `reconcile`. A identidade e as permissões Google reais, a lista de pastas autorizadas, o executor Cloud Firestore com leases, a resolução de conflitos por revisão e o Cloud Scheduler exigem homologação independente antes de qualquer gravação no Drive.

Não criar uma pasta nem copiar/reescrever arquivos automaticamente. Não publicar IDs de pastas, tokens OAuth, nomes de arquivos privados ou registros no GitHub e nos logs. Não usar Supabase, Lovable ou Vercel como destino operacional.

**Aceite final pendente:** OAuth/conta de serviço conectada, prova das pastas e donos, invariantes do snapshot, importações de registros/cartas/respostas, escrita condicional testada em Drive real, exclusões e conflitos por Casa, Scheduler controlado e verificação do commit servido no Firebase App Hosting. Nenhuma execução do Drive real é afirmada neste documento.

## Continuação — Histórico e relatórios locais

A navegação da Ficha continha a seção `history` com os botões
**Excel** e **Baixar PDF**, mas a filtrava da barra lateral.
O menu agora torna **Histórico e documentos** acessível às Casas
autorizadas e ao Narrador, inclusive quando a Ficha está em modo
somente leitura. O acesso não habilita compras, edição, importações
financeiras ou sincronização com Google Drive: essas operações
continuam sujeitas às flags e permissões existentes.

O relatório é gerado no navegador a partir da Ficha e do livro-razão
que o servidor Firebase já permite consultar para a Casa. Os dados
de outra Casa não podem ser solicitados pelo campo `houseId`.
A prévia operacional na tela permanece limitada aos 100 lançamentos
mais recentes; os botões PDF e Excel agora usam uma **consulta separada
autorizada por Casa** (kind `houseLedgerExport`) que busca o histórico
importado e operacional disponível até 1.000 lançamentos. Acima desse
limite, a API retorna HTTP 413 e nenhum relatório parcial é baixado.
Para históricos maiores, será necessária paginação autorizada e
conciliação do acervo. A sincronização Drive não é acionada pelo
download de arquivos locais.
