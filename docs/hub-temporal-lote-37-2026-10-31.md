# Lote 37 — encerramento técnico e matriz de aceitação do Hub Temporal

**Base:** Lotes 1–36, PR #162. **Data:** 31/10/2026.

## Contratos cobertos por testes e gates

| Critério do plano original | Evidência no repositório | Estado técnico |
|---|---|---|
| Désdia = 10 dias ordinários, festivais percorridos | `temporal-engine.ts` e testes Harptos | Implementação em branches |
| Relógio único de campanha, versionado | `campaign-time.ts`, publicação RPC, site-audit | Implementação em branches |
| Idades derivadas por nascimento ou referência | `character-ages.ts`, prévias SQL | Implementação em branches |
| Casa, obras e prazos mensais | `house-time-impact.ts` e testes multianuais | Implementação em branches |
| Missivas, eventos e histórico privado | Testes de cronologia, RLS e sessões | Implementação em branches |
| Cache e controle de acesso ao vivo | Lotes 26–36, testes de revogação | Implementação em branches |
| Novos módulos e conexões | `time-connections.ts`, consumidores e outbox | Implementação em branches |
| Aceitação automatizada | `temporal-final-acceptance.mjs` no GitHub Actions | Gate offline agregado |

A auditoria final verifica a presença de contratos estáticos e regressões
obrigatórias, falhando se alguma peça crítica desaparecer. Ela não equivale
a um teste de navegador na implantação real e não substitui os testes SQL
descartáveis, integração end-to-end ou a revisão do operador.

## Pendências impeditivas de publicação

1. Conciliar os **27 arquivos SQL ainda fora do Drizzle journal** com o
   inventário read-only do banco-alvo e resolver o prefixo `0041` duplicado.
2. Homologar **restauração real de backup autorizado** e procedimentos de
   recuperação, mantendo os registros originais.
3. Confirmar permissões RLS e cenários ponta a ponta em homologação
   representativa; não acessar dados privados reais sem autorização.
4. Integrar a cadeia das PRs na ordem aprovada, revisar CI do commit final
   e obter a decisão formal do responsável pela campanha.

## Critério de encerramento técnico

Quando os dois jobs GitHub Actions (`validate` e `mail-database`) passarem
no commit final, o código da cadeia está **validado em CI**. A produção,
entretanto, permanece bloqueada até as evidências externas acima.
Nenhuma migração, merge ou publicação é realizada por este lote.

**Decisão imutável deste relatório: NO_GO para produção.**
