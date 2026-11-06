# Cruzada V3.9 — Variante de objetivos (após revisão dos quatro ZIPs)

## Estado e escopo
A V3.9 implementa **somente treinamento local** e é uma **proposta experimental** de objetivo alternativo, alinhada à possibilidade futura descrita no documento normativo `03-regras-cormyr-cruzada-passo-a-passo.md` §12. **Não constitui a implementação do ruleset `CRZ-1.0`**, cuja vitória-base continua por eliminação/debandada/impasse/rodadas.

Referência versionada: `CCA-V39-OBJECTIVES-1`, incluída como `V3Game.objectives?`. O motor `BattleState.rulesVersion='PTE-2.0'` não é modificado globalmente.

## Como jogar
1. Abrir `Batalha → Batalhar` e escolher exércitos-modelo, cenário e, opcionalmente, teatro regional V3.8.
2. No seletor **Condição de vitória**, escolher **V3.9 experimental · dominar marcos estratégicos**. Sem escolher, permanece o combate clássico.
3. Iniciar. Três pontos acessíveis aparecem no mapa: **Passagem estratégica**, **Colina de vigia** e **Depósito de campanha**.
4. Uma unidade viva e não debandada **ocupa** seu hexágono; um marco desocupado é **livre**. Não se captura à distância nem mantendo controle permanente após abandonar o lugar.
5. Ao **final de cada rodada completa**, se um lado mantém pelo menos **dois dos três pontos**, ganha **uma rodada consecutiva**. Caso contrário sua sequência volta a zero.
6. Ao contabilizar **duas rodadas consecutivas**, a batalha de treino termina por `resultReason='v39-objectives'` para aquele lado. Eliminação, debandada e demais limites do PTE-2.0 também encerram o combate e têm precedência se acontecerem primeiro.
7. A IA adversária pode marchar para os marcos e processa ações separadamente, sem saltar rodadas para contar vitórias.

**Esses números (2 de 3, por 2 rodadas) são uma proposta nova do módulo V3.9**, não parâmetros presentes no documento `03`.

## Engenharia, segurança e compatibilidade
- `src/lib/battle/v3/objectives-v39.ts`: sem dados externos, banco, relógio global, recursos oficiais ou efeitos ocultos.
- `src/components/battle/BattleV39ObjectivesPanel.tsx`: painel acessível de ocupação e sequências; marcadores gráficos ficam no `BattleBoard` sobre hexágonos reais caminháveis.
- Os objetivos são escolhidos deterministicamente a partir do mapa existente, fora das zonas de implantação, em células `terrain!='rock'`. A passagem é **um objetivo gráfico sobre planície**, não um rio ou regra de ponte caminhável (documento 03 §11 reserva água e pontes para evolução futura).
- `v39AfterAction(before, after)` exige transição de no máximo **uma rodada**, atualiza a ocupação sem pontuação durante a rodada, recusa dupla contagem e só conclui vitória no fechamento.
- `v39RunAi` aplica cada comando sequencialmente para preservar cada fechamento de rodada. Não altera `runAiUntilHuman` do PTE-2.0.
- Batalhas convocadas com `locked=true`, partidas remotas V3.4 e dossiês oficiais V3.5 **não recebem objetivos**. `createV3Game` sem `v39Enable` continua inalterado.
- Nenhuma baixa, possessão, economia, construção ou data da campanha é alterada por essa camada.
- Sem novas dependências ou migrações, sem publicação no Lovable.

## Testes e aceite
- `src/test/battle-v39-objectives.test.tsx`: geometria de 20 variações (5 regiões × 4 cenários), objetivos únicos e caminháveis; partida legada inalterada; controle por ocupação; vitória após dois encerramentos de rodada; rejeição de saltos; unidade debandada não pontua; UI e marcadores; regra de IA.
- CI: Vitest, TypeScript, build, aceitação sintética Chromium e PostgreSQL descartável das etapas anteriores.
- Revisão Narrador: validar prazer de jogo, dificuldade de manter posições e equilíbrio com ataques de longa distância; **não habilitar em partida remota/real** até novo contrato de replay/versão explicitamente aceito.
- Revisão futura: desenvolver motor `CRZ-1.0` isolado baseado nas fórmulas do anexo 03 e testes goldens do anexo 02, após receber `05` e `07`.
