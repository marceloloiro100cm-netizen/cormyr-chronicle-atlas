# Área interna (/firebase-access): pendências por domínio (19/11/2026)

Levantamento das chamadas que a tela original faz e que o servidor
Firebase (`src/lib/firebase-workspace/service.ts`) ainda responde com 501.
Cada domínio tem regras e dados próprios; nenhum deve ser "ligado" com
resposta vazia ou simulada.

## Acesso (corrigido neste PR)

- A verificação de vínculos falhava quando a mesma conta tinha mais de uma
  linha em `campaign_players` (temporadas ou jogadores antigos): a consulta
  `maybeSingle` recebia duas linhas e devolvia "registro ambíguo" (503).
  Agora o servidor só considera a identidade autorizada atual.
- Quando a verificação falha, a tela mostra um **código técnico seguro**
  (por exemplo `workspace_import_pending`), sem dados privados.
- `campaign_access_active` passou a ser respondida.

## Missivas
Ver `MISSIVAS-V4-2026-11-19.md`. Restam imagens e consequências na ficha.

## Pendências de outros domínios (próximos PRs)

| Domínio | Chamadas ainda 501 | O que falta |
|---|---|---|
| Hub Temporal | `preview_campaign_time_change`, `publish_campaign_time_change` e `preview_house_time_impacts` da tela antiga, `replay/resolve_temporal_delivery`, `get_temporal_*`, idades de personagens | A abertura das semanas já é feita no HUB Firebase (veja abaixo); efeitos mensais das Casas e idades dependem do livro de recursos e das fichas |
| Jornal | `mark_newspaper_commissions_seen`, `newspaper_commission_story` (custa 1 Riqueza), `newspaper_reject_commission`, `publish_due_campaign_newspapers`, exclusões | Leitura e marcação de lida já usam o serviço editorial Cloud; encomendas dependem do livro de recursos |
| Casas e fichas | `commit_noble_house_operation`, `commit_noble_house_source`, `save_campaign_record`, `apply_drive_record`, `save_imported_source` | Livro operacional dos recursos e versões de registros |
| Galeria | `house_gallery_mail_images` | Storage privado (mesma dependência das imagens) |
| Representação do Narrador | `start/stop_campaign_representation`, `campaign_representation_action` | Sessão curta auditada no Cloud |
| Administração | `admin_save_player_account`, `claim_drive_binding`, `can_export_mail` | Operador de contas e Drive (fora do navegador) |
| Batalha | `battle_sim_commit_*` | Módulo oculto na área Firebase |

## HUB Temporal (entregue em 19/11/2026, PR seguinte)

- **Abrir a próxima semana** no `/firebase-hub`: fecha a semana atual e
  abre exatamente a próxima rodada, com data nunca anterior à atual, versão
  otimista, chave de repetição e auditoria. Atualiza os dois runtimes juntos,
  então as missivas programadas da nova semana são entregues e os envios da
  semana anterior deixam de ser editáveis.
- Virada de mês exige confirmação explícita do Narrador: os efeitos mensais
  das Casas ficam registrados como pendentes (`pendingHouseEffectMonths`)
  até existir o livro operacional de recursos.
- **Eventos do calendário**: o Narrador salva rascunhos na tela original;
  eles são publicados ao abrir a semana ou pelo botão "Publicar eventos do
  calendário sem abrir semana". Jogadores e Editor-Chefe veem os publicados
  no calendário e na **cronologia** (com as missivas entregues que podem ler).
- **Histórico** das aberturas no HUB e no calendário interno do Narrador.

## Fichas operacionais, mês e consequências (19/11/2026, decisão do proprietário)

- **Base:** as fichas importadas. O HUB tem "Ativar todas as Casas com as
  fichas importadas": cada Casa passa pelo mesmo fluxo revisado de ativação
  (transação própria, nunca sobrescreve). Se a ficha importada estiver até
  3 meses atrás do calendário, o motor original (`advance`) a traz ao mês
  oficial, com auditoria.
- **Virada de mês:** ao abrir uma semana que muda o mês, o servidor processa
  todas as Casas ativadas com o motor original (obras concluídas, mês da
  ficha atualizado), uma transação por Casa, com auditoria
  (`houseMonthlyAudits`). Falhas ficam pendentes e podem ser refeitas pelo
  botão "Processar efeitos mensais pendentes".
- **Leitura:** Conselho, ficha e missivas passam a ler a ficha operacional
  (versão própria) quando a Casa está ativada; antes disso, a importada.
- **Consequências das missivas:** aplicar e estornar gravam na ficha
  operacional, como no SQL original (perdas viram alocação, ganhos são
  bônus reversíveis), com chave de repetição, versão otimista e auditoria.
  Jogadores veem só as consequências da própria Casa em cartas que podem ler.

## Ainda pendente (motivo)

- **Encomendas de notícia (1 Riqueza):** a Redação Firebase ainda recusa
  blocos de encomenda nas edições; cobrar sem poder publicar seria injusto.
  Precisa da extensão do serviço editorial.
- **Imagens (missivas, galeria e encomendas):** armazenamento privado do
  Firebase Storage a provisionar pelo proprietário.
- **Idades de personagens, representação do Narrador, administração de
  contas e Drive:** domínios próprios, sem dependência das missivas.
