# Pré-validação privada de acesso — preparação sem gravação

**Data:** 18/11/2026 · **Código:** `scripts/firebase/access-remediation-preflight.mjs`

A consulta de cadastros pendentes já está no Atlas: autentique-se como
Narrador em `/firebase-access` e escolha **Acessos pendentes — consulta
privada**. Essa tela apenas lê o inventário e identifica os problemas.

## O novo passo técnico

Uma função pura, isolada e com testes permite **verificar uma proposta de
regularização**, antes de desenvolver qualquer comando de gravação. A função
`planPrivateAccessRemediation` recebe exclusivamente dados privados já
carregados em memória:

- `snapshotId`: identificador SHA-256 do snapshot validado;
- `accessDocs`: exatamente os **14** documentos de acesso;
- `houses`: catálogo oficial, com exatamente **10 Casas ativas da
  segunda temporada**;
- `reviewedChanges`: decisões explícitas do Narrador, endereçadas por
  UID, após verificar a identidade do titular e as Casas corretas.

Exemplo de estrutura de decisão (valores substituídos por marcadores):

```js
{
  uid: 'UID_DA_CONTA_VERIFICADA',
  profile: 'jogador',
  memberHouseIds: ['ID_DA_CASA_ATIVA'],
  editHouseIds: ['ID_DA_CASA_ATIVA'],
  active: true,
  reviewConfirmation: 'NARRATOR_EXPLICIT_ACCOUNT_AND_HOUSE_REVIEW',
  houseConsentVerified: true,
  reason: 'Decisão privada de titularidade conferida pelo Narrador.'
}
```

**Não coloque decisões reais em issues, commits, PRs ou comentários públicos.**

## Negativas obrigatórias

- Nenhum cadastro sem revisão expressa por UID e Casa entra na proposta.
- Um usuário com perfil existente não muda de jogador para editor ou vice-versa;
  um novo Narrador/admin não pode ser concedido pelo pré-validador.
- Jogador deve ter pelo menos uma Casa ativa da temporada 2; Casas de edição
  precisam estar dentro das Casas de membro, com identificadores únicos.
- Editor não pode ter Casas vinculadas.
- Conta com `requirePasswordChange=true` **não pode ser ativada** até
  comprovação independente da redefinição. O pré-validador jamais limpa a flag.
- Contas já completas não podem sofrer mudanças arbitrárias por esse fluxo.
- Faltas, duplicações, dados desatualizados e modificações sem diferença real
  são rejeitados antes de produzir qualquer plano.
- O resumo usa apenas **contagens agregadas**. A proposta privada contém
  identificadores e nunca deve ser registrada em logs ou relatórios públicos.

## Distinções de segurança

A verificação gera um **fingerprint de proposta**, não um carimbo de
aprovação. Não há assinatura de identidade do Narrador nem prova automática
de consentimento do titular. O resultado também não substitui a validação
do Auth completo nem consulta o Firebase por conta própria.

A coleção histórica `migrationDomainStage/{snapshot}/access` permanece
**imutável**. Um futuro fluxo de aprovação poderá usar uma fonte operacional
distinta, protegida por autenticação, revisão formal e transação com
pré-condições, mas **esse fluxo ainda não foi implantado**.

Até comprovar a fonte atual dos dados, os dois runtimes, os acessos e
o aceite real de duas Casas distintas, `releaseDecision=NO_GO` e as
gravações operacionais continuam bloqueadas.
