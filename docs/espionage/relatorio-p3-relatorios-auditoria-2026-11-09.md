# Cormyr Chronicle Atlas — Espionagem P3: relatórios e auditoria

**Data:** 09/11/2026
**Base:** P0, P1 e P2 integrados em `main` (`e1693193`).
**Observação de escopo:** o relatório de fundamentação V1 (02/11/2026) prevê expansões futuras, mas não contém uma lista canônica numerada "P3". Este lote materializa as extensões **não destrutivas e sem novas regras** que já constam daquele backlog. Não se presume aprovação de novos tipos de missão ou mudanças de probabilidades.

## Entregas implementadas

| Componente | Objetivo | Funcionamento |
| --- | --- | --- |
| P3.1 Briefing por dossiê | Reduzir o tempo de consulta | Mostra cobertura 0–7 de recursos, unidades conhecidas, posses conhecidas e registros antigos (pela data oficial do HUB) |
| P3.2 Relatório de inteligência exportável | Gerar a carta existente em formato útil | Botão de cópia em texto simples, usando somente snapshots de descobertas autorizadas; campos desconhecidos permanecem como desconhecidos |
| P3.3 Impressão / PDF | Relatório offline mediante ação | Comando **Imprimir / PDF** abre impressão do próprio navegador; estilo de impressão só é aplicado durante essa ação, não em outras páginas |
| P3.4 Histórico visual de versões | Saber o que foi atualizado | Linha do tempo por modalidade; jogador vê apenas chaves ainda conhecidas, sem valores anteriores; Narrador pode ver valores registrados antes/depois da revalidação |
| P3.5 Arquivo de incidentes do Narrador | Consulta transversal a fugas, capturas e mortes | Nova RPC `spy_narrator_incident_history()`; filtros por Casa, agente e resultado; paginação visual; consulta apenas após abertura do painel |
| P3.6 Segurança, compatibilidade e testes | Evitar regressões | RPC exclusiva de Narrador, `anon` revogado, validação Zod estrita, exportação sem bruto, testes de print, escopo de Casa e tentativa anônima negada |

## Privacidade / regras de dados
- Nunca exportar `adminHistory`, `oldSnapshot`, `newSnapshot`, IDs técnicos ou dados desconhecidos em relatórios de jogadores.
- Retornos dos dossiês continuam exclusivamente a partir da RPC existente `spy_intelligence_read`. Um filtro adicional remove da história de jogador eventos de itens que deixaram de ser conhecidos.
- As comparações da linha do tempo só exibem valores anteriores no modo Narrador; o banco já controla esse privilégio.
- O histórico de incidentes é lido apenas pelo Narrador via SQL `SECURITY DEFINER`, `campaign_access_active()`, `is_campaign_admin()`; `PUBLIC` e `anon` não executam a função.
- A nova RPC não cria, resolve ou modifica missões. Não altera XP, agentes, custos, saldos, calendários nem fichas.
- **Contraespionagem ativa, sabotagem e assassinato continuam fora do escopo**, pois exigem aprovar regras de jogo próprias e simulações de risco antes de editar o motor.

## Homologação
A migração `docs/espionage/sql/0112_spy_p3_narrator_incident_history.sql` foi aplicada com sucesso ao PostgreSQL isolado do projeto de homologação `6fbb6b20-e2ad-4d5b-8cb5-ee6bc5af29c6`.
Foi confirmado que a função existe, é negada a `anon`, aceita somente `authenticated` com validação de papel no servidor, e recusa invocação sem `auth.uid()`.
Os testes P3 de privacidade, exportação e RPC foram adicionados ao workflow dedicado à espionagem.

## Critérios para publicação
1. CI geral e específico P3 verdes.
2. Ensaios reais narrador/jogador em homologação, com dossiê conhecido e outro revogado.
3. Migração 0112 em produção **antes** do frontend; nunca publicar um cliente que dependa de RPC ausente.
4. Inspeção visual de impressão e quebra de página no celular.
5. Merge controlado e deploy Lovable; conferir revisão implantada e URL.

**Estado:** P3 em branch e PR de revisão; não houve alteração de produção durante este lote.
