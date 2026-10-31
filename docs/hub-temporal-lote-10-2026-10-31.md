# Hub Temporal — Lote 10: consumidores, pontos de conexão e entregas seguras

**Data:** 31/10/2026  
**Base:** Lote 9 / PR #135, empilhado sobre as PRs anteriores.  
**Implantação:** apenas código no GitHub. Não aplicado ao banco real de Cormyr.

## Objetivo

Preparar o calendário oficial como fonte única de acontecimentos temporais para todo o site, com contrato explícito de consumidores, entrega atômica e replay seguro. **Não criar remuneração automática, bônus inventados, novas tropas, ações mensais, estações com efeito narrativo, serviços concluídos ou transferência automática entre vassalos.**

## Componentes adicionados

1. **drizzle/migrations/0066_temporal_consumer_outbox.sql**
   - Cadastro somente por migração: \`campaign_temporal_consumers\`.
   - Outbox \`campaign_temporal_deliveries\`, única por \`(operation_id,consumer_code)\`.
   - Trigger após INSERT em \`campaign_time_operations\`; ocorre na **mesma transação** do avanço/calendário/obras e não escreve se a publicação falha.
   - Divisão entre **projection** (estado informativo consumido por consultas) e **manual_review** (pendência explícita, sem efeitos automáticos).
   - Auditoria de resoluções \`campaign_temporal_delivery_resolutions\` com UUID de requisição idempotente.
   - Tabela \`campaign_temporal_effect_checkpoints\` para futuras operações transacionais. Não é escrita por este lote e não possui RPC aberta a jogadores.
   - RLS ativada nas quatro tabelas; nenhum acesso direto para \`anon\` ou \`authenticated\`. Acesso através de RPCs específicas do Narrador: \`get_temporal_consumer_dashboard\`, \`resolve_temporal_delivery\` e \`replay_temporal_delivery\`.
2. **src/lib/calendar/temporal-consumers.ts**: tipos, validação estrita da fila, cálculo Harptos de períodos e identidade por versão.
3. **src/components/calendar/temporal-consumer-hub.tsx**: visão gerencial do Narrador, descrição dos pontos de conexão, pendências, justificativa de revisão e replay de consulta.
4. **src/components/calendar/narrator-calendar.tsx** e **realtime.ts**: nova navegação no hub, invalidação de cache após publicação e atualização em tempo real.
5. **src/integrations/supabase/types.ts**: contrato dos RPCs novos.

## Consumidores de integração

| Código | Gatilho | Natureza | Responsabilidade |
| --- | --- | --- | --- |
| official-calendar | toda publicação | projeção | versão e data oficial para cabeçalho e páginas |
| chronology | toda publicação | projeção | eventos, missivas e cronologia, sem redatação |
| noble-ages | mudança de ano | projeção | idades derivadas de dados canônicos (inclui falecidos) |
| house-assets | mudança de mês | projeção | consultar obras, holdings e efeito já ativado no Lote 9 |
| army-units | mudança de mês | projeção | recalcular bônus existentes, sem recrutamento ou pagamento |
| economy | mudança de mês | revisão manual | determinar se uma regra específica permite ação de recursos ou Sorte |
| services | mudança de mês | revisão manual | examinar serviços e prazos não vinculados ao fluxo de obras |
| vassalage | mudança de mês | revisão manual | examinar obrigações dependentes de tempo |
| seasons | mudança de estação | revisão manual | examinar regras sazonais aprovadas caso a caso |

Na versão do Lote 11, as transições de estação são contadas pelas **fronteiras efetivamente atravessadas**. Um salto de doze meses do inverno para outro inverno atravessa quatro estações e gera uma pendência de revisão, mesmo com a estação inicial e final iguais. Uma publicação sem mudança da data notifica apenas os consumidores \`always\`. Um retrocesso pode gerar novas pendências de revisão, porém **não desfaz operações nem reexecuta regras históricas**.

## Garantias

- **Exatamente uma notificação por operação/consumidor**, pela restrição única e pelo próprio UUID idempotente da publicação.
- Reenvio de \`publish_campaign_time_change\` não faz novo INSERT na operação; portanto, o gatilho não roda outra vez.
- Mensagens são metadados de tempo e operação, sem conteúdos secretos de missivas, fichas, recursos, NPCs e personagens.
- \`resolve_temporal_delivery\` apenas registra a decisão do Narrador com justificativa (mín. dez caracteres); **não aplica um efeito**. Uma entrega resolvida não pode ser aberta novamente, e o mesmo UUID de resolução retorna a decisão anterior sem segunda escrita.
- \`replay_temporal_delivery\` é leitura pura do evento persistido, com \`replay_read_only=true\`. Não enfileira, não remunera e não modifica o relógio.
- Em futuras integrações **com** mutação, a chave do checkpoint deve representar o efeito de negócio único (Casa + mês absoluto + regra), nunca apenas o UUID da operação; checkpoint e efeito devem estar na mesma transação de banco.
- Não existe worker externo que execute automaticamente os eventos, até haver regras e executores aprovados.

## Critérios de aceite e verificações

- SQL descartável: \`scripts/test-temporal-consumers.sql\` cobre cadastro, notificações mensais, evento de exército meramente informativo, duplicidade de publicação, revisão e repetição da chave, replay puro, retrocesso, RLS e ausência de checkpoints de efeito.
- Unitários: \`src/test/temporal-consumers-lote10.test.ts\` cobre validação de dados, vínculos de consumidores, status, estações e festivais intercalares.
- CI inclui o teste SQL após os lotes anteriores.
- Verificar workflows GitHub e validação visual do Hub do Narrador antes de merge. Nenhum teste em PostgreSQL de produção foi realizado.

## Implantação e dependências

PR do Lote 10 sobre a branch de #135. A ordem de integração deve respeitar as dependências de #126–#135. Fazer reconciliação Drizzle de produção, backup restaurável e testes completos em homologação antes de aplicar a migração 0066. A UI nova exige a migração 0066 para não apresentar erro de RPC.

## Próximo lote

**Lote 11:** auditoria de ponta a ponta, revisão das permissões, provas de idempotência/retrocesso, plano de migração/rollback, testes em homologação e aceite de publicação. Não habilitar cobranças ou recursos por passagem de tempo sem uma regra de jogo formalmente definida.
