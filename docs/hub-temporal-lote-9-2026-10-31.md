# Hub Temporal de Cormyr — Lote 9: Posses, Construções, Projetos e Serviços

**Data:** 31/10/2026 · **Base:** Lote 8 / PR #134 (encadeado sobre Lotes 2–7)  
**Produção:** nenhuma migração aplicada ou operação enviada ao Supabase real.

## 1. Auditoria da lógica existente

A migração 0038 criou apply_calendar_months(delta). Sua lógica antiga somava delta ao mês registrado individualmente em cada Casa. Em uma publicação de +3 meses, uma Casa que estava 1 mês atrasada avançava apenas 3 meses desde o mês local e continuava com 1 mês de defasagem. Obras dependentes também podiam deixar de ser processadas no mesmo período se o projeto filho aparecesse no array antes do suporte.

O Hub Temporal (migração 0060) já opera com publicação atômica, versão de calendário e UUID idempotente. O Lote 9 mantém sua API e substitui somente a implementação do processamento mensal interno, vinculada ao mês absoluto de destino calculado do calendário oficial.

## 2. Migração 0065 — Contrato de processamento

**Arquivo:** drizzle/migrations/0065_house_temporal_months.sql

- **Mês único:** target_month = (ano CV * 12) + mês zero-based. Cada Casa ativa elegível chega ao mesmo mês absoluto do Reino; não soma delta ao seu próprio mês local.
- **Versão e atomicidade:** o RPC versionado publish_campaign_time_change permanece como único caminho de publicação. Seu processamento permanece na mesma transação, com bloqueios por Casa e livro-razão auditado via commit_noble_house_operation.
- **Idempotência:** repetição do UUID do comando retorna a operação já publicada sem reprocessar; Casas com mês igual ou maior ao destino não sofrem escrita extra. Uma ficha que foi artificialmente retrocedida mas já possui calendar_advance no livro-razão do mês-alvo bloqueia para revisão, em vez de duplicar lançamentos.
- **Casas em rascunho/revisão:** não têm meses processados. Casas com estado malformado provocam erro transacional e exigem reparo; nenhum avanço parcial é confirmado.
- **Retrocesso:** não reverte obras, saldo, fortuna ou atividades já registradas. Quando a data volta a avançar, só os meses ainda não processados geram novas alterações.
- **Prazos:** projetos building cuja soma start + duration + modifier atingiu o mês de destino passam a completed apenas quando a posse correspondente está apta. Posses dependentes são processadas iterativamente até estabilizarem, permitindo conclusão do suporte no mesmo avanço.
- **Cancelamentos e impasses:** projeto sem posse válida é cancelado; dependências de suporte não ativas deixam projeto pendente. Nenhuma obra bloqueada é ativada artificialmente.
- **Serviços e receitas:** o calendário não lança automaticamente ouro, Sorte, Glória, recursos, ações mensais, pagamentos de tropas ou benefícios de posses. Esses fluxos continuam dependendo das regras próprias e de operações aprovadas. O avanço torna efeitos de construções ativadas elegíveis para as consultas normais de saldo, sem lançar bônus novamente.
- **Originais:** documentos históricos, dados de duração, custos, datas de aquisição e ações anteriores permanecem intactos.

## 3. Prévia gerencial do Narrador

O novo RPC preview_house_time_impacts(p_version,p_target_date) é exclusivo do Narrador e somente leitura. Confirma a versão do calendário e retorna:
- total de fichas consultadas;
- Casas ativas elegíveis para avanço;
- Casas adiantadas, alinhadas, em rascunho ou malformadas;
- quantidade de projetos com prazo atingido para conferência;
- situação, mês de origem e versão de cada Casa.

Ao selecionar uma data que atravesse um mês, o Comando Central consulta o RPC e bloqueia publicação quando a prévia estiver ausente, desatualizada ou sinalizar fichas inválidas. A confirmação apresenta a quantidade de Casas afetadas e as obras candidatas. O painel Posses e Projetos permite ao Narrador inspecionar cada Casa, sem presumir que obra com prazo vencido está finalizada.

## 4. Jogadores e consistência local

- Projetos da Casa mostram status registrado no livro-razão e nota quando o Reino atinge o prazo, mas a Casa depende de processamento ou conferência.
- O motor de reconciliação local em src/lib/house/engine.ts foi alinhado ao SQL para projetos dependentes, sem duplicar ganhos.
- Os avisos esclarecem que somente publicação temporal do Narrador move projetos; abrir missivas não avança o tempo.
- Realtime invalida as prévias das Casas quando o calendário muda e alterações de posse atualizam o cache.
- Mudanças do mês não alteram missivas, registros de personagens nem textos históricos.

## 5. Testes

- scripts/test-house-temporal-months.sql executa o lote em PostgreSQL descartável e verifica Casa atrasada, prazos, suporte, saldos e ações, rascunhos, auditoria, replay UUID, retrocesso, recálculo e RLS.
- src/test/house-temporal-lote9.test.ts valida contrato de prévia, prazo de projetos, conversão do mês CV e conclusão iterativa sem mutação do estado anterior.
- Mantêm-se as suítes dos lotes anteriores e os testes de casa/calendário.

## 6. Implantação

PR empilhado sobre #134. Antes de aplicar: integrar PRs na ordem, reconciliar Drizzle em produção identificado no Lote 1, criar backup restaurável e validar migração e UI em homologação.

**Nenhuma migração 0065 ou alteração de mês foi aplicada à produção.** Sem implantação real não é correto afirmar que as fichas no site publicado já foram alteradas.

## Próximo lote

Lote 10: integração temporal com exércitos, eventos e serviços específicos, mediante regras confirmadas, sem produção periódica inventada.
