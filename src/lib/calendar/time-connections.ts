/**
 * Lote 22 — pontos de conexão do calendário oficial.
 *
 * Uma única invalidação de "campaign_calendar" atualiza as projeções
 * derivadas; NÃO é um evento de cobrança, recálculo persistido ou envio.
 *
 * Prefixos batem com useQuery queryKey do consumidor; listas derivadas
 * (mês, casa, jogador) são invalidadas pelo prefixo, sem inventar data.
 */
export const TEMPORAL_QUERY_CONNECTIONS=[
 {domain:'calendar',prefix:'campaign-calendar',reason:'RPC canônico do relógio'},
 {domain:'calendar',prefix:'calendar-schedule-events',reason:'eventos publicados do mês'},
 {domain:'calendar',prefix:'campaign-schedule-drafts',reason:'eventos em revisão'},
 {domain:'calendar',prefix:'campaign-time-history',reason:'histórico da data oficial'},
 {domain:'chronology',prefix:'campaign-chronology',reason:'linha do tempo vinculada ao mês'},
 {domain:'missives',prefix:'calendar-events',reason:'missivas visíveis no calendário'},
 {domain:'missives',prefix:'campaign-panel',reason:'Conselho de jogadores, mensagens, rodadas e avisos'},
 {domain:'missives',prefix:'mail-page',reason:'páginas de missivas e seus estados'},
 {domain:'missives',prefix:'mail-insights',reason:'indicadores da correspondência'},
 {domain:'missives',prefix:'mail-overview-grouped',reason:'resumo da central do Narrador'},
 {domain:'missives',prefix:'reply-delivery',reason:'entrega de respostas em rodada'},
 {domain:'missives',prefix:'mail-options',reason:'opções de envio dependentes da rodada'},
 {domain:'missives',prefix:'letter-versions',reason:'versões de cartas quando exibidas'},
 {domain:'missives',prefix:'reply-versions',reason:'versões de respostas históricas'},
 {domain:'houses',prefix:'noble-house',reason:'ficha mensal e estado da Casa'},
 {domain:'houses',prefix:'house-realm-dashboard',reason:'resumo do Reino e divergências'},
 {domain:'houses',prefix:'house-time-impact',reason:'prévia de obras e posses'},
 {domain:'consumers',prefix:'temporal-consumer-dashboard',reason:'entregas e revisões'},
 {domain:'consumers',prefix:'temporal-release-preflight',reason:'pré-voo do Narrador'},
 {domain:'nobles',prefix:'house-character-ages',reason:'idades derivadas por Casa'},
 {domain:'nobles',prefix:'character-age-dashboard',reason:'mudanças de idade por ano'},
 {domain:'nobles',prefix:'character-age-impact',reason:'prévia de envelhecimento'},
 {domain:'nobles',prefix:'character-year-transitions',reason:'transições históricas'},
 {domain:'nobles',prefix:'noble-character-registry',reason:'nobres e fontes confirmadas'},
 // O gatilho SQL atualiza as operações com o avanço oficial; estas chaves
 // garantem que a interface aberta reflita a nova etapa imediatamente.
 {domain:'espionage',prefix:'spy-house-management',reason:'estado do agente após atualização do HUB'},
 {domain:'espionage',prefix:'espionage-regional-strategy',reason:'posição atual e viagens válidas'},
 {domain:'espionage',prefix:'spy-narrator-operations',reason:'operações prontas para homologação'},
 {domain:'espionage',prefix:'spy-dossiers',reason:'data oficial de atualização do dossiê'},
 {domain:'espionage',prefix:'spy-mission-odds',reason:'prévia da missão com calendário atualizado'},
] as const;

export const TEMPORAL_QUERY_PREFIXES=TEMPORAL_QUERY_CONNECTIONS.map(x=>x.prefix);

/** Não oferece escrita nem dispara mutações em nenhum consumidor. */
export function temporalQueryKeysForInvalidation():readonly (readonly string[])[]{
 return TEMPORAL_QUERY_PREFIXES.map(prefix=>[prefix] as const);
}
