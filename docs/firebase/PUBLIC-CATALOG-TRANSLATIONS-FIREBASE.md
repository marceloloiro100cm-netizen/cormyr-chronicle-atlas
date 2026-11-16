# Firebase — Catálogo e Traduções públicos (leitura sem Supabase)

As rotas anônimas `GET /api/public/catalog` e `GET /api/public/translations?locale=en|es|de` passam a utilizar **Firebase Admin no servidor** e deixam de consultar `house_catalog`, `public_player_houses` ou `campaign_translations` do Supabase.

**Este PR não cria nem importa dados no Firestore.** A etapa pública descrita a seguir é um contrato novo para um provisionador futuro, ainda não presente no Firebase Cloud. Assim, respostas HTTP **503** são esperadas até a reconciliação real: nunca preencher com dados inventados, importar coleções privadas diretamente nem religar Supabase como fallback.

## Política obrigatória de publicação

Os endpoints são **desabilitados por padrão**. Para atender qualquer requisição é preciso:

- `CORMYR_FIREBASE_SNAPSHOT_ID`: hash SHA-256 de snapshot reconciliado, configurado exclusivamente no servidor.
- `CORMYR_FIREBASE_PUBLIC_CATALOG_ENABLED=true`, para catálogo, ou `CORMYR_FIREBASE_PUBLIC_TRANSLATIONS_ENABLED=true`, para tradução. Nenhuma é habilitada neste PR.
- Documento privado `campaignCloudRuntime/{snapshotId}` com `status=active`, `private=true`, `sourceSnapshotId={snapshotId}`, `sourceSnapshotReconciled=true`, `applicationEnabled=true`.
- Para catálogo: `publicCatalogApproved=true`, `catalogVersion` inteiro positivo igual a `publishedCatalogVersion`. Para traduções: `publicTranslationsApproved=true`, `translationsVersion` inteiro positivo igual a `publishedTranslationsVersion`.
- Etapa privada **nova**, não criada por este PR: `migrationPublicContentStage/{snapshotId}`, com `status=complete`, `private=true`, `sourceSnapshotId={snapshotId}`. Essa etapa **não é** a coleção `migrationDomainStage/houses`, que não contém region/classification/narrative/revisão pública.

Sem qualquer requisito, a rota retorna erro genérico JSON HTTP 503, `no-store`, sem IDs/hashes/documentos/metadados. O Firebase Admin ignora Firestore Rules, portanto todas as projeções são validadas no servidor. Nenhum token do usuário ou campo de origem pode selecionar um snapshot.

## Estrutura futura da etapa pública

`migrationPublicContentStage/{snapshotId}/catalog/published`: documento de versão `version: publishedCatalogVersion`, `houses` (0 a 250 entradas) e `playerHouses` (0 a 250 entradas). Cada House de `houses` deve estar ativa, na temporada 2, `publicReviewed:true`, e ter `id`, `name`, `region`, `classification`, `updated_at` (ISO ou null), `gallery` (URLs/pastas públicas, array de strings) e `narrative_text` (texto revisado ou null). A resposta só revela os oito campos de origem autorizados pelo contrato legado, sem `archive_data`, saldo, notas ou relações privadas. `playerHouses` deve ser uma lista distinta de objetos `{house_id}` referindo-se apenas a Casas publicadas; ela não confere permissões a jogadores.

`migrationPublicContentStage/{snapshotId}/translations/en` (ou `es`, `de`): documento `{version,locale,rows}`, com no máximo 5000 registros. Cada registro deve conter `publicReviewed:true` e `entity_type`, `entity_id`, `field_name`, `translated_text`. Só `region`, `house` e `constitution` são permitidos; tipos privados como `record`, `event` e `adventure` rejeitam **todo** o documento (não são silenciosamente omitidos). Tradução de Casa exige que a Casa esteja publicada no catálogo do **mesmo snapshot**. IDs e campos são strings simples sem separadores de path, as chaves não podem se repetir e o JSON final tem orçamento máximo de 650 KiB aproximadamente. Sem aprovação por registro, não há publicação.

### Invariantes da execução

- Somente leitura; nenhuma gravação/importação em Firestore, Storage, Auth, IAM ou flags.
- Emuladores são bloqueados pelo adaptador Cloud; não direcionar variáveis de emulador ao App Hosting.
- `src/lib/i18n/i18n.functions.ts` ainda contém um leitor server-side e um editor legado baseados no Supabase, assim como `src/routes/auth.tsx`. **Este PR não afirma migrar essas funções**, que devem ser abordadas em etapas separadas com autorização real por Narrador.
- Os workflows de aceitação pública podem ficar tecnicamente **verdes** mesmo quando `publicReadinessPassed=false`; a leitura anônima real e os direitos por perfil precisam de homologação independente.
- `readyForCutover=false`; nenhuma flag nova é habilitada automaticamente.

## Testes

`firebase-public-content.server.test.ts` cobre saída mínima, duplicações, limite de payload, importações incompletas, fontes divergentes, dados não revisados, contas/rostos não publicados, URLs potencialmente perigosas, tradução privada, ausência de autorização e falhas de configuração, sem acessar Firebase real.

PR vinculado ao bloqueio de IAM/Auth [#513](https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas/issues/513).
