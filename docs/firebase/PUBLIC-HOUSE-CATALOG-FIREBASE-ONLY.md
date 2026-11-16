# Catálogo público das Casas — Firebase-only

A rota anônima `GET /api/public/catalog` foi preparada para funcionar **sem consultas ao Supabase**. O Firebase Admin SDK acessa os documentos exclusivamente no servidor. A origem histórica do catálogo é o estágio privado `migrationSpyStage/{snapshot}/catalog`, que contém `id`, `name`, `region`, `classification` e o booleano `publicReviewed`; os nomes das Casas da segunda temporada vêm de `migrationDomainStage/{snapshot}/houses`.

## Publicação somente com dupla aprovação

O endpoint retorna **503 JSON**, sem dados privados, enquanto qualquer controle estiver ausente. Requisitos:

1. A flag de runtime `CORMYR_FIREBASE_PUBLIC_CATALOG_ENABLED=true` e um `CORMYR_FIREBASE_SNAPSHOT_ID` SHA-256 válido, ambos configurados em ambiente de produção aprovado. A PR **não liga essas flags**.
2. Documento privado `campaignCloudRuntime/{snapshot}`: `status=active`, `private=true`, `sourceSnapshotId={snapshot}`, `sourceSnapshotReconciled=true`, `applicationEnabled=true` e **`publicCatalogApproved=true`**.
3. Metadados manuais e verificados no mesmo runtime: `publicCatalogVersion` inteiro positivo, `publicCatalogExpectedReviewedCount` inteiro entre 1 e 250, `publicCatalogExpectedPlayerHouseCount` entre 1 e 25 e `publicCatalogPlayerHouseIds` (array de IDs únicos aprovados e seguros, do mesmo tamanho do total previsto).
4. Raízes `migrationSpyStage` e `migrationDomainStage` devem estar **`status=complete`, `private=true`**, com contagens históricas válidas. A consulta é limitada a **251 documentos por coleção**. Contagens ausentes, duplicadas, incompatíveis ou excedentes bloqueiam a resposta.
5. Cada registro do catálogo deve ter ID/document ID concordantes, nome e região seguros, classificação `noble`, `major` ou `royal`, e `publicReviewed` booleano explícito. **Somente registros `publicReviewed=true`** entram na resposta; a quantidade precisa ser exatamente a aprovada.
6. Cada ID listado em `publicCatalogPlayerHouseIds` deve pertencer ao catálogo público aprovado e a uma Casa `active=true, season=2` do estágio de domínio. Nenhuma conta, UID, identidade ou vínculo privado é exposto.

Esses valores precisam ser obtidos e validados dos **dados reais**, com revisão humana. **Não criar runtime/documentos, não definir flags nem adivinhar contagens apenas para fazer a rota responder HTTP 200.**

## Contrato público

Mantém o contrato existente com as chaves `houses` e `playerHouses`. A primeira contém somente `id`, `name`, `region`, `classification`, `updated_at:null`, `gallery:[]` e `narrative_text:null`. A segunda contém **apenas** `house_id`, suficiente para a escolha de Casa na tela de login e sem informação sobre o jogador.

**Limitação do catálogo importado:** o estágio atual não inclui galerias revisadas, timestamps nem os textos narrativos completos. Esses campos são preservados no contrato como valores vazios/nulos, **não preenchidos por suposição**. A futura importação de imagens/textos públicos necessita revisão separada e de uma fonte explicitamente pública. Não ler `archive_data`, os dossiês de espionagem, as fichas econômicas, notas do Narrador ou membros de Casas para preencher a resposta.

## Estado de migração

A alteração remove o Supabase da rota do catálogo, mas não habilita por si só o catálogo público no domínio. O último monitoramento público ainda encontrou HTTP 503 nas rotas de dados. A pendência [IAM/Auth #513](https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas/issues/513) e a reconciliação real continuam bloqueando liberação de jogadores.

O login em `src/routes/auth.tsx` ainda possui dependências históricas de autenticação separadas deste endpoint; a escolha visual de Casa nunca concede permissão. Migração e validação de Auth são etapas diferentes.

## Testes

`firebase-public-house-catalog.server.test.ts` usa somente fixtures sintéticos e Firestore simulado. Verifica publicação válida, listas revisadas, resultado sem dados privados, limite de consultas, raiz ausente, versão/contagem divergentes, documentos duplicados, Casas não aprovadas, temporada errada, flag desativada, token de emulador e tentativa de seleção de Casa especial.

Sem Cloud Shell, Supabase na rota, escrita no Firebase ou mudança de IAM. `readyForCutover=false` até os demais portões de produção.
