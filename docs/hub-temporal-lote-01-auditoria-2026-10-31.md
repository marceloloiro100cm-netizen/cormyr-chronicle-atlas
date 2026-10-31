# Hub Temporal de Cormyr — Lote 01: auditoria e linha de base

**Data da auditoria:** 31/10/2026. **Escopo:** leitura da branch `main` e consultas `SELECT` ao banco Supabase vinculado ao projeto Lovable. **Situação:** relatório e instrumentos de conferência; nenhuma alteração de estado, migração, calendário, missiva ou ficha foi executada.

## 1. Critério de aceite do lote

O Lote 1 do Plano Diretor v2 exige (1) levantamento de pontos de leitura e escrita de tempo, (2) diferenciação entre referências históricas e correntes, (3) mapa de dependências e privacidade, (4) inventário de personagens/fontes de idade, e (5) baseline de produção contra migrações. **Este relatório atende ao diagnóstico inicial, mas a reconciliação definitiva de todas as migrações precisa de conferência antes de qualquer DDL.**

## 2. Baseline conferido em produção

| Evidência | Resultado observado |
| --- | --- |
| Fonte temporal | `public.campaign_calendar`, linha global única |
| Data oficial | **1 de Hammer, 1522 CV** (`year=1522, month=0, day=1, festival=null`) |
| Rodada/controle | `published_week=2`, `last_round=2`, `auto_advance=true`, `version=1` |
| Publicação registrada | `published_at=2026-10-29T16:08:30.13153+00:00` |
| Rodadas de missivas | 2: rodada 1 encerrada, rodada 2 aberta |
| Casas do sistema gerencial | 8 cadastradas, 8 ativas; 7 com titular preenchido |
| Fichas estruturadas das Casas | 8; todas têm campo `month` = **18264** (Hammer/1522) |
| Projetos no JSON das fichas | 0 entradas em `projects`; não confundir com construções/posses existentes |
| Vínculos de Corte dentro das fichas | 4 entradas, não equivalem a 4 pessoas distintas |
| Registros privados de campanha | 64 (`campaign_records`): 19 `character`, 45 `details` |
| Fichas Chronicle com prefixo estruturado | 0 detectadas entre os 64 registros consultados |
| Correspondência | 66 missivas, 49 respostas; conteúdo não consultado nem exportado |
| Eventos editáveis | 0 em `campaign_schedule_events` |
| Trilhas de auditoria temporal | 0 em `campaign_calendar_audit`, 0 em `campaign_schedule_event_audit`, 0 operações `calendar_advance` no ledger consultado |
| Drizzle — ledger de produção | 40 entradas; maior `id=40`, maior `created_at=1793290109327` |

**Nota sobre as idades:** os 19 registros `kind='character'` não foram interpretados como 19 nobres distintos. Não extraímos nomes nem conteúdo privado do banco. Também não é possível estimar quantas pessoas aparecem dentro dos 45 registros de detalhes.

**Nota sobre a fonte:** números de produção refletem o instante da consulta e podem mudar posteriormente. Use `scripts/audit-hub-temporal-production-readonly.sql` para repetir o levantamento agregado sem modificar a campanha.

## 3. Divergência entre código, migrações e produção — prioridade máxima

1. A branch possui arquivos SQL de migração até `0059_reconcile_production_schema.sql`, incluindo implementações de publicação `0043`, `0044`, Realtime `0045`, numeração sequencial de missivas `0049` e período de Harptos `0056`.
2. O ledger de produção `drizzle.__drizzle_migrations` contém 40 linhas, sendo `id=40` a última. Entretanto, **o banco já contém** `published_week`, `publish_campaign_schedule_confirmed`, `campaign_schedule_events`, gatilho de Realtime e `letter_rounds.harptos_period`, cuja origem de código é posterior ao histórico do ledger. A definição atual de `set_letter_round` coincide em características relevantes com a migração sequencial `0049`.
3. O repositório mantém **dois caminhos de journal** (`drizzle/migrations/meta/_journal.json` e `drizzle/meta/_journal.json`) com sequências de entradas distintas; há inclusive arquivos `0041_...` com o mesmo prefixo de numeração. Um nome de arquivo ou ID isolado não comprova ordem/aplicação completa.
4. **Conclusão de segurança:** existe descompasso comprovável entre objetos implantados e rastreamento de migrations. Não reaplicar cegamente `0041–0059`. Antes do Lote 2/3 alterar SQL, comparar definições, dependências, hashes/commits de implantação e backups, reconstruindo um inventário versionado sem substituir objetos ainda em uso.

**Estado:** divergência verificada; origem exata de cada alteração não comprovada. Este lote não tenta repará-la automaticamente.

## 4. Inventário dos pontos que leem ou alteram o tempo

| Camada | Arquivo/objeto | Situação e consequência |
| --- | --- | --- |
| Banco, data oficial | `campaign_calendar`, `get_campaign_calendar()` | Uma linha global já representa o tempo publicado; reaproveitar como fonte autoritativa |
| Banco, publicação | `set_campaign_calendar`, `publish_campaign_schedule`, `publish_campaign_schedule_confirmed` | Mutadores autorizados/versionados; atualizar para désdia e novo contrato central |
| Banco, disparador indireto | gatilho `calendar_round` em `letter_rounds` → `advance_calendar_round()` | **Crítico:** abrir rodada ainda pode alterar data/mês/ano |
| Banco, correspondências | `set_letter_round`, `sync_campaign_calendar_week`, `set_round_harptos_period` | Rodada de entrega e turno narrativo precisam ser desacoplados sem renumerar histórico |
| Banco, projetos | `apply_calendar_months(delta)` | Conclui projetos por mês; preservar sem disparar duas vezes |
| Banco, visibilidade de cartas | `calendar_mail_events` + RLS `can_read_letter`/`can_read_reply` | Não reutilizar fora de sessão autorizada; consultar como participante, não com service role no frontend |
| Frontend, Narrador | `src/components/calendar/narrator-calendar.tsx` | Permite editar data e **semana numérica** com publicação confirmada; refatorar para désdia oficial |
| Frontend, jogadores | `src/components/calendar/calendar.tsx` e `realtime.ts` | Já consomem a data global; melhorar uso do snapshot comum e atualização dos demais módulos |
| Ficha de Casa | `src/components/house/hub.tsx`, `kingdom-dashboard.tsx` | Leem calendário global, mas mostram mês local `state.month` em projetos; manter snapshot histórico separado |
| Server/RPC de Casa | `src/lib/house/house.functions.ts`, `calendar-consistency.ts` | Verificam alinhamento mensal; novas Casas ainda têm default local legado |
| Motor de regras | `src/lib/house/engine.ts`, `fortune.ts`, `houseSeason` | Ações, construções e restrições sazonais dependem do mês; consumidores obrigatórios do Hub |
| Interface de missivas | `src/components/players/missivas-tab.tsx` | Consulta período global por outra query key; também abre/fecha semanas via RPC; auditar invalidadores |
| Conteúdo histórico público | `public/cormyr/index.html`, `app.js`, `data.js` | Mistura descrições do presente com marcos históricos fixos; precisa de projeção pública sem segredos |
| Exportações | `src/lib/house/report.ts`, `export.ts` | Relatórios por mês: manter data de referência imutável na exportação e ano corrente ao gerar novos documentos |

### Evidências de defeitos ou lacunas

- **T01 — avanço irregular em data intermediária (crítico):** a função de produção `advance_calendar_round()` calcula `((day-1)/10+1)*10+1` e troca de mês quando ultrapassa 30. Isso salta para a próxima fronteira de désdia, em vez de somar sempre 10 dias ordinários; também zera `festival`. Contraria a regra definitiva do Plano Diretor v2.
- **T02 — dois donos do relógio (crítico):** uma publicação administrativa e a abertura de missivas alcançam o relógio por caminhos distintos. Prioridade do Lote 4: uma única transação de avanço, sem publicação duplicada.
- **T03 — intercalários de missivas (alto):** `calendar_mail_events` filtra datas `F-` sem fixar o mês de cada festival. Pode fazer o festival de um mês aparecer em outro; manter autorização SQL para títulos/contagens privadas.
- **T04 — presentes fixados em 1522 (alto):** `src/components/campaign-shell.tsx` mostra «Crônicas do Reino · 1522 CV»; `public/cormyr/index.html` mostra «SEGUNDA TEMPORADA 1522 CV». A referência precisa passar a vir do Hub onde significar ano atual.
- **T05 — defaults locais (alto):** `src/lib/house/types.ts` cria casa com `month=1522*12`; `src/components/calendar/{calendar,date-picker,narrator-calendar}.tsx` usa fallback 1522. Novas estruturas não poderão confiar nisso como presente da campanha.
- **T06 — caches e atualizações (médio):** missivas usam query `campaign-calendar-period`, enquanto calendário/Hub compartilham `campaign-calendar`. Não há demonstração de invalidação central de **todos** os módulos após publicação. Reforçar no Lote 3/5.
- **T07 — textos históricos (não é defeito):** as visões «antes/depois de 1522» em `public/cormyr/app.js`, anos de fundação, mortes e guerras **não** podem sofrer substituição global. Precisam de `asOfDate` quando houver consulta cronológica.
- **T08 — documentação defasada (médio):** `README.md` fala em 35 migrações e `docs/house-calendar-management.md` trata eventos públicos como sugestão futura, embora a branch e produção já possuam esse recurso.

## 5. Idades, nobres e genealogias — inventário de fontes

| Origem | Estrutura | Implicação para Lotes 6–7 |
| --- | --- | --- |
| `public/cormyr/data.js` | 11 regiões, **172 Casas**, apenas **13** com campo `age` preenchido | O catálogo lista Casas, não todas as pessoas nobres |
| `public/cormyr/histories/*.json` | **170 arquivos** textuais | Nascimentos e idades aparecem em narrativas; preservar versões originais |
| `public.campaign_records` | 19 registros `character`, 45 `details` | Não se deve contar registros como indivíduos; migração precisará de vínculos e autorização |
| `src/lib/house/character-sheet.ts` | `ChronicleSheet` sem nascimento/idade | Acrescentar ID canônico, nascimento e projeção de idade sem quebrar versão 1 |
| `src/lib/ficha.ts` e `src/components/players/ficha-form.tsx` | `FichaPersonagem.idade` como string livre | Preservar texto, conciliar nascimento e baseline; nunca incrementar a string cegamente |
| `src/lib/npc.ts`, `src/components/npc-hub.tsx` | NPC em registros narrativos de texto | Mesmo personagem pode estar na Corte e catálogo, portanto exige identidade única |
| `src/lib/house/types.ts` | `CourtMember` com `npcId`/papel, sem dados etários | Ligação com canônico por ID, não por função ou nome textual |
| `public/cormyr/app.js` | campo `h.age` na visualização pública | Consumo futuro de idade canônica pública, sem expor personagens privados |

**Exemplos de conciliação:** Percival Evenhand: nascimento 1492, idade 30 em 1522 (consistente); Planchar Stonecastle: 1447/75 (consistente); Lariane Torchwinter: 1498/24 (consistente). Tomenn Staghunt aparece como nascimento 1443 e idade 64 sem corresponder ao ano de referência 1522 (79 se calculado pelo nascimento). Isso requer revisão, não ajuste automático. Idade feérica registrada no catálogo Grandragon requer exceção/nota de cronologia.

**Limite do levantamento:** a contagem de *todos os nobres vivos* e a confirmação de nascimentos, falecimentos, apelidos, parentescos e acesso a fontes privadas dependem de uma etapa de extração/reconciliação autorizada. Não importamos indiscriminadamente biografias para o banco neste lote.

## 6. Privacidade e acessos — evidência de metadados em produção

- `campaign_calendar` possui política `calendar_read` para `authenticated`, condicionada a `campaign_access_active()`.
- `campaign_calendar_audit` possui `calendar_audit_read`, restrita a `is_campaign_admin()`.
- `campaign_letters`, `letter_replies` e `campaign_records` usam respectivamente políticas `can_read_letter`, `can_read_reply` e `can_read_record`.
- `noble_house_sheets` restringe leitura a Narrador ou membro autorizado da Casa.
- `campaign_schedule_events` é acessada por RPCs para rascunhos administrativos ou snapshots publicados. Verificou-se a existência das funções, não a eficácia ponta a ponta contra todas as contas.
- `campaign_calendar` consta em `supabase_realtime`; notificações não devem conter conteúdos de cartas ou personagens. `campaign_letters`/`letter_replies` também integram a publicação; não substituir controles de RLS por filtros de UI.
- Testes de isolamento com dois usuários ativos são **pendentes** e deverão ocorrer em ambiente de testes, sem enviar correspondência real.

## 7. Mapa de consumidores por evento do Hub

| Evento futuro | Consumidor mínimo e regra |
| --- | --- |
| `campaign.date.changed` | Cabeçalhos, calendário, site público autorizado, PDFs e componentes atuais |
| `campaign.desdia.advanced` | Acompanhamento de turnos, agenda e futuras durações em désdias; não equiparar automaticamente a rodada de missivas |
| `campaign.month.changed` | Fichas nobres, obras, Sorte, custos e efeitos sazonais; impedir repetição |
| `campaign.season.changed` | `houseSeason`, restrições e bônus ativos |
| `campaign.year.changed` | Projeção de idade dos nobres canônicos vivos, genealogias, titulares e interface pública autorizada |
| `campaign.festival.crossed` | Festividades e cronologia; não duplicar dias ordinários |
| `campaign.time.reconciled` | Correção auditada e consumidores afetados; não desfazer fatos históricos automaticamente |

**Contratos reservados aos próximos lotes:** `getCampaignTime()`, `previewCampaignTimeChange()`, `advanceDesdia()`, `getCampaignAge(characterId, asOfDate)`, `registerTemporalConsumer()`. **Ainda não implementados.**

## 8. Bloqueios e encaminhamento para o Lote 2

1. Antes de qualquer DDL, inventariar as definições reais das funções e dos objetos `0041–0059`, comparando-os aos artefatos do GitHub, e registrar uma decisão de reconciliação do ledger Drizzle. Este é um **bloqueio de implantação**, não de trabalho em branch isolada.
2. Manter `campaign_calendar` como referência até a migração segura; não alterar o número de rodadas/missivas já entregues.
3. Implementar no Lote 2 motor puro de ordinal de Harptos, `advanceDesdia` de **10 dias ordinários**, testes para fronteiras mensais/anuais e festivais; nenhum teste deve abrir rodadas de produção.
4. No Lote 3, substituir defaults do presente por consulta do tempo oficial sem modificar fatos históricos.
5. Antes de ativar o envelhecimento anual (Lotes 6–7), conciliar identidades e fontes; registros incompletos permanecem «a conferir».

## 9. Entregáveis materializados

- `scripts/audit-hub-temporal-inventory.mjs`: inventário reprodutível de referências no checkout local; **somente leitura**, gera resumo ou `--json` sem despejar conteúdos das fontes.
- `scripts/audit-hub-temporal-production-readonly.sql`: checklist `SELECT` para conferir baseline e drift sem tocar nas fichas ou correspondência.
- Este relatório: resultados confirmados, riscos, arquivos afetados e próximos critérios.

### Comandos para repetir auditoria no checkout

~~~sh
node scripts/audit-hub-temporal-inventory.mjs
node scripts/audit-hub-temporal-inventory.mjs --json > /tmp/cormyr-temporal-inventory.json
~~~

**Conclusão:** auditoria inicial do Lote 1 executada com baseline de produção e mapa de dependências. Nenhuma migração nem efeito temporal foi aplicado. A conciliação completa do histórico de migrações e os testes entre identidades distintas ainda são pendências expressas, que não autorizam alegar implantação concluída do Hub.
