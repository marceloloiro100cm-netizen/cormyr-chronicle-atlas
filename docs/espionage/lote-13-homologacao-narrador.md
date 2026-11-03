# CCA-ESP-MVP-001 — Lote 13 · Roteiro de homologação do Narrador

**Estado inicial: PENDENTE de aceitação funcional**, não apresentado como concluído. Este plano distingue o que o CI em PostgreSQL descartável pode provar do que exige validação no ambiente de campanha.

## Pré-condições obrigatórias
1. Restaurar backup completo e verificável da produção numa cópia isolada; fornecer evidência de recuperação (data, ID de backup, identidade da cópia). Sem restauração: NO_GO.
2. Reconciliar o diário `drizzle/meta/_journal.json` com SQL efetivamente aplicado; resolver prefixo 0041, migrações em falta, `0072`–`0074`, falhas do CI de Missivas e Hub Temporal. Não repetir 0042.
3. Homologar os SQLs `0075_spy_core_REVIEW_ONLY.sql` e `0076_spy_temporal_REVIEW_ONLY.sql` no clone, somente depois da base migrada, com RLS em todos os objetos.
4. Criar sessão real de jogador A, jogador B, uma Casa NPC e Narrador. Identidade de sessão precisa ser autenticada — nenhum `isNarrator` enviado pelo navegador é uma prova de acesso.
5. Definir roteiro geográfico com arestas e dias-base aprovados, tabela de Lei de NPC, regra de dificuldade genérica, política de contramedidas e origem dos agentes legados. Sem confirmação, apresentar estado pendente e nunca número inventado.
6. Confirmar se contratação de 5 Riqueza é **alocação** (modelo implementado); não foi fixada duração nem manutenção.

## Mesa simulada

| ID | Cenário | Resultado esperado | Evidência necessária | Estado |
|---|---|---|---|---|
| H01 | Casa A compra Rede base | 10 Riqueza alocada, 1 agente após conclusão | ledger, posse, cadastro | PENDENTE |
| H02 | A compra Rede Ampliada duas vezes | +4 agentes, sem duplicação no replay | compras distintas, IDs, reconciliação | PENDENTE |
| H03 | B contrata dois lotes avulsos | 10 Riqueza alocados, 4 agentes, nenhuma dupla cobrança | ledger canônico e UI | PENDENTE |
| H04 | A sem Riqueza suficiente tenta contratar | recusado sem alteração de estado | ledger antes/depois | PENDENTE |
| H05 | Dois agentes saem para destinos diferentes | itinerários separados, sem sobreposição de agente | rota, calendário, snapshots | PENDENTE |
| H06 | Casa A → Região 1 → Região 2 → retorno | três viagens com dias e festivais corretos | IDs de trechos, datas Harptos | PENDENTE |
| H07 | Rota não cadastrada / NPC sem Lei | não estima chegada nem dificuldade | estado pendente, sem valor | PENDENTE |
| H08 | Jogador A investiga atributos de B | nenhum acesso bruto a `noble_house_sheets` B | RLS/JWT e network trace | PENDENTE |
| H09 | Narrador avalia defesa com Cães de Guarda | contexto e regra de acumulação documentados | ficha-alvo, justificação, regra | PENDENTE |
| H10 | Carta 4/8 com fatos aprovados | 50% cobertura, confiança parcial | carta materializada | PENDENTE |
| H11 | Carta selada vs liberada | jogador não vê selada; após retorno vê apenas fatos autorizados | GET, UI, export, cache | PENDENTE |
| H12 | B tenta abrir carta de A por ID | 403/404 genérico sem metadados secretos | teste RLS e request | PENDENTE |
| H13 | Narrador antecipa chegada | justificativa imutável, relógio global não muda | evento, data antes/depois | PENDENTE |
| H14 | Publicação salta 10/30 dias, replay | cada chegada processada uma vez; missões seguem pendentes | delivery e checkpoints | PENDENTE |
| H15 | Retrocesso Harptos / perda de conexão | chegada não é desfeita, fila de reconciliação aberta | eventos antes/depois | PENDENTE |
| H16 | Captura, perda, fraude e custos | só após decisão humana; débito sem inconsistência | ledger, decisões privadas | PENDENTE |
| H17 | Export, pesquisa, logs, notificações | sem relatórios selados ou Lei privada | inspeção de artefatos | PENDENTE |
| H18 | Regressão mobile/acessibilidade | navegação responsiva e foco de teclado funcional | evidências visuais e testes | PENDENTE |
| H19 | Revogação de vínculo durante operação | transação rejeitada / dados desaparecem | sessão real revogada | PENDENTE |
| H20 | Retorno e dossiê histórico | conteúdo persistente, versões anteriores preservadas | comparação de snapshots | PENDENTE |

**Controle atualizado:** os cenários H01–H20 possuem fichas estruturadas em `docs/espionage/homologation-signoff.json`, inicialmente `PENDING`. A auditoria `docs/espionage/homologation-readiness-2026-11-02.md` distingue provas isoladas de aceite com banco RESTAURADO; a regra 1 rodada = 1 désdia (10 dias) requer integração durável no consumidor temporal antes de homologar H06/H14. Cada aceite real exige evidência única, commit e assinatura do Narrador. O script `scripts/espionage-release-gate.mjs --enforce` deve retornar `NO_GO` enquanto qualquer requisito estiver pendente.

**Evidência já disponível:** testes unitários e PostgreSQL descartável são *provas de contrato*, nunca homologação de produção. Arquivo `docs/espionage/release-evidence.json` permanece `NO_GO` até evidência real revisada.

## Aprovação do Narrador
A aprovação deve registrar: responsável, data de Harptos e timestamp real da revisão, versão/commit, projeto de homologação, logs de backup e restauração, SQL hashes de migração, resultado dos vinte cenários, lista de riscos aceitos, revisão do diff da RLS, rollback ensaiado e autorização **explícita** para a publicação. Não preencher esta seção com dados fictícios.

**Ação seguinte quando houver evidência:** executar `node scripts/espionage-release-gate.mjs --enforce` e só então analisar promoção de SQL via journal reconciliado. A homologação deste lote não equivale à liberação de produção.
