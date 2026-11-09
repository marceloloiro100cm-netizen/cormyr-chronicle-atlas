# Cormyr Chronicle Atlas — Espionagem P2 (09/11/2026)

## Contexto e dependências
Esta revisão é empilhada sobre P1 (`feat/espionagem-p1-usabilidade-20261109`), por sua vez dependente de P0 (`fix/espionagem-p0-integridade-20261109`). A publicação depende da homologação de toda a cadeia.

## P2 — oito entregas
| Item | Implementação | Limite conhecido |
|---|---|---|
| P2.1 Central do Narrador | RPC `spy_narrator_operations_dashboard` exclusiva de administrador; contadores de operações ativas, prontas para resolução, dossiês pendentes e encerradas; pesquisa, filtros, paginação. Apresentada na aba já existente de Dossiês, sem adicionar botão à navegação. | Até 1.200 operações na leitura; sem resolver diretamente a missão da central. |
| P2.2 Histórico unificado | Mescla eventos permanentes de agente, partida, chegada e conclusão planejada da investigação, com data Harptos; filtros por agente, tipo e texto. | Cancelamentos sem data de campanha ficam identificados na partida como posteriormente encerrados, sem inventar data do cancelamento. |
| P2.3 Validade dos segredos | Classificação informativa pela idade desde última **confirmação** no HUB (0–30, 31–90, 91+ dias ordinários). Filtragem por dados recentes/antigos em jogador e narrador. | Não transforma histórico em informação atual; valores podem mudar antes de 30 dias. |
| P2.4 Defesa própria | Lei, dificuldade-base, bônus de construções, defesa total e detalhes avançados, sem expor a composição de adversários. | Bônus locais continuam calculados em suas próprias regras existentes. |
| P2.5 Filtros | Busca de operações, histórico, região/Casa/progresso e antiguidade dos dossiês; navegação paginada. | Nenhum filtro amplia permissões de leitura. |
| P2.6 Contraespionagem inicial | RPC somente de leitura para **Casa atacada**, com incidentes realmente detectados e já concluídos; sem IDs, origem, objetivos ou nomes dos atacantes. | Não cria novas ações mecânicas, capturas ou dados fictícios; defesa ativa permanece fase futura. |
| P2.7 Diagnóstico seguro | Respostas genéricas e úteis para falha de dossiê, retirando mensagem SQL crua; acesso ausente e formatos inesperados explicitados. | Logs de infraestrutura devem ser analisados no provedor, sem exibição a jogadores. |
| P2.8 Testes | Cálculo de frescor, cronologia, filtros, central, esquemas de RPC estritos, negativa anônima, contratos de autorização e isolamento por Casa. | Teste real de duas contas isoladas ainda precisa de acesso autenticado autorizado. |

## Segurança
- RPCs `SECURITY DEFINER` exigem `auth.uid()` e `campaign_access_active()`.
- Central de operações exige `is_campaign_admin()` dentro de PostgreSQL.
- Contraespionagem exige ser administrador ou membro efetivo da Casa consultada; apenas eventos `escaped`, `captured` e `dead` de operações já encerradas são visíveis.
- `PUBLIC` e `anon` têm execução revogada.
- Respostas do cliente são validadas estritamente com Zod; campos extras (ex.: identidade do atacante) são recusados.
- Consultas sem sessão foram efetivamente rejeitadas no banco isolado de homologação.
- Nenhuma tabela militar, recurso, senha, agente ou data de produção foi alterada.

## Migração e ordem segura de implantação
1. Confirmar CI completo da cadeia P0 → P1 → P2, sem falhas de compilação ou testes.
2. Fazer ensaio autenticado com contas fictícias em homologação, inclusive permissões cruzadas e agente em missão.
3. Migrar 0110 **antes** de publicar P0; migrar 0111 **antes** de publicar P2.
4. Conferir a ausência de retornos diretos a anon e a não exposição de contas atacantes.
5. Publicar frontend somente após confirmar as funções SQL instaladas e homologadas no destino.
6. Revalidar UX em celulares 360px e 768px.

## Evidência da homologação
A migração `docs/espionage/sql/0111_spy_p2_operations_and_counterintelligence.sql` foi executada sem erro no banco isolado identificado com o projeto `6fbb6b20-e2ad-4d5b-8cb5-ee6bc5af29c6`.
Consultas SELECT confirmaram existência das RPCs, ausência de concessão a `anon`, validações de narrador e de vínculo com Casa. Duas tentativas de execução sem `auth.uid()` foram recusadas.
Nenhum teste com contas reais foi simulado ou contornado.

**Status:** código e SQL de homologação preparados; produção intocada. A PR deve permanecer em rascunho até CI verde e ensaio autenticado.
