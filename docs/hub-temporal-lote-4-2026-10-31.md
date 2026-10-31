# Hub Temporal — Lote 4: comando central de avanço

**Execução:** 31/10/2026. **Branch:** feat/hub-temporal-lote-4-comando. **Dependência:** PR #128 (Lote 3, baseado no PR #127).

## Entregas

1. Motor de calendário do Lote 2 é usado no cliente para validar a prévia. O servidor aplica a mesma contagem de 10 dias ordinários por désdia, sem consumir festivais.
2. A nova RPC `preview_campaign_time_change(p_version,p_desdias)` calcula a data seguinte, meses, anos, estações e festivais atravessados, projetos com prazo atingido e número de fichas divergentes. **Não escreve dados.**
3. A nova RPC `publish_campaign_time_change(p_key,p_expected_version,p_desdias,p_reason)` exige Narrador, versão otimista correta, justificativa e UUID idempotente. Toda a operação ocorre numa transação PostgreSQL com trava consultiva e lock da linha.
4. Somente depois de validação, a RPC avança os meses na gestão das Casas, atualiza `campaign_calendar`, registra histórico em `campaign_time_changes` e em `campaign_calendar_audit`, e cria notificações duráveis em `campaign_time_outbox`.
5. Abertura de rodadas de missivas continua controlando `last_round` e `published_week`, mas **não** muda dia, mês nem ano.
6. A RPC antiga `set_campaign_calendar` passa a recusar alterações diretas da data oficial. `publish_campaign_schedule_confirmed` preserva seu papel para publicar agenda e semana **sem alterar o relógio**.
7. Novo `TemporalAdvancePanel` no calendário do Narrador mostra prévia, justificativa, confirmação e histórico; o painel de eventos permanece separado.
8. Testes SQL do motor e de permissão/idempotência em `scripts/test-hub-temporal.sql` e adequação dos testes legados à nova separação.

## Pontos de integração futuros

A tabela `campaign_time_outbox` registra eventos `campaign.date.changed`, `campaign.desdia.advanced`, `campaign.month.changed`, `campaign.year.changed`, `campaign.season.changed` e `campaign.festival.crossed`. **Nenhum consumidor posterior está ligado ainda**, de modo que não há envelhecimento automático, entrega de missivas, Sorte ou modificações adicionais ao exército. A única mutação de subsistema existente que se conserva é a conclusão de obras/mês pelo legado `apply_calendar_months`.

O evento `campaign.year.changed` permitirá a integração da idade dos personagens no Lote 7, com identidades deduplicadas. O registro de alterações não reescreve documentos históricos.

## Garantias de publicação

- Somente Narrador autenticado pode solicitar prévia, confirmar avanço ou consultar o histórico.
- O bloqueio de versão impede que um Narrador publique sobre uma data alterada por outra sessão.
- O mesmo UUID só pode ser reusado com ator, versão, quantidade de désdias e justificativa **idênticos**. Repetições retornam `duplicate=true` sem novo avanço.
- A função recusa avanço se alguma ficha de Casa estruturada estiver num mês diferente do Reino. Conciliação manual prévia evita concluir a mesma obra duas vezes ou avançar além do relógio sem revisão.
- Retornar erro SQL desfaz calendário, projetos, histórico e eventos pendentes na mesma transação.
- A prévia pode ser repetida sem tocar no banco.
- A publicação pode avançar entre 1 e 360 désdias, limitada também a 120 meses e ao intervalo de anos 0001 a 9999.
- Falha de rede no cliente preserva a chave da tentativa para reenvio seguro.

## Implantação e pendências

**A migração 0060 não foi aplicada diretamente em produção neste lote.** Ela deve passar pelo CI em PostgreSQL descartável e somente depois por reconciliação e backup das migrações reais (diferença Drizzle identificada no Lote 1). Integrar os PRs na ordem #127 → #128 → Lote 4; #126 permanece auditoria independente.

O uso simultâneo do editor legado com o novo comando é protegido no banco: mudanças manuais da data são recusadas, inclusive chamadas RPC diretas. A agenda de eventos não precisa ser descartada nem alterada retroativamente.

**Próximos lotes:** Lote 5, UX central de Narrador/jogador e sincronização; Lotes 6–7, identidade e idade dos nobres; Lotes 8–9, demais consumidores e correções de festivais privados; Lote 10, processamento idempotente da outbox, observabilidade e replay.
