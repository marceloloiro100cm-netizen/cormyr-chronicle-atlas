# Hub Temporal de Cormyr — Lote 8: Missivas e Cronologia Histórica

**Data:** 31/10/2026 · **Branch:** feat/hub-temporal-lote-8-missivas-cronologia  
**Dependências:** PRs #133, #132, #131, #130, #128 e #127.

## 1. Separação entre tempo e correspondência

A linha de campanha campaign_calendar continua sendo a fonte única do ano, mês e dia de Harptos. Somente o RPC de Lote 4, publish_campaign_time_change, publica avanços. Abrir ou fechar uma rodada de letter_rounds pelo RPC set_letter_round **não incrementa dia, mês, désdia ou ano**.

A coluna letter_rounds.harptos_period, criada no antigo lote de missivas 0056, registra uma fotografia no momento da abertura, como 1522-01:désdia-3 ou 1522-F-midwinter. Esse valor não muda quando o calendário avança. As rodadas legadas com NULL permanecem sem referência histórica — nenhuma data é inventada retroativamente.

Cada missiva mantém quatro referências independentes:
- campaign_date — data narrativa histórica selecionada pelo autor;
- creation_week e delivery_week — rodadas de correspondência, nunca désdias;
- created_at e delivered_at — timestamps reais técnicos, não datas CV;
- harptos_period da rodada — fotografia do período da abertura, não a data exata de cada carta.

A migração 0064 não reescreve nenhuma carta, resposta, data ou semana histórica, nem altera o funcionamento da entrega.

## 2. Correção de festivais intercalares

O calendário de missivas legado considerava qualquer YYYY-F-* como pertencente a qualquer mês de Harptos. A migração 0064 introduz campaign_date_in_month(data,ano,mês), com validação estrita:
- Midwinter = Hammer;
- Greengrass = Tarsakh;
- Midsummer e Shieldmeet = Flamerule (Shieldmeet somente bissexto);
- Highharvestide = Eleint;
- Feast of the Moon = Uktar.

calendar_mail_events agora aplica o filtro correto com SECURITY INVOKER, RLS dos registros de origem, somente correspondências entregues e não excluídas. Não revela conteúdo, destinatários, rascunhos nem notas do Narrador.

## 3. Consulta mensal da cronologia

get_campaign_chronology(p_year,p_month) retorna, para um usuário autenticado e autorizado:
1. Cartas e respostas entregues com data histórica explícita e visíveis pela RLS.
2. Eventos oficiais publicados, nunca os rascunhos.
3. Rodadas com referência Harptos congelada pertencente ao mês consultado.
4. Contagem de rodadas históricas sem referência, para marcar lacunas sem inferir datas.

Os eventos são ordenados pelo ordinal de Harptos, não pela ordem alfabética do texto das datas, garantindo que festivais intercalares apareçam após os dias apropriados. O RPC possui SECURITY INVOKER, não dá acesso anônimo e não transforma uma semana de entrega em data de calendário.

## 4. Interface

- Calendário dos jogadores: painel de cronologia do mês consultado, com eventos e rodadas vinculadas.
- Hub Temporal do Narrador: seção Cronologia no mês oficial.
- Missivas: o aviso e a identificação da rodada mostram a fotografia da abertura, distinguindo-a do presente e do dia de cada carta.
- A abertura de uma semana informa explicitamente que não avança o tempo oficial; as entregas agendadas mantêm seu fluxo.
- Correspondências sem data: permanecem históricas sem referência confirmada, sem receber data suposta.
- Realtime e ações de missivas invalidam o cache da cronologia; a leitura também é atualizada periodicamente.

O frontend valida datas e tipos via src/lib/calendar/chronology.ts.

## 5. Testes

- scripts/test-mail-chronology.sql: abertura congelada, independência entre tempo/rodada, carta histórica no passado, meses de festivais, ordem dos eventos, agenda publicada versus rascunho, legado NULL e isolamento entre Casas.
- src/test/mail-chronology-contract.test.ts: referências de rodada, eventos de mês errado, festivais bissextos e deduplicação.
- src/test/mail-period-frozen.test.tsx: aviso do Mestre quando a rodada é anterior ao calendário atual.
- Suítes anteriores de calendário, missivas, segurança e SQL permanecem na CI.

## 6. Implantação e próximos passos

**Nenhuma migração foi aplicada ao Supabase de produção.** Lote 8 depende de PR #133 e lotes anteriores; é indispensável reconciliar Drizzle, testar em homologação e fazer backup antes de integrar as migrações 0060–0064 e a interface.

A revisão operacional deverá abrir uma rodada, avançar uma désdia sem mudar a rodada, enviar carta com data histórica explícita, entregar resposta e comparar as visões de duas Casas diferentes.

**Limite de privacidade:** o Atlas público anônimo continua recebendo somente a data oficial do Lote 5, sem correspondências, identidades ou outros detalhes privados.

**Próximo lote planejado:** Lote 9 — consumidores temporais de posses, projetos e serviços.
