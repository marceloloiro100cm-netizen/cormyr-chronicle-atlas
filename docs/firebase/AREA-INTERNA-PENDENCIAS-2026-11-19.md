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
| Hub Temporal | `get_campaign_chronology`, `get_campaign_time_history`, `get_campaign_schedule_*`, `save_campaign_schedule_event`, `preview_*`, `publish_campaign_time_change`, `replay/resolve_temporal_delivery`, `get_temporal_*`, idades de personagens | Ligar ao calendário operacional (`/firebase-hub`) já existente |
| Jornal (leitura do jogador) | `mark_campaign_newspaper_read/unread`, `mark_newspaper_commissions_seen`, `newspaper_commission_story`, `newspaper_reject_commission`, `publish_due_campaign_newspapers`, exclusões | Reaproveitar o serviço editorial Cloud |
| Casas e fichas | `commit_noble_house_operation`, `commit_noble_house_source`, `save_campaign_record`, `apply_drive_record`, `save_imported_source` | Livro operacional dos recursos e versões de registros |
| Galeria | `house_gallery_mail_images` | Storage privado (mesma dependência das imagens) |
| Representação do Narrador | `start/stop_campaign_representation`, `campaign_representation_action` | Sessão curta auditada no Cloud |
| Administração | `admin_save_player_account`, `claim_drive_binding`, `can_export_mail` | Operador de contas e Drive (fora do navegador) |
| Batalha | `battle_sim_commit_*` | Módulo oculto na área Firebase |
