# Cormyr — Cruzada V3.7 · Energia e estratagemas de comando

## Referência e interpretação
O manual técnico apresentado pelo Narrador (19 páginas) descreve o General atuando fora da grade, com uma ação por rodada em turno aliado, custo de energia, habilidades rápidas, cooldowns e recuperação estratégica de energia por dia. Esta implementação é uma **variante própria de treinamento** compatível com o jogo Cormyr; não reproduz fórmulas, personagens, ícones ou código de Pathfinder.

## Implementado
- **20 estratagemas originais:** dois para cada um dos dez comandantes existentes da V3.2/V3.6, preservando sua habilidade de assinatura e passiva anterior.
- **Reserva inicial de 24 pontos de Energia** para cada comandante em cada batalha de treino. Energia limitada ao encontro: gastar não altera nenhuma casa, edifício ou Hub Temporal.
- Cada habilidade possui custo próprio entre 4 e 8 pontos e **recarga de 2–3 rodadas**. Um comandante realiza **no máximo uma ação de comando por rodada**, independente da ação da unidade (que continua possível).
- A assinatura anterior custa **8 pontos** no modo V3.7 e respeita a quantidade de usos já definida pela progressão V3.2. O redutor legado de assinatura V3.4 permanece intocado para partidas anteriores.
- Validação de alvo aliado/inimigo e unidade viva, de energia, de recarga, de comandante dono e de turno. Cada ação grava seu efeito em log, sem fonte oficial.
- Efeitos originais: guarda, inspiração, marcha, reagrupar, enfraquecimento, redução de armadura, cura limitada a soldados vivos e centelha arcana determinística e contida.
- IA do adversário pode usar assinatura pela nova regra e, em seguida, realiza as ordens de suas unidades com o motor tático existente.
- HUD V3.6 passa a mostrar reserva de energia, disponibilidade e custo das duas novas habilidades, com alvo selecionado no tabuleiro.

## Compatibilidade e segurança
- Campo opcional `game.tactics` versionado por `CCA-V37-COMMAND-1` no estado de treino V3.7.
- `createV3Game` continua produzindo exclusivamente o formato V3 legado sem `tactics`; apenas `v37Enable` habilita a variante.
- `v34NewGame`, sessões remotas e replays V3.4 **não são convertidos automaticamente**; o protocolo remoto ainda deve usar o redutor legado. Alterar partidas remotas exigiria uma nova versão de servidor, sessão e replay.
- Batalhas convocadas com configuração bloqueada continuam no fluxo anterior.
- Nenhum import de HouseState, Supabase, banco ou sistema de baixas. Não chama adjudicação V3.5.
- Energia não se regenera por dias estratégicos; essa evolução exigirá integração explicitamente aprovada à campanha e testes de relógio.
- O indicador da enfermaria permanece apenas visual (sem conversão ou restauração automática de baixas).

## Homologação necessária
- Teste de catálogo completo dos comandantes e isolamento, energia, cooldown, assinaturas e ausência de ressuscitação.
- CI: Vitest, TypeScript, build e testes de navegador; SQL em PostgreSQL descartável para regressão das fases anteriores.
- Aceite visual mobile/desktop e dupla revisão de equilíbrio antes de qualquer merge.
- **Não há migração de banco ou publicação em produção neste PR.** Flags oficiais da V3.5 permanecem desligadas.

## Futuras fases propostas
- V3.8: IA capaz de selecionar entre os estratagemas situacionalmente, efeitos visuais de duração limitada e pré-visualização de resultados.
- V3.9: versão remota com snapshot e replay próprio para habilidades V3.7, após regras estabilizadas; nenhuma atualização automática de sessão V3.4.
