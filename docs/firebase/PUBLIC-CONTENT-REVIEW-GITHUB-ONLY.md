# Catálogo público — contrato de revisão totalmente pelo GitHub

## Motivação e evidências

A auditoria de 16/11/2026 confirmou um snapshot privado com **11 Casas,
10 ativas na temporada 2 e 8 vínculos válidos de Jogadores com Casas**.
Isso é evidência de integridade da projeção interna, **não** aprovação
de conteúdo para uso público. O estágio
`migrationPublicContentStage` continua ausente no Cloud (HTTP 404 na
última leitura autorizada). O runtime operacional
`campaignCloudRuntime` ainda não foi reconciliado.

O proprietário suspendeu o uso do Cloud Shell; o trabalho seguinte ocorre
exclusivamente por GitHub e testes locais de CI. Não solicitar exportações
privadas para o repositório público.

## Nova função de pré-validação

`scripts/firebase/public-content-review-plan.mjs` exporta
`planReviewedPublicContent`, uma **função pura e offline** que recebe
conteúdo previamente classificado e revisado e retorna:

- `summary`: contagens agregadas, motivos de bloqueio e decisão sempre
  `NO_GO`, sem UIDs, hashes, nomes de Casas, texto ou URLs;
- `privatePlan`: **somente em memória** e somente quando o material
  supera o contrato de revisão; não deve ser enviado aos logs. O
  `stage.status` permanece obrigatoriamente `pending`, sem conceder
  `complete`, flags ou aprovações de runtime.

Exige Casas revisadas explicitamente `publicReviewed=true`, ativas,
temporada 2, campos mínimos validados, referências de Casas publicadas
únicas, e três conjuntos de tradução fornecidos explicitamente: `en`,
`es` e `de`. Rejeita toda a projeção em caso de:
fontes incompletas, tradução de entidade privada, Casa não publicada,
linha sem revisão, duplicação, URL insegura ou excesso do orçamento
de tamanho permitido pelos leitores Firebase atuais. Campos privados
de origem (finanças, notas administrativas etc.) jamais entram na
projeção.

**Nenhum material real é criado por essa função:** não há acesso à
origem, ao Firestore ou ao Storage. Apenas fixtures sintéticas no GitHub
Actions podem ser processadas neste momento.

## O que continua bloqueado

Este lote **não** reconstrói automaticamente `house_catalog`,
`public_player_houses` ou `campaign_translations`; uma exportação
privada não pode ser considerada conteúdo revisado sem auditoria humana.
Também não define a versão publicada do catálogo, não importa para
Cloud, não habilita a página pública e não valida Auth em produção.
Reconciliar a origem e ativar runtime permanecem pendências futuras.
Não usar Supabase como fallback nem gravar segredos no GitHub público.

## Validação

O workflow `Firebase Cloud access readiness — read-only OIDC` executa
`node --test scripts/firebase/public-content-review-plan.test.mjs`
em GitHub Actions, sem credenciais de Cloud nem origem real.
