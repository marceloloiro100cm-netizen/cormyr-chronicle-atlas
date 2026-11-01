# Hub Temporal de Cormyr — Lote 4: Publicação transacional e auditável

**Data:** 31/10/2026 · **Dependências:** PRs #127 (motor Harptos) e #128 (leitura única).

## Arquitetura

A nova migração 0060_hub_temporal_atomic_publication.sql introduz a única entrada de publicação temporal, a RPC **publish_campaign_time_change**, com autorização exclusiva do Narrador, controle de versão, chave UUID de idempotência, lock transacional e trilha de auditoria. A chamada atualiza uma única linha de campanha e reutiliza o procedimento de avanço mensal das Casas dentro da mesma transação.

**Modos:**
- **advance:** soma dez dias ordinários por désdia, descontando festivais intercalares.
- **set:** escolhe/corrige uma data válida. Retrocesso exige autorização explícita e justificativa de pelo menos dez caracteres; não desfaz obras concluídas.
- **publish:** publica eventos oficiais aprovados, sem avançar o dia.

O retorno acrescenta à linha do calendário um marcador de operação duplicada. Em caso de reenvio com a mesma chave, ator e parâmetros, a função retorna o snapshot anteriormente persistido sem aplicar novos efeitos. A mesma chave com outros parâmetros/ator é rejeitada.

## Fluxo atômico

1. Narrador autenticado e versão esperada informada.
2. Lock global do calendário e consulta à tabela de operações.
3. Resolução da data e prévia (dias, meses, anos, festivais); verificação de retrocessos e limites.
4. Aplicação dos meses de gestão das Casas, somente se o mês avançou.
5. Atualização do calendário global; campo auto_advance passa a false para impedir expectativa de avanço implícito por rodada.
6. Publicação de eventos que saíram do rascunho, mantendo o isolamento das permissões.
7. Um audit do calendário e um registro completo de operação.
8. Retorno do snapshot versionado para validação da interface.

Uma falha transacional desfaz todos os efeitos desta operação. A chave de idempotência permite retentar com segurança após falhas de rede.

## Prévia e histórico

**preview_campaign_time_change** retorna o período de origem e destino, delta de dias ordinários e corridos, meses e viradas de ano, festivais atravessados, contagem agregada de fichas de Casa e alerta sobre retrocesso. Não altera nenhuma linha e é restrita ao Narrador.

**get_campaign_time_history** fornece somente metadados de até 100 operações e só é acessível ao Narrador. A tabela campaign_time_operations tem RLS ativada e nenhum SELECT direto concedido a jogadores. A prévia e a auditoria não revelam conteúdo privado de missivas, fichas e NPC.

## Separação da abertura de missivas

A migração desativa os gatilhos calendar_round e sync_campaign_calendar_week; abrir/fechar uma rodada não muda a data, a versão ou o ano do Reino. O gatilho que registra a referência de Harptos no momento de abrir a rodada é preservado. O campo published_week fica como metadado legado, independente da désdia. A adaptação completa da apresentação das missivas pertence ao Lote 8.

Os RPCs legados de escrita do tempo têm permissão EXECUTE revogada para anon e authenticated, impedindo o bypass da nova autorização por chave.

## Interface

A área Calendário do Narrador passa a permitir avanço de N désdias, correção manual de datas e publicação apenas de eventos, sempre com prévia do servidor e confirmação humana. O componente não confirma sucesso sem verificar data e versão; um retry reaproveita a chave UUID do mesmo pedido.

## Testes versionados

A execução do PostgreSQL descartável aplica todas as migrações e executa:
- scripts/test-hub-temporal.sql (motor SQL, Midwinter, Shieldmeet, viradas de ano, versão, idempotência, audit, RLS, retrocesso e separação das rodadas);
- scripts/test-calendar.sql, scripts/test-narrator-calendar.sql, scripts/test-calendar-confirmed.sql, scripts/test-calendar-realtime.sql, adaptados à autoridade central;
- src/test/narrator-calendar-publish.test.tsx para prévia, UI do Narrador, conflito, replay, erro de permissão e falta de confirmação.

## Condição de implantação

**Nenhuma migração foi executada em produção pelo ChatGPT.** O código deve ser integrado de forma coordenada com a migração 0060. Antes disso é obrigatório reconciliar o histórico Drizzle observado no Lote 1, fazer backup restaurável e validar aplicação num banco de homologação com cópia compatível do esquema. Aplicar só o frontend ou só a migração interromperia a publicação do calendário.

Idades nobres, agenda pública anônima, novos consumidores tipados e fan-out de efeitos continuam nos lotes planejados. Históricos e genealogias nunca são reescritos automaticamente.
