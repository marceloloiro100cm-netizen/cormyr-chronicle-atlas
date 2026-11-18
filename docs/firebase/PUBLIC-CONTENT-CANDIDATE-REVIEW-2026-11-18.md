# Cormyr — pré-preenchimento **privado** do catálogo público (18/11/2026)

O código `scripts/firebase/public-review-candidates.mjs` prepara um rascunho
de revisão para as dez Casas ativas da temporada 2, cruzando o único snapshot
privado com o acervo que já está publicamente no site.

## Evidência que o código verifica

- O projeto deve ter exatamente dez Casas ativas (`season=2`).
- A Casa deve corresponder a **um e somente um** nome no arquivo público.
  Duplicidade de nome, Casa ausente, região ou classificação incompleta
  bloqueiam o preparo do conjunto completo.
- A origem privada deve ter IDs válidos e distintos, sem confundir Casa
  de outra temporada com membro ativo.
- Referências públicas para brasões e históricos são apenas sugestões.
  Elas não entram automaticamente na `gallery` nem em `narrative_text`.

## O que o rascunho guarda — SOMENTE na memória privada

Um objeto `privateDraft` contém `snapshotId`, IDs da origem, nome,
região e classificação candidatos; cada Casa vem com:

```js
publicReviewed: false
narrative_text: null
gallery: []
updated_at: null
```

As traduções para `en`, `es`, `de` começam vazias e nenhum vínculo de
jogador com Casa é presumido. A função `planReviewedPublicContent` **rejeita**
um draft ainda não revisado. Somente revisão específica e aprovação formal
podem mudar esse estado e gerar o digest destinado ao estágio atômico.

O `privateDraft` tem dados da origem e **não pode ir para commits, artifacts
públicos, logs, issues, comentários, telemetria ou GitHub Actions summary**.

## O que efetivamente entra nos logs

A auditoria OIDC protegida consulta a origem e retém apenas o resumo
agregado `summary`, com número de Casas candidatas, ausentes, ambíguas e
referências de mídia. Não contém UID, nome da Casa, IDs de origem ou
texto narrativo. Um job verde significa somente inspeção correta, **não**
aplicação de revisão.

## Passos que continuam pendentes

1. Conferência editorial dos dez nomes/identidades e da região/classe.
2. Aprovação de conteúdo público, imagens, textos, dados históricos e das
   traduções de cada registro (`publicReviewed=true` deliberado).
3. Aprovação do digest produzido em ambiente privado.
4. Só então executar `publishReviewedPublicStage` com a fonte revisada;
   o importador verifica os dez IDs e nomes diretamente contra Firestore
   antes de criar os cinco documentos em uma única transação.

Não executar a importação usando apenas as correspondências de nome.
Não liberar o runtime de Casas ou correio pela presença do estágio público.
**Release: NO_GO**, sem mudanças no Firebase Cloud.
