# CRZ-1.0 · Lote 7 — acessibilidade da arena e liberação controlada

## Mudanças executadas
- **Tabuleiro acessível:** navegação por uma única parada de Tab e setas direcionais axiais; Enter/Espaço executam a ação focada. O foco permanece visível. A instrução de teclado é apresentada visualmente e associada por `aria-describedby`.
- **Zoom:** 100, 150 ou 200%, com botão de reajustar, sem modificar o estado de combate, comandos, hash ou replay.
- **Contraste alto:** alternância reversível apenas de apresentação e bordas de hexágonos, mantendo cores/ícones originais das tropas.
- **Entrega controlada:** `BATTLE_CRZ_TRAINING_UI_ENABLED` é `true` somente com `VITE_ENABLE_CRZ_TRAINING=true` no build. Caso contrário, o botão e a tela do Narrador não são montados. A visão dos jogadores continua sem CRZ.
- **Testes:** `crusade-crz10-lot7-accessibility.test.tsx` valida controles, estados, foco concentrado e isolamento; regressão integral no CI.

## Homologação e segurança
Os testes Vitest/TypeScript/build são validações automatizadas. O browser acceptance geral da V3 não comprova automaticamente o visual do novo CRZ. Antes de ativar a flag: testar com autenticação real do Narrador, Chrome/Firefox, larguras 375/768/1440, teclado e toque, zoom e importação de replay JSON. Os testes de acessibilidade são indicadores técnicos, **não auditoria WCAG integral**.

O Lote 7 não muda `CRZ-5E`, `rulesetHash`, `src/lib/battle/domain`, Supabase, fichas reais nem aprova qualquer baixa.
