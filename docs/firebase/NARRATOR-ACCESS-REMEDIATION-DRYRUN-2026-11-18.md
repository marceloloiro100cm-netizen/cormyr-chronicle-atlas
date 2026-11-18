# Atlas — prévia de regularização dos jogadores (18/11/2026)

Esta implementação **não libera jogadores**. Introduz uma prévia de
regularização controlada pelo Narrador, acessível somente após autenticação
Firebase em `/firebase-access` → **Acessos pendentes — consulta privada**.

## Fluxo no Atlas

1. O Narrador consulta os 14 cadastros e vê os problemas de cada conta.
2. Para um cadastro pendente de jogador/editor, expande **Preparar decisão
   (sem salvar)**, escolhe o perfil e a condição ativa/inativa.
3. Seleciona somente Casas ativas da temporada 2 e separa a autorização de
   participação da autorização de edição (edição ⊆ participação).
4. Marca que conferiu pessoalmente a identidade, a Casa e o perfil.
5. Clica em **Validar proposta sem aplicar**. O servidor autentica
   novamente o Narrador e consulta o registro real, a conta do Firebase Auth
   e as Casas do snapshot. Nenhum dado digitado recebe poder de autorização.

A prévia mostra quais campos *necessitariam* atualização e os bloqueios
de liberação; não gera documento, evento, arquivo, token ou autorização.
A seleção permanece apenas na memória desta página. A proposta não é
gravada no Firebase, no navegador, no GitHub nem em logs.

## Restrições verificadas

- A rota `/api/firebase-cloud-read`, ação `previewAccessRemediation`,
  exige a mesma autenticação Firebase, perfil de Narrador/admin e proteção
  de origem das consultas Cloud. Jogadores, editores e anônimos não podem
  chamar a prévia.
- A origem é sempre o snapshot configurado no servidor. A prévia valida
  os IDs e a existência das Casas no Firestore; IDs fornecidos pelo navegador
  não são usados para inferir permissões.
- Só aceita perfis **jogador** e **editor**; não pode criar/promover um
  Narrador, mudar o próprio perfil ou alterar contas sem pendências.
- Jogador deve possuir pelo menos uma Casa ativa, e edição é subconjunto
  das Casas de participação. Editor não pode possuir Casa.
- Uma senha marcada para troca permanece bloqueada. `requirePasswordChange`
  e o status do Firebase Auth não são modificados ou presumidos.
- É obrigatória a confirmação explícita de revisão da identidade.
- O relatório de sucesso tem `mode=preview-only`,
  `decisionApplied=false`, `roleGranted=false`,
  `adminGranted=false`, `passwordFlagCleared=false`,
  `authWrites=0`, `firestoreWrites=0`, `releaseDecision=NO_GO`.
- Contas de Narrador requerem processo administrativo independente.

## O que falta antes de realmente aplicar decisões

Uma aprovação administrativa privada por usuário; prova de troca de senha;
reconciliação com a fonte atual e versão do calendário; fonte operacional de
acesso **separada** de `migrationDomainStage` com transação atômica,
versão concorrente, auditoria e validação em todos os endpoints que autorizam
leitura/escrita; teste E2E real entre Casas e aprovação de liberação.

Não editar a coleção histórica, não atribuir Casa por e-mail ou nome e
não interpretar um dry-run bem-sucedido como autorização para jogar.
