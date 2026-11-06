# CRZ-1.0 — Lote 6: laboratório tático de treino e replay (Narrador)

**Base da entrega:** linha canônica #282 (turnos), #283 (replay) e #284 (reconciliação + errata). A variante alternativa #281 foi encerrada **sem merge**. Este lote não substitui nem modifica PTE-2.0, jogos V3, multiplayer V3.4 ou homologação de baixas V3.5.

## Interfaces entregues
- `src/components/battle/BattleCrzLab.tsx`: tela de preparação e arena hexagonal CRZ, integrada **somente à visão do Narrador** por botão separado em `BattleNarratorHub`.
- Quatro teatros-modelo, grades 11×9 e 15×11; dano esperado/híbrido; seed hexadecimal explícita; adversário IA local ou segundo participante no mesmo dispositivo.
- Exércitos originais fictícios (Coroa/Ashkar) e dois Generais fictícios; cada pilha tem PV, moral, contagem e informações da ficha do template, sem consultar HouseState.
- Hexágonos acionáveis por clique, teclado Enter/Espaço e toque; destaques para movimento legal, ataque, unidade ativa e selecionada.
- Painel de ordens: MOVE, ATTACK, WAIT, DEFEND, END_ACTIVATION, CHARGE e VOLLEY quando permitidos; `crzLegalCommands`/redutor têm a palavra final. General com conjuração do subconjunto já suportado (energia, preparação e alvo válidos).
- IA local por passos auditáveis (`crzTrainingAdvanceAi`), com cada comando incluído no replay do Lote 5. Não há avanço de calendário ou cronologia oficial.
- Replay local: JSON exportável, importação com reexecução/validação SHA-256, visualização por passo, retorno ao combate. Cadeia demonstra integridade matemática e consistência interna, **não prova identidade/autoria**.
- CSS responsivo dedicado e sem importação de arte/visual protegido de outros jogos.

## Portões de segurança

1. **Acesso:** novo botão somente na tela autenticada do Narrador. A rota dos jogadores mantém `BattleV3PlayerEntry` e **não** recebe CRZ nesta fase. Nenhum segundo botão de batalha é liberado automaticamente.
2. **Dados:** sem SQL, API, SSR de edição, Supabase, novos dados reais, RLS em produção, atributos e recursos das casas, XP oficial, decisões do Narrador, baixas oficiais ou Hub Temporal.
3. **Regras:** exclusivamente CRZ-5E; WOTR e PTE-compat continuam inativos. T-INT-01 segue `cap` (78 bruto, 53 aplicado, 7 baixas); 11 baixas só na variante `carry` documentada no Lote 4.
4. **Replay:** máximo 2.000 comandos, 8 MB e 5.000 eventos; importação não ignora erros de hash. Uma sessão pode ser retomada somente após verificação.
5. **Exposição:** PR em *draft*, sem merge na main ou publicação de produção. O CI sintético **não substitui** aceitação desktop/mobile no navegador com conta real de Narrador e teste de permissão. Revisar desenho, comportamento e cap/carry antes de liberar.

## Testes de aceitação

- `src/test/crusade-crz10-lot6-ui.test.tsx`: perfis sintéticos, mapa de ambos os tamanhos, cenários, seed, UI Narrador, movimento, General, replay por quadro, IA auditada, inexistência de imports de banco/motor PTE e ausência de exposição ao jogador.
- GitHub Actions: Vitest, TypeScript, build, PostgreSQL de batalha e missivas **descartáveis**, preservando toda a cadeia anterior.
- Validação manual pendente após CI: conta Narrador real, viewport móvel, foco/teclado, interação em touchscreen, importação/exportação em Chromium/Firefox e limites de desempenho próximos de 2.000 comandos.

## Lote seguinte

**Lote 7:** homologação visual desktop/mobile e melhorias de experiência; opcionalmente uma seleção mais rica de modelos, spellbook e detalhamento de dano, depois de decidir parâmetros ainda experimentais do manual 07 ausente. Não liberar CRZ a jogadores ou aplicar baixas automaticamente sem aprovação independente.
