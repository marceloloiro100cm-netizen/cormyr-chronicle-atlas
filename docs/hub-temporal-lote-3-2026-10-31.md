# Hub Temporal de Cormyr — Lote 3: Fonte única de tempo

**Data:** 31/10/2026  
**Pré-requisito de código:** Lote 2 / motor de Harptos do PR #127.  
**Escopo:** unificar a **leitura** do tempo oficial em interfaces autenticadas e preparar o contrato das próximas integrações. Não altera a publicação nem avança uma désdia.

## O que passa a ser fonte oficial

O estado já existente em `public.campaign_calendar`, lido pelo RPC autenticado `get_campaign_calendar`, permanece o **único relógio da campanha**. A biblioteca `src/lib/calendar/campaign-time.ts` expõe:

- `CAMPAIGN_TIME_QUERY_KEY = ['campaign-calendar']`: mesma chave para todos os consumidores React Query.
- `getCampaignTime()`: leitura autorizada do RPC existente, com validação do formato e da data Harptos.
- `useCampaignTime()`: hook com atualização por invalidação Realtime e polling de segurança de 15 segundos.
- `validateCampaignTimeSnapshot()`: recusa respostas ausentes, festivais incoerentes, anos inválidos e estados corrompidos; **sem inventar um ano corrente**.
- `campaignTimeView()`: projeção da mesma data para dia, mês, ano, désdia, estação e rótulos legíveis.
- `useCampaignYear()`: projeção do ano, **sem criar outra consulta ou relógio**.

A leitura do backend para inicializar novas fichas permanece feita pelo RPC sob o contexto autorizado existente. Em falha de RPC, **não** usa um mês de 1522 como substituto.

## Consumidores conectados neste lote

| Superfície | Ajuste |
|---|---|
| Calendário dos jogadores | `useCampaignTime()` e remoção do estado inicial `1522`; o relógio precisa carregar antes de exibir uma data oficial |
| Calendário do Narrador | usa a mesma consulta para carregar a versão que será publicada; mantém o fluxo de edição/persistência existente |
| Cabeçalho da área autenticada | substitui `Crônicas do Reino · 1522 CV` pelo ano publicado (ou indisponível enquanto necessário) |
| Ficha gerencial das Casas | substitui consulta local; cabeçalho mostra o presente oficial, enquanto projetos e ledger conservam meses históricos |
| Painel consolidado do Reino | substitui consulta local; mantém verificação do mês histórico das Casas |
| Missivas do Narrador | remove consulta paralela direta à tabela e utiliza o mesmo snapshot; os anos de documentos e entregas não são reescritos |
| Datas de resposta, composição e edição de missiva | usam o presente oficial **apenas como referência de navegação**; não preenchimento automático da data histórica |
| Representação administrativa | seletor também é referenciado ao ano oficial sem substituir datas de documentos |
| Criação de novas fichas de Casa | remove o default corrente `1522 × 12`; mês temporário zero sinaliza rascunho **não inicializado** e o servidor exige a data oficial antes de gravar |
| Supabase Realtime | o cabeçalho autenticado recebe invalidações do relógio mesmo quando a aba Calendário está fechada; mantém fallback de 15 s |

## Compatibilidade e segurança

1. Não foram executadas migrações, escritas em tabelas, operações do Narrador ou avanços de désdia.
2. O serviço de tempo usa o RPC existente; **não** amplia o acesso de usuários anônimos e não transporta dados de missivas ou NPCs.
3. A numeração `published_week` continua sendo usada como legado pela edição do Narrador; a **désdia** é derivada apenas da data Harptos. O Lote 4 fará a publicação com avanços coerentes; Lote 8 separará a abertura de missivas do relógio.
4. Datas de fundações, nascimento, batalhas e registros históricos continuam sendo dados históricos imutáveis.
5. `state.month` das Casas antigas continua como snapshot para cálculo e auditoria. O presente mostrado no cabeçalho deriva do relógio; operações mensais ainda são protegidas por `requireCalendarAlignment`.
6. No seletor de data, se o documento não tiver data e o relógio não estiver disponível, o ano permanece vazio até ser informado; não voltar silenciosamente ao início da campanha.

## Superfície pública estática: fronteira de autorização

O acervo em `public/cormyr/` funciona sem autenticação, enquanto a política atual de `campaign_calendar` exige usuário de campanha ativo. Não criar um endpoint anônimo neste lote que divulgue dados privados. A **projeção pública mínima, separada e deliberadamente autorizada**, além da integração completa do arquivo estático com o ano corrente, é responsabilidade do **Lote 5**. Até então, textos como «antes/depois de 1522» continuam históricos, e referências editadas no React autenticado não implicam que o catálogo estático tenha sido atualizado.

O mesmo cuidado vale para exports e documentos previamente gerados: estes carregam dados de um período histórico/snapshot; mudança em massa deve ser implementada no Lote 9 com metadados `asOfDate`.

## Testes

`src/test/campaign-time-source.test.tsx` cobre validação da resposta, deduplicação de consultas para dois consumidores simultâneos, atualização automática do ano ao invalidar a chave, falha sem fallback de 1522 e navegação de documentos sem atribuir uma data não confirmada.

**Critério de avanço ao Lote 4:** o motor puro do Lote 2 e o contrato de leitura deste lote passam pela CI; o próximo lote deverá centralizar também a **escrita** do relógio, hoje distribuída entre publicação do Narrador e gatilho de rodadas.
