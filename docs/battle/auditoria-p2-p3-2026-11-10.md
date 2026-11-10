# Batalha Cormyr — P2/P3 da auditoria validada (10/11/2026)

## Escopo e segurança
Branch: `feat/battle-audit-p2-p3-20261110`; PR #368 empilhada na #367, que depende da #366.
**Não fazer merge/deploy nem liberar aos jogadores antes da homologação.**
Nenhuma migração Supabase, alteração de senha, efeitos nas Casas ou avanço do HUB Temporal.
GoT, D&D V3 e Adaptado seguem motores independentes. D&D: 3 m/quadrado; GoT: 10 m/quadrado.

## Mudanças P2
- GoT: Parede de Escudos **em formações avançadas** concede +5 Defesa contra Pontaria
  a uma unidade amiga em quadrado imediatamente atrás, quando o protetor encara o
  atacante. Não aplica contra Luta, flanco/retaguarda, protetor derrotado ou fora
  da formação; múltiplos escudos não acumulam. É uma regra digital opcional.
- Preparação GoT: seleção opcional "Posicionamento alternado" impõe uma colocação
  Defensor, depois Atacante. A opção reinicia apenas posições manuais; o modo
  livre não muda. O redutor principal não recebe novas fases nem alterações
  de iniciativa ou salvamento.
- GoT: Desalojar Escadas requer defesa sobre fortificação e inimigo adjacente com
  escadas implantadas. Cancela a implantação e deixa o defensor com −5 Defesa contra
  Pontaria somente na mesma rodada. Não consome equipamentos da Casa real.
- GoT: Óleo Fervente mantém dano inicial; após contato com fogo real aplica
  ignição adicional **+1 dano/rodada durante 1d6 rodadas** usando RNG da
  batalha. Não inflama sozinho e não acumula múltiplas ignições.
- D&D: comparação pré-batalha adiciona **XP base por ND** de monstros cuja ficha
  possui CR reconhecido; sem ND, a estimativa aparece indisponível.
  Não é dificuldade oficial para um grupo, pois faltam níveis, número de
  personagens, economia de ações e regras específicas.
- Voo D&D permanece **abstrato**: sobrevoa obstáculos quando autorizado, mas
  não há eixo Z/combatente alto-baixo; não afirmar proteção automática contra
  Luta que o motor não aplica.

## Mudanças P3
- GoT 2D: seta frontal discreta por unidade com regras de ângulo habilitadas,
  acessível também no rótulo textual do quadrado.
- D&D 2D: silhueta de destino 2×2–4×4 em movimentos legais quando se passa
  o cursor ou foca uma célula via teclado; visualização não emite ordens.
- Tokens de estilo compartilhados e escopados em `battle-design-tokens.css`,
  com foco destacado e área tátil mínima nas telas compactas. A consolidação
  física de todas as folhas CSS **não foi feita** neste lote: exige inventário
  de especificidade, regressão visual de cada modo e dos fluxos de campanhas.
- Ao encerrar GoT: exportação de JSON auditável com eventos, sobreviventes,
  glória e prévias econômicas. O arquivo declara
  `status: PENDING_NARRATOR_APPROVAL` e `appliedToHouse:false`.
  **Não existe botão que altere Casas diretamente a partir de uma simulação.**

## Compatibilidade
- Campos de estado novos são opcionais; partidas antigas continuam sem
  penalidade de desalojamento nem efeitos de óleo secundário.
- A lógica de side, seed, eventos e cálculo da ordem do livro não é
  compartilhada com o motor D&D/Adaptado.
- `schemaVersion:1` do GoT e replays pré-existentes não mudam de formato.

## Gates antes de produção
1. Workflow Validate: TypeScript, Vitest, build, migrações de banco.
2. Battle browser acceptance em Chromium/SwiftShader e captura visual.
3. Narrador autenticado no Android real: zoom, pan, toque, mapa 2D/3D, 40/80
   miniaturas, confirmar/cancelar, falha WebGL e restauração de salvos.
4. GoT: muralha/escadas, óleo+fogo, Parede de Escudos e posicionamento alternado.
5. D&D: criaturas 1×1 até 4×4, voo abstrato, estimativa XP/CR, sem depender
   do catálogo privado do Narrador nos testes de sandbox.
6. Aprovação manual explícita da interface e regras antes de publicar.

## Itens mantidos fora do escopo
- Aplicação de alterações financeiras e treinamento diretamente às Casas;
  requer autenticação, autorização por Casa, transação auditável e reversão.
- Combate D&D vertical 3D real (eixo Z): precisa de geometria, alcance e
  salvamento versionado; não simular implicitamente como concluído.
- Consolidação total 15 CSS → 3 módulos: migração visual separada e testada.
