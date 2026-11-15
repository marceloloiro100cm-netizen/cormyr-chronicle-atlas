# Storage: autorização por objeto (núcleo puro)

`scripts/firebase/storage-access-core.mjs` porta as políticas de `storage.objects` (0010, 0017 a 0021, 0058/0059, 0111, 0117, 0118 e 0120) para uma função pura `canAccess({actor,op,bucket,name,facts})`. Nega por padrão: bucket, operação ou caminho sem política é recusado, como no SQL. Caminhos com `..`, barra inicial, `//`, barra invertida ou mais de 1024 caracteres são negados.

| Bucket | Leitura | Envio | Exclusão |
| --- | --- | --- | --- |
| `campaign-images` | Narrador; pasta do próprio `uid`; conteúdo legível que embute o caminho; brasão de Casa da qual é membro; galeria pública revisada (inclusive anônimo) | pasta do próprio `uid`, com jogador ativo ou Narrador | sem política (negado) |
| `campaign-newspapers` | predicado do ativo do jornal | editor do jornal e predicado de envio | negado |
| `campaign-newspaper-commissions` | editor do jornal ou membro da Casa da primeira pasta | nome `<casa>/<uuid>.png\|jpg\|webp`; Narrador ou editor da Casa | negado |
| `campaign-newspaper-staff` e `-engravings` | editor do jornal | editor do jornal, nome `<uuid>.png\|jpg\|webp` | editor do jornal |

Os predicados que dependem de outros domínios entram como `facts` resolvidos por quem chama: `referencedByReadableContent` (carta entregue e legível, resposta ou registro legível que cita `[cormyr-image:<caminho>|`), `crestHouseId` (Casa cuja ficha tem `identity.crestPath` igual ao caminho), `publicGalleryImage`, `canEditNewspaper`, `newspaperAssetReadable` e `newspaperAssetUploadAllowed`.

## Serviço (emulador)

`storage-access-service.mjs` expõe `authorize({idToken,op,bucket,name})`, que devolve `true` ou lança `StorageAccessError('denied')`. Ele verifica o ID token, resolve o ator a partir de `access` e `players` do estágio, e resolve sozinho `canEditNewspaper` (Narrador ou Leonardo da Casa `espiao`) e `crestHouseId` (ficha da Casa com `identity.crestPath` idêntico ao caminho). Sem token, só vale a leitura da galeria pública; token inválido é negação, nunca anônimo.

Os demais fatos entram por `resolvers` injetados: `referencedByReadableContent`, `publicGalleryImage`, `newspaperAssetReadable`, `newspaperAssetUploadAllowed`. Resolver ausente vale `false`, então o serviço só pode negar a mais. Teste de integração no emulador: `storage-access-service.integration.mjs` (job `storage-access-emulator`).

## O que falta

Implementar os quatro resolvers sobre os estágios de cartas, registros, galeria e jornal, a importação real dos objetos de Storage e a emissão de URLs assinadas. Nada aqui toca produção.
