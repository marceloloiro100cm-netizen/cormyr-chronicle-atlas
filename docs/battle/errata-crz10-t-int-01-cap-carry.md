# Errata normativa CRZ-1.0 — T-INT-01, cap × carry

**Decisão operacional de reconciliação (06/11/2026).** Este documento é um adendo de implementação para o projeto Cormyr, não uma modificação silenciosa do manual original 03 §18. Não altera o preset aprovado, seu `rulesetHash` nem partidas PTE-2.0.

## Fonte do conflito

- `03-regras-cormyr-cruzada-passo-a-passo.md`, §18, exemplo **T-INT-01**, descreve 60 goblins (7 PV) vs 30 orcs (15 PV). Após ataque dos goblins, restam 17 orcs e 242 PV. A retaliação deles tem **78 PV de dano bruto**. O texto anterior interpretava isso como **11 baixas** dos goblins, 342 PV restantes, que matematicamente pressupõe `carry`.
- `02-empilhamento-de-criaturas.md`, caso **T-PIL-03**, e o preset CRZ-5E implementado desde o Lote 1 exigem `overkill='cap'`, incluindo teto de dano baseado na expectativa de acertos.

## Resolução adotada: um único comportamento padrão

**CRZ-5E usa `overkill='cap'` em TODO ataque, inclusive retaliação**, sem uma exceção implícita. A retaliação permanece em 78 PV de dano bruto, mas encontra um teto de 53 PV:

- 17 orcs × probabilidade de acerto 45% = **7,65 acertos esperados**.
- `floor(7,65 × 7 PV por goblin) = 53 PV` de dano máximo aplicado.
- Goblins antes da retaliação: 420 PV, 60 vivos; depois: **367 PV, 53 vivos, 7 baixas, 3 PV na criatura de topo**.
- Orcs antes da retaliação: 242 PV, 17 vivos, 13 baixas, moral `shaken`.
- A narrativa **78 PV aplicados, 11 baixas, 342 PV e 49 sobreviventes** permanece válida *somente* como contrafactual `carry`, com configuração alternativa explícita de teste (hash diferente). Não pode ser carregada numa partida CRZ-5E oficial com hash de preset conhecido.

O teste de integração do redutor (`src/test/crusade-crz10-reconciliation.test.ts`) atesta o resultado completo; o teste matemático existente (`src/test/crusade-crz10-goldens.test.ts`) atesta `cap` e `carry` separadamente. Ninguém deve alterar a fórmula apenas para reproduzir as 11 baixas, nem declarar que o exemplo `carry` é o resultado padrão do CRZ-5E.

## Compatibilidade, aceite e escopo

- Nenhuma migração, alteração em `ruleset.ts`, exceção em `strike.ts`/retaliação ou alteração de hash.
- O identificador do teste é **T-INT-01/CRZ-5E (cap)**; o cenário `carry` é **T-INT-01/carry-sandbox**.
- Esta errata prevalece **somente na interpretação do projeto de software** sobre o texto contraditório do exemplo §18. Se o Narrador desejar instituir `carry` como nova regra geral, isso requer novo preset/versionamento de hash, novos goldens e aceite próprio; não é uma alteração retroativa.
- `CRZ-WOTR` já declara `carry` em seu contrato matemático, porém **não possui redutor jogável** nem paridade completa nesta release.
- As baixas do CRZ experimental são exclusivamente **fictícias**. As regras de aprovação oficial do PTE-2.0/V3.5 permanecem isoladas.
