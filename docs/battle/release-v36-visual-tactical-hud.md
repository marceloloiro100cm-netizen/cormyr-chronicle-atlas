# Cruzada V3.6 — mesa de guerra gráfica (implementação)

Base de referência: **Manual do Modo Cruzada de Cormyr (19 páginas)** disponibilizado pelo Narrador em 05/11/2026. Adaptação de experiência — sem copiar recursos gráficos, textuais, nomes de personagens ou elementos visuais específicos de terceiros.

## Implementado
1. **Fila de iniciativa** acima do campo: unidades reais da rodada atual, destacando a unidade ativa, lado, efetivo vivo e estado de espera; ao final, a próxima rodada aparece como **previsão**, não como regra consumada. Usa `activationQueue`, `waitingQueue` e `activationOrder` do motor PTE-2.0.
2. **Tenda de comando** lateral: insígnia heráldica original de cada um dos dez comandantes, nome, estilo, descrição de habilidade e botão de comando; apresenta cargas táticas restantes (regra implementada) em vez de inventar uma reserva de Energia.
3. **Indicador de baixas** sob a linguagem visual da enfermaria dos Tillets; valor calculado das pilhas vivas. NÃO recupera automaticamente mortos, NÃO converte baixas e NÃO aplica recursos da campanha.
4. **Barra inferior**: Mover, Atacar, Esperar, Defender, Fim de turno, Cancelar seleção, e habilidades próprias da unidade. Os controles acionam exatamente as ações já aceitas pelo motor, sem atalhos que bypassam o validador.
5. **Mapa ilustrado original em SVG**, com grama, bosques, colinas e rochas desenhados por polígonos e gradientes próprios, halo de unidade ativa, placas de efetivos e destaques de ação. Três estilos no duelo local: Ilustrado, Tático original e Alto contraste; sem assets de Pathfinder/Owlcat.
6. Painel auxiliar simplificado, com estatísticas e últimos eventos. Histórico completo pode ser expandido.
7. Em `BattleV34Remote` (fase remota) a fila, o comandante e o mapa ilustrado também aparecem. Seus comandos seguem o protocolo CAS/autorizado da V3.4.

## Diferenças intencionais em relação ao manual
| Manual | Versão V3.6 |
|---|---|
| Tabuleiro quadrado **7×12** | Mantém o tabuleiro **hexagonal 11×9 / 15×11** já utilizado pelo motor PTE-2.0. Não trocar a geometria sem migração explícita de rotas, alcances e replays. |
| Energia de generais e feitiços por rodada | Mostra **cargas táticas por batalha** existentes. Energia mágica futura será uma regra/versionamento próprio. |
| Enfermaria que recupera automaticamente baixas | Mostra **indicador de baixas**; não recupera soldados nem mexe nas casas. |
| Turno extra de moral, batalha em grade retangular | Não foi introduzido: precisa de motor, testes e versionamento próprios. |
| Arte e retratos originais do jogo citado | Ícones heráldicos gerados de símbolos comuns e gradientes SVG próprios, sem reproduzir os assets comerciais. |

## Critérios de aceite
- Ao clicar em **Batalhar**, a arena começa com a mesma lista de exércitos e os mesmos estados legais de antes.
- Barreira de modo: ilustração/alto contraste NÃO modifica cálculo de alcance, iniciativa, ataque, defesa ou registros de replay.
- Selecionar hexágonos por mouse, toque ou Tab/Enter continua funcional.
- A fila nunca mostra unidade derrotada como próxima ativação real e distingue previsão de rodada futura.
- Botão e textos deixam claro que não existe implementação de Energia e Enfermaria permanentes.
- Testes: `src/test/battle-v36-visual.test.tsx` mais regressão V3/V3.4, TypeScript, build, testes de navegador e Postgres descartável.
- **Sem merge ou deploy automático.** Branch sequencial após PR #274; não habilita as flags sensíveis V3.4/V3.5.

## Próximas evoluções
- V3.7: versionar motor de Energia, repertório de habilidades únicas por comandante, cooldowns e ações por rodada; não ativar fórmulas de dano quadrático sem avaliação de equilíbrio.
- V3.8: cenários gráficos com regras de terreno distintas, mantendo mapa hexagonal original ou lançando uma geometria alternativa versionada, nunca convertendo os replays anteriores silenciosamente.
