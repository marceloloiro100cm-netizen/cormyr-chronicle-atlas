# Hub Temporal de Cormyr — Lote 1: auditoria técnica e baseline de produção

**Data:** 31/10/2026  
**Escopo:** execução do Lote 1 do Plano Diretor v2: inventário de relógios, datas, consumidores, personagens, acesso e migrações.  
**Projeto Lovable conectado:** bdc007de-2bdf-4e28-8df8-b09ce46f884c  
**Repositório:** marceloloiro100cm-netizen/cormyr-chronicle-atlas; branch base main.  
**Método:** leitura do GitHub (código, migrações, testes e amostras de acervo) e **consultas SQL SELECT** diretamente no banco conectado ao projeto. Nenhum dado foi modificado.

> **Estado da entrega:** auditoria de código e baseline de produção realizados; mapa de integração e riscos registrados. A conciliação exata de migrações por hash, a revisão de todas as 170 biografias e a identidade individual dos nobres continuam sendo verificações preparatórias para seus respectivos lotes. Não afirmar que CI, migrações, teste de permissões entre contas ou deploy foram executados.

## 1. Resumo executivo

Há **um estado global de calendário** em public.campaign_calendar, mas coexistem caminhos distintos de modificação do tempo: a publicação do Narrador e o gatilho de abertura de rodada de missivas. Os consumidores de Casas trabalham parcialmente com snapshot mensal próprio. A idade dos personagens não possui fonte única. O arquivo público original armazena diversas idades históricas em texto, e a ficha legada usa idade livre, enquanto a Chronicle estruturada não dispõe desse campo.

**Decisão de arquitetura, já confirmada pelo Narrador:** a **désdia** (10 dias ordinários de Harptos) é a unidade oficial de avanço. Publicar uma nova désdia deve atualizar o dia, o mês e o ano correntes em **todas as superfícies que exibem o presente**. Quando o ano mudar, a idade cronológica de todos os nobres vivos e já nascidos deve passar a corresponder ao novo ano. **Nenhum evento histórico deve ser reescrito.**

**Recomendação do Lote 1:** não ativar avanço/envelhecimento em produção ainda. Concluir motor temporal único (Lote 2), fonte oficial de leitura (Lote 3), publicação idempotente (Lote 4) e registro canônico de personagens (Lote 6) antes do efeito anual (Lote 7).

## 2. Snapshot factual do banco de produção

| Indicador | Valor observado | Origem |
|---|---:|---|
| Ano | **1522 CV** | public.campaign_calendar.year |
| Mês / dia | **Hammer / 1** (month = 0) | campaign_calendar |
| Festival atual | nenhum | campaign_calendar.festival |
| Avanço automático legado | true | campaign_calendar.auto_advance |
| Última rodada / semana publicada | **2 / 2** | last_round / published_week |
| Versão publicada | **1** | campaign_calendar.version |
| Publicação marcada em | **2026-10-29 16:08:30 UTC** | published_at |
| Rodadas de missiva | **2** (1 fechada, 2 aberta) | letter_rounds |
| Rodadas com harptos_period nulo | **2** | letter_rounds |
| Casas registradas no Supabase | **8** | campaign_houses |
| Fichas de Casa | **8** (6 ativas; 2 rascunhos) | noble_house_sheets |
| Mês interno das oito fichas | **18264 = 1522 × 12 + Hammer (0)** | state.month |
| Unidades militares registradas | **34** | soma state.units |
| Cargos de Corte registrados | **4** | soma state.court |
| Projetos em fichas | **0** | soma state.projects |
| Lançamentos em histórico da Casa | **23** | noble_house_ledger |
| Personagens (registros, não pessoas distintas) | **19** (17 player, 2 house) | campaign_records.kind=character |
| Outros registros narrativos | **45** (kind=details, player) | campaign_records |
| Missivas totais | **66** | campaign_letters |
| Respostas totais | **49** | letter_replies |
| Missivas entregues não excluídas | **65** | campaign_letters |
| Respostas entregues | **48** | letter_replies |
| Missivas entregues sem campaign_date | **12** | campaign_letters |
| Respostas entregues sem campaign_date | **31** | letter_replies |
| Eventos públicos cadastrados no novo calendário | **0** | campaign_schedule_events |
| Linhas de auditoria do calendário | **0** | campaign_calendar_audit |
| Linhas de auditoria de eventos do calendário | **0** | campaign_schedule_event_audit |
| Backups de migração do domínio | **13** | campaign_migration_backups |
| Entradas do registro Drizzle em produção | **40** | drizzle.__drizzle_migrations |

**Interpretação restrita:** as oito fichas estão alinhadas ao **mês** global observado; isso não prova sincronização de todos os campos de tempo nem garante que projetos futuros serão processados corretamente. Com **zero obras em andamento** na fotografia do banco, o fluxo de conclusão deve ser ensaiado apenas com dados descartáveis, não em produção.

**Qualidade de datas:** as **43 correspondências entregues e sem data** (12 + 31) não serão exibidas como ocorrências datadas pelo filtro atual e **não devem receber uma data fictícia**. Não se trata de 43 erros de entrega; trata-se de uma lacuna cronológica legada a preservar e conciliar caso existam fontes autênticas.

**Personagens e acervo:** os 19 registros de personagem e os 45 registros de detalhes não constituem uma relação de pessoas únicas; uma pessoa pode aparecer em múltiplas fontes. Foram identificados rótulos textuais de idade/nascimento em 6 registros classificados como character e 10 como details. A contagem é apenas uma busca de padrões, não confirmação de nascimentos estruturados.

**Estado de auditoria:** não foi encontrada linha de campaign_calendar_audit apesar de existirem rodadas antigas e data inicial configurada. Não é possível afirmar por qual fluxo esses valores históricos foram inicializados; não retrocriar lançamentos sem evidência.

**Nota de segurança:** não foram lidos nem reproduzidos nomes, corpos de missivas, segredos da Corte, conteúdo integral de registros privados nem dados identificadores de usuários. O baseline foi obtido por agregações e metadados.

## 3. Migrações: repositório versus banco

- Arquivos do repositório **drizzle/migrations** incluem scripts até **0059_reconcile_production_schema.sql**, com outras migrações anteriores.
- O índice **drizzle/migrations/meta/_journal.json** contém **42 entradas**, encerrando em **0042_reconcile_house_workbooks**; há outro índice sob drizzle/meta com sequência parcial própria.
- A tabela real **drizzle.__drizzle_migrations** registra **40 linhas**. Isso **não comprova** diretamente que duas migrações estejam faltando; existem possíveis caminhos de aplicação fora do diário principal, hashes e sequências distintas.
- O banco possui em funcionamento as funções get_campaign_calendar, publish_campaign_schedule_confirmed, calendar_mail_events, set_letter_round, advance_calendar_round e set_round_harptos_period. A **existência** de uma função não certifica o histórico integral de deployment.
- Os gatilhos calendar_round, z_round_harptos_period e sync_campaign_calendar_week estão presentes.

**Bloqueio de segurança antes do Lote 2:** reconciliar o estado efetivamente aplicado com cada migração relevante e registrar hashes/versões em ambiente seguro; tomar backup verificado; jamais reaplicar cegamente DDL apenas porque uma contagem difere.

Consulta preparada para reavaliação: [scripts/audit-hub-temporal-prod-readonly.sql](../scripts/audit-hub-temporal-prod-readonly.sql).

## 4. Mapa de pontos de escrita do tempo (risco principal)

| Caminho | Responsabilidade atual | Risco / decisão |
|---|---|---|
| **drizzle/migrations/0038_harptos_calendar.sql**: set_campaign_calendar | Narrador publica data e auto_advance; avança meses nas Casas | Reutilizar proteção de versão; migrar para comando único por désdia e rastreio de efeitos |
| **0038**: advance_calendar_round, trigger calendar_round | Abertura de rodada de missivas pode alterar ano/mês/dia | **Crítico:** retirar a autoridade temporal da rodada; missivas não devem avançar o Reino por conta própria |
| **0043_narrator_calendar_publishing.sql**: publish_campaign_schedule | Publica data, campo published_week e eventos | Pode receber semana distinta da data: comando deverá validar ou derivar relação désdia/turno |
| **0044_calendar_confirmed_publication.sql** | Confirma data, semana e versão persistidas | Preservar retorno transacional e verificação real do snapshot |
| **0049_mail_sequential_rounds.sql**: set_letter_round | Controla abertura/fechamento/entrega sequencial de missivas | Preservar sem renumeração; separar contador de correspondências do turno de désdia |
| **0056_round_harptos_period.sql** | Grava referência do período quando rodada abre | Rodadas legadas em produção seguem sem período; não forçar backfill sem fontes |
| **src/components/calendar/narrator-calendar.tsx** | UI publica data + semana + automático | Hoje permite digitar contador semanal independente; substituir por comando de désdia |
| **src/lib/house/house.functions.ts** | Bloqueia avanço individual e exige alinhamento mensal nas compras | Preservar proteção; substituir leituras dispersas pela API do tempo |
| **src/lib/house/engine.ts** + SQL apply_calendar_months | Calcula conclusão de construção por mês | Manter durações mensais e tratar transições; não aplicar novamente efeitos de obra |

**Evidência de bug de contagem:** a função SQL ativa advance_calendar_round calcula o próximo limite a partir do intervalo atual, por exemplo do dia 17 para 21 (4 dias ordinários), enquanto o requisito aprovado é **17 → 27** (10 dias ordinários). Festivais intercalares também não são atravessados explicitamente nesse cálculo. Não corrigir com uma mudança cosmética de rótulo.

**Atenção à publicação:** publish_campaign_schedule atualmente invoca set_campaign_calendar e registra uma entrada adicional de auditoria. Ao construir o comando único, garantir **um evento canônico de avanço com identificador imutável** e efeitos sem duplicidade, mesmo que existam registros auxiliares.

## 5. Mapa de leituras e telas que exibem tempo corrente

| Local | Dependência observada | Integração a ser instalada |
|---|---|---|
| **src/components/calendar/calendar.tsx** | RPC get_campaign_calendar, eventos e calendário; fallback local 1522 | useCampaignTime() derivado do snapshot |
| **src/components/calendar/date-picker.tsx** | fallback de navegação 1522 | seleção baseada no snapshot; distinção entre consulta e publicação |
| **src/components/calendar/realtime.ts** | Realtime do campaign_calendar + polling | invalidar cache e reler fonte autorizada, não transmitir dados privados |
| **src/components/house/hub.tsx** | mês global versus state.month; projetos exibidos por estado local | snapshot oficial + projeção histórica da ficha |
| **src/components/house/kingdom-dashboard.tsx** | data global do reino, divergência mensal | status completo por mês/ano e pendências |
| **src/components/house/fortune-panel.tsx** | state.month delimita ações e Sorte | avançar mês altera disponibilidade, nunca rolar por conta própria |
| **src/lib/house/engine.ts** | houseSeason(state.month); purchase e advance por mês | relógio central fornece estação e períodos cruzados |
| **src/lib/house/regions.ts** | campaignMonth para renderizar mês/ano por índice | manter formatador histórico; snapshot determina apenas o presente |
| **src/components/players/missivas-tab.tsx** | data da campanha, semana de resposta, rodada | período oficial com vínculo explícito à rodada de entrega |
| **src/components/players/mail-compose.tsx** | selecionador da data + semana de entrega | autenticar data do documento; não converter automaticamente data histórica |
| **src/components/player-representation.tsx** | date picker independente | vincular data do documento ao contexto correto da representação |
| **src/routes/_authenticated/jogadores.tsx** | calendários do jogador e do Narrador | mesma referência publicada para todas as áreas |
| **src/lib/house/report.ts** e **export.ts** | mês do snapshot da Casa em PDF/relatório | exportar as-of e registrar versão/data da leitura |
| **public/cormyr/app.js** e **data.js** | acervo público com idades, eras e cronologias | projeção pública mínima do presente; preservar datas históricas |

**Dois calendários diferentes não devem ser confundidos:** Date/Date.now reais servem para timestamps de auditoria, comunicação e atualização; Harptos serve para data da campanha. Não substituir globalmente os timestamps gregorianos por Harptos.

**Critério para encontrar referências fixas:** inspecionar uso, não apenas ocorrência textual. O arquivo public/cormyr/app.js contém a divisão histórica antes/depois de 1522, que deve permanecer por representar um evento do passado; defaults do presente em calendário.tsx, date-picker.tsx, narrator-calendar.tsx e newHouseState(1522 × 12) exigem migração para leitura do servidor.

## 6. Eventos públicos e privacidade das missivas

- **0038**: calendar_mail_events (função presente no banco) consulta missivas e respostas entregues, usando leitura sob RLS do usuário. Verificar com duas sessões independentes de jogador na bateria de testes do Lote 8.
- **Bug confirmado na função de produção:** o filtro mensal aceita todo prefixo de festival «F-» sem conferir em qual mês o festival se situa. Isso pode apresentar um evento intercalar no mês errado; corrigir a associação mês/festival no Lote 2/Lote 8.
- **0043**: get_campaign_schedule_events exige acesso ativo e publica apenas snapshot de eventos já publicados. Existem **zero eventos editoriais** nesse cadastro no baseline.
- **campaign_calendar**: política SELECT calendar_read = campaign_access_active; auditoria só para Narrador (calendar_audit_read); **campaign_letters**, **letter_replies** e **campaign_records** usam políticas de leitura específicas. Realtime de calendar foi registrado em supabase_realtime; publicações também incluem letters e records.
- **Conclusão:** política de dados privados deve continuar no servidor. O evento global de tempo não deve transportar nomes, títulos, contagens nem IDs de missivas privadas. Não é suficiente ocultar cards na interface.

**Teste pendente:** autenticar duas contas independentes e confirmar por RPC, rede e calendário que uma não consegue inferir dados da outra. Esta fase não incluiu autenticação simulada nem testes de mutação sobre o banco real.

## 7. Inventário preliminar de nobres e genealogias

### Fontes distintas

1. **public/cormyr/data.js**: 11 regiões, **172 Casas**, com **13 campos de idade diretamente preenchidos** no catálogo de casas. Idades podem ser narração livre.
2. **public/cormyr/histories/*.json**: **170 arquivos** de história, com biografias, dados temporais e genealogias de épocas distintas. Não equivalem a 170 pessoas.
3. **public.campaign_records**, produção: **19 character** e **45 details**; conteúdo textual / ficha legada / ficha Chronicle estruturada; escopo de leitura restrito por registro.
4. **campaign_houses.lord_name**, **noble_house_sheets.state.court**, NPC vinculados e vassalagem: a mesma pessoa pode ter registros e papéis redundantes.
5. **src/lib/ficha.ts**: idade é string em ficha legada; **src/lib/house/character-sheet.ts** não traz nascimento/idade estruturada.
6. **src/components/npc-hub.tsx** e **src/lib/npc.ts**: NPCs podem ser descritos em texto sem metadados de nascimento.

### Amostras de consistência verificadas no acervo

| Pessoa | Fonte narrada | Idade calculável em 1522 | Encaminhamento |
|---|---|---:|---|
| Percival Evenhand | nascimento 1492 CV, idade narrativa 30 | 30 | candidato a vínculo canônico |
| Planchar Stonecastle | nascimento 1447 CV, idade narrativa 75 | 75 | candidato a vínculo canônico |
| Lariane Torchwinter | nascimento 1498 CV, idade narrativa 24 | 24 | candidato a vínculo canônico |
| Tomenn Staghunt | nascimento 1443 CV, idade narrativa 64 | **79** | **CONFLITO**: não corrigir automaticamente; pedir revisão da referência |

Essas informações são **amostras de arquivos públicos**, não a auditoria de todas as linhagens. Não deduzir vida/morte ou idade exata de personagens apenas pela raça.

### Regras técnicas a preservar ao implementar idades

- Uma identidade canônica por pessoa, com vínculos para todas as fontes; não identificar pelo nome isoladamente.
- Nascimento/ano-base validado; idade cronológica derivada do **ano oficial CV**; +1 na virada do ano, **sem incrementar e salvar o número outra vez**.
- Vivos e já nascidos são elegíveis; falecidos mantêm idade do falecimento; sem nascimento confiável deve aparecer **pendente**.
- Idade aparente, magia, tempo feérico e imortalidade são exceções auditadas do Narrador.
- Texto e datas de fontes históricas permanecem imutáveis. O ano 1375 de fundação e a comparação «antes/depois de 1522» não podem ser sobrescritos pelo presente.
- Não criar tabela de personagens em produção no Lote 1. Isso integra os Lotes 6 e 7 após deduplicação e política de privacidade.

## 8. Tabela de riscos e dependências

| ID | Severidade | Evidência | Ação necessária antes do go-live |
|---|---|---|---|
| T-01 | **Crítica** | advance_calendar_round pode mudar data ao abrir missiva | mover autoridade de avanço para serviço central de désdia |
| T-02 | **Alta** | dia 17 avança ao limite 21, não 27 | motor ordinal Harptos determinístico |
| T-03 | **Alta** | data e published_week podem ser alteradas isoladamente | ancorar turno na data e validar publicação |
| T-04 | **Alta** | 43 correspondências entregues sem data | manter como históricas sem data até fonte confiável |
| T-05 | **Alta** | 40 execuções Drizzle, 42 entradas no diário, scripts posteriores | reconciliar hashes/deploy e backup antes de DDL |
| T-06 | **Alta** | fontes de idade não normalizadas; conflito Staghunt | registro canônico e fila de revisão |
| T-07 | **Alta** | calendário de cartas aceita festival de qualquer mês | corrigir filtro e testar RLS |
| T-08 | **Média** | defaults 1522 para contexto corrente | consumir snapshot oficial, preservar história |
| T-09 | **Média** | mês de cada Casa é snapshot | reconciliar avanços sem duplicar obra ou Sorte |
| T-10 | **Média** | 0 entradas de auditoria temporal atuais | auditoria canônica futura, sem inventar logs antigos |
| T-11 | **Alta** | nenhuma execução ponta a ponta sob dois jogadores nesta fase | teste isolado de privacidade obrigatório |

## 9. Pontos de conexão previstos para as próximas etapas

| Interface planejada | Lote dono | Consumidores |
|---|---|---|
| getCampaignTime / useCampaignTime | 3 | calendário, cabeçalho, Casa, público |
| getHarptosOrdinal / advanceHarptosDesdia | 2 | motor de tempo |
| previewCampaignTimeChange | 4 | Narrador + consumidores críticos |
| publishCampaignTimeChange | 4 | gravação autoritativa |
| campaign.month.changed | 4, 9 | obras, Sorte, economia |
| campaign.year.changed | 4, 7 | genealogia/idade |
| campaign.festival.crossed | 2, 8 | agenda e festas |
| getCharacterAge(characterId, asOfDate) | 7 | fichas, Corte, acervo público autorizado |
| registerTemporalConsumer | 10 | extensões futuras |
| getTemporalConsumerStatus / replayTemporalConsumer | 10 | auditoria do Narrador |

**Invariante:** os consumidores registram efeitos idempotentes, mas **não editam a data oficial**. Toda atualização visível do presente deriva do mesmo snapshot versionado, e o backend recusa mutações feitas com versão de relógio obsoleta.

## 10. Plano de testes antes das alterações

- [ ] Testar fronteiras de Hammer, Nightal e anos divisíveis por quatro, com Midwinter, Greengrass, Midsummer, Shieldmeet, Highharvestide e Feast of the Moon (ambiente descartável).
- [ ] Validar 17 Ches → 27 Ches (+10 dias ordinários).
- [ ] Validar 21 Nightal 1522 → 1 Hammer 1523, incluindo todos os consumidores e idades.
- [ ] Testar reenvio e dois cliques sem incrementar idade, processar obra ou entregar missiva duas vezes.
- [ ] Testar saldos e construções existentes sem tentar alterar produção.
- [ ] Testar missivas autorizadas entre usuários distintos, inclusive títulos e contagens.
- [ ] Validar migrações em banco de testes espelhando estrutura e particularidades do banco conectado.
- [ ] Registrar antes/depois dos perfis públicos e fichas privadas respeitando direitos de acesso.
- [ ] Executar testes unitários, build e CI da branch antes de mesclar.

## 11. Critério de saída do Lote 1

**Realizado:** levantamento dos pontos principais de leitura/escrita, baseline real agregado, inventário das fontes de idade, classificação de riscos, mapa dos pontos de conexão e **script de auditoria SQL somente de leitura** versionado no repositório.

**Não realizado por decisão de escopo:** alteração de relógio, implantação de tabelas ou triggers, backfill de datas, processamento de obras, mudança de idades, merge na main e publicação pelo Lovable.

**Pendências registradas:** conferência por hash do histórico de migração e auditoria individual de fontes nobiliárquicas, que serão tratadas no pré-implantação e nos Lotes 6–7. Não devem bloquear a conclusão documental deste lote, mas **bloqueiam ativação de novas migrações ou envelhecimento automático** sem conciliação.

**Próxima etapa proposta:** Lote 2 — motor puro de Harptos e désdias; primeiro desenvolver testes com tabelas de datas e intervalos, preservando os dados reais e sem ativar os gatilhos em produção.
