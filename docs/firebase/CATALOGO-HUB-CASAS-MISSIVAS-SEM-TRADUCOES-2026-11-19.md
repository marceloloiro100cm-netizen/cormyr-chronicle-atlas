# Cormyr Chronicle Atlas — catálogo português, HUB e Casas/Missivas
Data: 19/11/2026

## Decisão do proprietário
O trabalho atual abrange (1) catálogo das dez Casas ativas, (2) HUB Temporal,
calendário e delta de origem, e (3) runtimes operacionais de Casas/Missivas.
A tradução do catálogo para en/es/de foi **retirada** deste lote e terá
projeto independente. Não declarar traduções inexistentes como aprovadas.

## 1. Catálogo público em português — implementação segura

O módulo `scripts/firebase/public-content-cloud-stage.mjs` agora expõe
`preflightReviewedPublicCatalogStage` e
`publishReviewedPublicCatalogStage`. O modo português usa um digest
de domínio distinto do importador multilíngue e exige:
- exatamente dez Casas ativas da temporada 2, sem IDs, nomes e vínculos
  divergentes do `migrationDomainStage` da mesma origem;
- revisão editorial explícita por Casa (`publicReviewed:true`),
  campos públicos permitidos, galerias seguras e versões coerentes;
- `approvalDigest` da projeção revisada, `explicitApproval:true`, projeto
  fixo `cormyr`, duas origens privadas concluídas e destino vazio.

Uma execução aprovada cria **apenas dois documentos** em transação:
`migrationPublicContentStage/{snapshotId}` e seu
`catalog/published`. O estágio declara `reviewScope:catalog-only`
e `translationsDeferred:true`, **sem** `translationsVersion` nem
subcoleção de traduções. `CORMYR_FIREBASE_PUBLIC_TRANSLATIONS_ENABLED`
fica explicitamente `false` em App Hosting. A rota de tradução permanece
503 até outra implantação dedicada.

A importação do catálogo **não ativa** o runtime, o acesso às Casas, nem
as rotas por si só. A leitura pública só passa com
`publicCatalogApproved`, versões coincidentes e runtime reconciliado,
na ordem original de aprovação.

**Falta evidência real para publicar:** um operador editorial precisa
conferir individualmente as dez Casas do snapshot e seus campos públicos,
registrar aprovação privada do digest e executar a transação autenticada.
A correspondência por nome no arquivo público não constitui revisão.

## 2. HUB Temporal e delta
A auditoria `inspectCloudRuntimeSources` agora expõe dois fatos distintos:
`operationalCalendarPublished` (versão publicada, Harptos coerente,
rodada explicitamente escolhida em um lançamento assinado pelo Narrador)
e `mailRuntimeAligned` (aprovação das duas raízes e da mesma versão/rodada).
Os resultados são somente booleanos, sem datas, nomes, IDs ou valores.

Nenhum deles equivale a provar a **fonte atual** ou que o delta posterior
ao snapshot é nulo. `freshSourceDeltaReconciled`,
`currentRoundApproved`, `readyForPlayers` e `releaseDecision`
continuam propositalmente negativos na auditoria genérica até haver
prova externa correspondente. Não usar `lastRound` histórico para
inventar a semana atual.

O HUB do Narrador já oferece proposta de data e rodada com CAS de versão
e publicação única `/firebase-hub`, protegida por Auth; esta entrega
não aciona `publish` sem uma proposta válida e revisão da origem.

## 3. Casas e Missivas
O adaptador da composição original mantém os filtros por papel e Casa.
A lista de Casas de jogadores endereçáveis nas opções de missivas agora
remove associações históricas a Casas inativas ou de outra temporada;
a associação de origem, por si só, não autoriza envio.

A ativação real exige o lançamento explícito do HUB, a revisão do estado
de cada Casa e a aprovação de ambos os runtimes de correio, seguidas
de E2E em sessões reais. Não modificar globalmente
`mailWriteApproved`, `applicationEnabled` ou as fichas apenas por
passar nos testes sintéticos.

## CI e regras de implantação
Os testes cobrem estágio português atômico, proibição de traduzir,
reconciliação temporal não inferida, runtimes divergentes e filtros de
destinatários ativos. Usar os workflows Build/Validate e merge no GitHub;
a publicação é pelo **Firebase App Hosting**, nunca pelo Lovable,
Supabase ou Vercel.

**Estado: preparação e código, não ativação Cloud presumida.** Não criar
dados falsos, não deduzir identidade de Casa ou rodada e não registrar
informações privadas em workflows ou repositório público.
