# Cormyr — Espionagem P0 · integridade e homologação
**Data:** 09/11/2026
**Alterações:** PR #350, branch `fix/espionagem-p0-integridade-20261109`.

## Resultado por item
| Item | Estado | Evidência e limite |
|---|---|---|
| P0.1 Missão real completa em homologação | **Pendente de ensaio autenticado** | Homologação possui tabelas e RPCs; sem contas de teste ativas e sem calendário/locais. A ferramenta bloqueou a execução de fixture transacional com identidades simuladas; não foi contornado. |
| P0.2 Resolução → dossiê | **Correção implementada no código** | RPC `spy_intelligence_operation_status` verifica resultado/award; `finishSpyIntelligence` diferencia `complete`, `waiting_catalog`, `missing_award` e `pending_resolution`. A UI sinaliza fila e falha de atualização; testes unitários incluídos. |
| P0.3 Data e valor histórico | **Correção SQL aplicada na homologação** | Migração 0110 grava a data real de observação quando a fonte chega depois da missão; impede correção retroativa do HUB antes da missão. Necessária validação com dados sintéticos e fonte atrasada. |
| P0.4 Privacidade entre Casas | **Verificação estática/banco positiva; ensaio cruzado pendente** | 5/5 tabelas de inteligência possuem RLS em produção/homologação; `authenticated`/ `anon` não têm SELECT direto. Teste cliente recusa dossiês com `ownerHouseId` de outra Casa. A RPC requer `in_campaign_house`. Teste real com JWTs distintos pendente. |
| P0.5 HUB/festivais | **Cálculos do banco validados; integração pendente** | Homologação confirmou 1522-01-21+1 désdia → 1522-02-01, 1524-07-21+1 → 1524-08-01, 1522-12-11+3 → 1523-01-11. Em ambas as transições com festivais, 10 dias ordinários. Testes de projeção adicionados. |
| P0.6 Duplicidade/concorrência | **Proteções e testes de contrato; ensaio concorrente pendente** | Envio usa trava por agente e chave da missão; resolução usa versão e chave de histórico; dossiê usa bloqueio de linha e `UNIQUE`. UI reutiliza a mesma chave quando uma resposta falha. Ensaio com duas requisições em paralelo ainda necessário. |

## Verificação do banco — somente leitura
- Produção: 172 Casas, 170 registros de atributos de espionagem, 3 agentes disponíveis, 5 operações canceladas, **zero dossiês e zero achados** na leitura de 09/11.
- Homologação consultada: migração 0110 executada com sucesso; RLS ativa nas cinco tabelas de inteligência.
- Nenhum agente real, recurso, usuário, senha ou calendário de produção foi alterado.

## Alterações técnicas
1. `docs/espionage/sql/0110_spy_p0_intelligence_observation_and_status.sql` — substitui a função de finalização; nova função de consulta do estado autoritativo do prêmio.
2. `src/lib/espionage/spy-dossier.functions.ts` — antes de finalizar, consulta estado real no PostgreSQL; recusa sucesso sem prêmio.
3. `src/components/house/espionage/spy-narrator-resolution.tsx` — status visível; chave de tentativa estável; erros de cache não são apresentados como falhas da missão.
4. Testes Vitest: `espionage-p0-integrity.test.ts`, `espionage-p0-server.test.ts`, extensão de `espionage-dossier-rpc-binding.test.ts`.

## Ordem de publicação obrigatória
1. Avaliar a PR e obter CI verde.
2. Repetir o ensaio de duas contas em homologação autorizada, sem dados de jogadores.
3. Aplicar a **migração SQL 0110 em produção antes do deploy do frontend**. Sem ela, o novo código não encontrará a RPC de status e a materialização poderá permanecer pendente.
4. Publicar a revisão, verificar os logs da RPC e consultar dossiês em modo real.
5. Nunca declarar P0.1/P0.4/P0.6 homologados apenas com mocks ou análise estática.

## Critérios de aceite reais ainda necessários
- Jogador A envia agente → viagem → conclusão pelo HUB → resolução pelo Narrador → descoberta persistida no dossiê A.
- Jogador B não recebe nem consulta os segredos de A, inclusive manipulando o identificador enviado à RPC.
- Fonte oficial atrasada: a data do achado é a data real da observação, não a data antiga da missão.
- Repetir envio, homologação e finalização com chave idêntica; contagens de agentes, experiência e achados permanecem constantes.
- Duas chamadas simultâneas para o mesmo agente não geram duas missões ou duas premiações.
- Avançar vários períodos e atravessar Midwinter, Midsummer e Shieldmeet; retroceder o HUB não reverte uma missão concluída.
