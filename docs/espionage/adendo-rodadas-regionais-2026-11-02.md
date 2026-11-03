# CCA-ESP-MVP-001 — Adendo: prazo estratégico em rodadas por região (02/11/2026)

## Regras aprovadas

1. A **posição atual do próprio agente** no banco (`spy_assets.current_location_id` → `spy_locations.region_id`) é a origem de cada novo plano. **Não** utilizar a sede da Casa, o primeiro domínio, a origem da missão anterior nem a posição de outro agente.
2. Investigação na mesma região: **zero rodadas de deslocamento + uma rodada de missão**.
3. Região vizinha (conexão `land_neighbor` aprovada pelo Narrador): **uma rodada de deslocamento**. Uma região adicional atravessada custa mais **uma rodada** por conexão. O jogador visualiza o caminho e o total.
4. Aresta `sea_passage` aprovada e publicamente disponível: viagem entre as duas regiões em **uma rodada**, ainda que não sejam vizinhas por terra. O jogador pode comparar rotas terrestres e opções marítimas. Um litoral/porto NÃO cria acesso marítimo automaticamente: precisa de ligação homologada, com direção e origem.
5. A missão de reconhecimento exige **uma rodada separada**, somada à viagem de ida. O retorno é opcional e seu custo é calculado partindo da região investigada, respeitando sentidos únicos. Se não houver retorno homologado, o prazo não é inventado.
6. Se o agente estiver `traveling`/`returning`, `missing` ou `captured`, não é mostrada uma nova chegada como se ele estivesse disponível. Sem localização atual ou ligação aprovada, mostrar **tempo não homologado**.
7. A **dificuldade basal pública regional** é o valor de bônus de `law` de `src/lib/house/regions.ts`: Crownlands 20, Elfhold 15, Shieldmark/Helmlands/Swordmarch/Ferlin 10, Veilstone/Horselands/Volkumburgh 5, Dragon Coast/Stonelands 0. A dificuldade específica da Casa pode ser avaliada depois, sem expor os atributos privados.
8. **Regra confirmada pelo Narrador:** 1 rodada de espionagem = **1 désdia de 10 dias ordinários de Harptos**. O cálculo deriva da **data oficial publicada** no Hub Temporal. Festivais intercalares (incluindo Shieldmeet) não consomem esses dez dias. O contador de rodadas de missivas `published_week` **não** substitui a désdia. A prévia não publica calendário nem conclui missões; essas transições exigem o consumidor durável.

## Exemplos ilustrativos de regra, não de fronteiras reais

| Posição do agente → destino | Viagem | Investigação | Total sem retorno |
|---|---:|---:|---:|
| Mesma região | 0 | 1 | **1 rodada** |
| Região imediatamente vizinha aprovada | 1 | 1 | **2 rodadas** |
| Duas fronteiras terrestres aprovadas | 2 | 1 | **3 rodadas** |
| Passagem marítima direta homologada | 1 | 1 | **2 rodadas** |

## Implementação preparada e garantias

- `src/lib/espionage/region-turns.ts`: grafo de travessias autorizadas, escolha de rota mais curta em número de rodadas, possibilidade de atalho marítimo, cálculo a partir do agente e retorno opcional.
- `docs/espionage/sql/0082_spy_regional_rounds_REVIEW_ONLY.sql`: tabela de conexões regionais auditadas e RPC do Narrador para homologar `land_neighbor` ou `sea_passage`. Consulta autenticada `spy_get_regional_strategy` devolve **somente agentes da Casa solicitante e links públicos homologados**, sem detalhes sigilosos do alvo.
- `src/components/house/espionage/spy-regional-turns-panel.tsx`: painel de decisão estratégica com agente, região, Lei basal, ida, investigação, retorno, modalidades e razões de indisponibilidade.
- `src/test/espionage-region-turns.test.ts`, `scripts/test-espionage-sql-regional-rounds.sql`: testes de 0/1/2 rodadas, mar, origem real, sentido único, isolamento de Casa e falta de ligações.

**Estado de implantação:** SQL é **REVIEW_ONLY** e permanece fora do jornal Drizzle; não alterar produção ou assumir que fronteiras do mapa já estão cadastradas. A fila temporal e a duração física em dias `baseDays` das rotas anteriores seguem separadas, até a correspondência oficial rodadas → calendário ser definida e a migração reconciliada.
