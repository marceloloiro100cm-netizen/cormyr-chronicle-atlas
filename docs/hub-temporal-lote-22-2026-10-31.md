# Hub Temporal Cormyr — Lote 22: auditoria das conexões temporais do site

**Data:** 31/10/2026 · **Base:** Lote 21, PR #147  
**Escopo:** código do site e sincronização React Query/Supabase, **sem** alterar data, recursos ou banco de produção.

## 1. Mapeamento e implementação

A investigação identificou uma fonte canônica no cliente, src/lib/calendar/campaign-time.ts, responsável por chamar o RPC \`get_campaign_calendar\` e manter a chave React Query \`['campaign-calendar']\`. Ela é consumida por:

| Área | Local | Referência |
| --- | --- | --- |
| Calendário do jogador | src/components/calendar/calendar.tsx | useCampaignTime |
| Alteração de data e preflight do Narrador | src/components/calendar/narrator-calendar.tsx | useCampaignTime, versão, prévia, publicação |
| Nobres e envelhecimento | src/components/calendar/narrator-character-ages.tsx | useCampaignTime e idade derivada |
| Missivas | src/components/players/missivas-tab.tsx | useCampaignTime, datas originais das cartas |
| Ficha e projetos da Casa | src/components/house/hub.tsx | useCampaignTime, calendarDrift, mês absoluto da ficha |
| Resumo do Reino | src/components/house/kingdom-dashboard.tsx | useCampaignTime, calendarDrift |
| Cronologia | src/components/calendar/chronology.tsx | ano/mês recebidos do calendário |
| Cabeçalho persistente | src/components/campaign-shell.tsx | useCampaignTime e canal único |
| Livro de recursos | src/components/house/fortune-panel.tsx | mês já processado da ficha da Casa: histórico, não relógio global |
| Rodadas | src/components/players/narrator-missives-hub.tsx | rodada de correspondência distinta da désdia do Reino |

A versão atual do site já diferencia **semana/rodada de missivas**, **mês absoluto processado de uma Casa** e **data oficial corrente**. Nenhuma dessas referências deve sobrescrever a data oficial.

### Correção implementada: conexão central dos caches

O novo arquivo src/lib/calendar/time-connections.ts centraliza prefixos de React Query relacionados ao calendário, missivas, nobres, Casas, outbox e pré-voo administrativo.

Em src/components/calendar/realtime.ts, o mesmo canal Supabase do calendário passa a invalidar todos esses consumidores. O Lote 22 incluiu explicitamente \`mail-page\`, \`mail-insights\`, \`mail-overview-grouped\`, \`reply-delivery\`, \`mail-options\`, versões de cartas e respostas, e o registro de personagens. Assim, uma mudança de mês ou ano feita pelo Narrador atualiza os indicadores das outras abas sem exigir um novo relógio por módulo.

### Proteção adicional: fallback por polling

Quando o canal Realtime não está disponível, \`useCampaignTime\` continua a verificar a data canônica no servidor a cada 15 segundos na aba ativa. Agora a assinatura compartilhada observa alterações na versão/data retornada pelo cache, e invalida **apenas os demais caches**. Não reinvalida a própria data durante essa observação, evitando ciclo de requisições. A assinatura é compartilhada entre usuários do mesmo QueryClient e desmonta junto com o último consumidor.

**Limite:** a atualização por polling depende de a página autenticada estar ativa, com o cabeçalho compartilhado montado e o navegador autorizado a executar a consulta. Não é um cronômetro externo nem sincroniza clientes desligados. O Realtime e o polling continuam respeitando a segurança do Supabase.

## 2. Auditoria estática de todo o código executável

scripts/temporal-site-audit.mjs lê os arquivos TypeScript/JavaScript de execução em src/ (ignora testes e fixtures) e:

- Exige a conexão das superfícies obrigatórias: calendário, Narrador, missivas, Casas, nobres, prévias de obras e matriz Realtime.
- Detecta segunda chamada ao RPC \`get_campaign_calendar\` fora do adaptador canônico e leitura direta de \`campaign_calendar\` via Supabase no frontend.
- Bloqueia atribuições evidentes do ano/data oficial a \`new Date().getFullYear()\`, a uma data do dispositivo ou a um ano fixo.
- Verifica prefixos de cache obrigatórios, registros duplicados e alterações no contrato.
- Emite possíveis datas hardcoded e usos de relógio de dispositivo como **itens para inspeção**, sem tratar automaticamente a criação de ID de rascunho por \`Date.now()\` como data de Harptos.
- Expõe \`--report\` e \`--gate\`, sem escrita ou conexão com banco. O gate bloqueia regressões canônicas, mas **não garante** que todo código futuro tenha sido semanticamente interpretado.

scripts/temporal-site-audit.test.mjs injeta cenários de fonte paralela, consulta direta, ano fixo, cache desconectado e uso legítimo de timestamps de rascunho. A auditoria de código se tornou etapa obrigatória do GitHub Actions.

## 3. Testes de propagação

O teste src/test/calendar-realtime-shared.test.tsx foi ampliado com:

1. Realtime: uma atualização em \`campaign_calendar\` invalida as chaves corretas de todas as áreas, com **um único canal** compartilhado entre cabeçalho, usuário e Narrador.
2. Fallback: perda do canal seguida da obtenção de nova versão pelo cache oficial continua invalidando cartas, Casas e idades.
3. Dados idênticos: nova leitura da **mesma** versão/data não invalida novamente.
4. Unmount: sem assinantes, o listener do cache é removido e alterações posteriores não disparam notificações antigas.

Essas verificações são testes de sincronização de **consultas**, não demonstração de execução automática de recursos. Nenhuma assinatura dispara débito, crédito, envelhecimento persistido, compra, recrutamento ou mudança de data.

## 4. Pontos de conexão para funcionalidades futuras

Ao adicionar um módulo que utilize o calendário: ler a data corrente via \`useCampaignTime\`, ou propagar a data recebida deste hook; registrar seu prefixo em \`TEMPORAL_QUERY_CONNECTIONS\`; usar o mês/ano absoluto para históricos que não devem retroceder; e manter ações econômicas ou militares sujeitas a autorização e idempotência. Não ler \`new Date()\` como data de Harptos e não confundir a rodada de correspondência com a désdia.

O registro de conexões contém identificadores e motivos (somente código público), não informações privadas de Casas ou usuários.

## 5. Pendências e limites

- A inspeção automática é **estática**: não prova todos os fluxos visuais possíveis em todas as telas nem substitui homologação com perfis autorizados. Candidatos sinalizados pelo script exigem avaliação humana; APIs que não contenham os padrões estáticos ainda podem ser identificadas em auditorias futuras.
- O catálogo de migrações continua com **69 arquivos SQL**, **42 entradas no diário Drizzle**, **27 scripts fora do diário** e prefixo histórico **0041 duplicado**.
- A migração 0066 pode reverter a correção sazonal da 0067 se reaplicada depois dela. A reconciliação e ordem continuam bloqueadas.
- A integração só pode chegar à produção após reconciliação dos registros reais, restauração de backup autorizado em isolamento, testes funcionais com dados representativos e aprovação de um operador.
- A cadeia de PRs até #147 permanece empilhada; não mesclar a variante conflitante #129.

**Decisão de implantação: NO_GO.** O Lote 22 fortalece a conexão entre módulos e o acompanhamento de futuras adições sem tocar no Supabase, na data corrente, na \`main\` ou nas fichas dos jogadores.
