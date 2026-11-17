# Mapa das dependências do Supabase no código (17/11/2026)

Levantamento feito por análise de importações a partir das rotas públicas ativas (`/`, `/auth`, `/reset-password`, `/firebase-access`, `/firebase-homolog`, `/api/*`) e da área antiga `/jogadores` (`src/routes/_authenticated`). Conta apenas uso real (importação de `@/integrations/supabase/*`, `@supabase/supabase-js` ou chamadas `supabase.from/rpc/auth/storage/channel`), não menções em comentários.

| Grupo | Arquivos | Situação |
|---|---|---|
| Alcançados pelas rotas ativas | 5 | Importados, mas não executam no modo arquivo (ver abaixo) |
| Só usados pela área antiga `/jogadores` | 63 | `/jogadores` redireciona para `/firebase-access`; código morto em produção |
| Fora das rotas (nenhuma rota alcança) | 10 | 4 sem nenhuma referência; 6 ainda citados por código antigo ou testes |
| Testes | 41 | Cobrem o código antigo; saem junto com ele |

## 1. Alcançados pelas rotas ativas

O build das páginas públicas ainda inclui o cliente Supabase, por estas cadeias:

- `__root.tsx` importa o cliente de forma preguiçosa (`import()`), só se o modo arquivo for desligado;
- `__root.tsx` > `lib/auth/session-boundary.ts` > `lib/mail/draft-cache.ts` > `components/campaign-content.tsx` > `integrations/supabase/client.ts`;
- `auth.tsx` > `components/campaign-shell.tsx` > `components/calendar/realtime.ts` e `lib/calendar/campaign-time.ts` (usados só pelo relógio privado; as páginas públicas usam `PublicClock`).

O cliente é um Proxy que só cria a conexão quando usado, então nenhuma chamada sai para o Supabase nessas páginas. Para tirar o Supabase do bundle público basta separar `draft-cache` de `campaign-content` e mover `PrivateClock` para um arquivo próprio.

- `src/components/calendar/realtime.ts`
- `src/components/campaign-content.tsx`
- `src/integrations/supabase/client.ts`
- `src/lib/calendar/campaign-time.ts`
- `src/routes/__root.tsx`

## 2. Área antiga `/jogadores`, por domínio

Cada domínio só pode ser apagado quando a tela equivalente no Firebase cobrir o que os jogadores e o Narrador usam.

### Calendário e Hub Temporal (3)

Substituto no Firebase: `FirebaseCalendarSnapshot` e `firebase-calendar-polling` (leitura); `time-service` em emulador.

- `src/components/calendar/calendar.tsx`
- `src/components/calendar/narrator-calendar.tsx`
- `src/components/calendar/temporal-consumer-hub.tsx`

### Casas, fichas e vassalos (15)

Substituto no Firebase: `FirebaseHouseSheet` e demais `src/components/houses/Firebase*` (leitura); `noble-house-service` em emulador (gravação).

- `src/components/calendar/narrator-character-ages.tsx`
- `src/components/character-v2/coin-wallet.tsx`
- `src/components/house/character-editor.tsx`
- `src/components/house/drive-status.tsx`
- `src/components/house/gm-notes.tsx`
- `src/components/house/kingdom-dashboard.tsx`
- `src/components/house/source-comparison.tsx`
- `src/components/house/vassal-sheet-preview.tsx`
- `src/components/npc-hub.tsx`
- `src/lib/espionage/spy-house-targets.functions.ts`
- `src/lib/house/drive-export.server.ts`
- `src/lib/house/drive.functions.ts`
- `src/lib/house/house.functions.ts`
- `src/lib/house/source-link.functions.ts`
- `src/lib/house/vassal-workbook.functions.ts`

### Jogadores, acesso e administração (16)

Substituto no Firebase: login Firebase em `/auth` e `/firebase-access`; painel do Narrador sem equivalente completo.

- `src/components/player-representation.tsx`
- `src/components/players/admin-panel.tsx`
- `src/components/players/ficha-tab.tsx`
- `src/components/players/gallery-tab.tsx`
- `src/components/players/panel-data.ts`
- `src/components/players/records.tsx`
- `src/components/players/shared.ts`
- `src/integrations/supabase/auth-middleware.ts`
- `src/integrations/supabase/client.server.ts`
- `src/lib/auth/campaign-access-scope.ts`
- `src/lib/campaign.functions.ts`
- `src/lib/player-admin.functions.ts`
- `src/lib/player-sync.functions.ts`
- `src/routes/_authenticated/diagnostico.tsx`
- `src/routes/_authenticated/jogadores.tsx`
- `src/routes/_authenticated/route.tsx`

### Missivas (6)

Substituto no Firebase: `/api/firebase-cloud-mail` (leitura e envio, depende de `campaignMailRuntime`).

- `src/components/players/letter-consequences.tsx`
- `src/components/players/mail-compose.tsx`
- `src/components/players/missivas-tab.tsx`
- `src/components/players/narrator-mail-notes.tsx`
- `src/components/players/narrator-missives-hub.tsx`
- `src/lib/calendar/mail.ts`

### Google Drive e Storage (6)

Substituto no Firebase: `firebase-cloud-drive-job` e resolvedores de Storage (emulador).

- `src/lib/archive-update.server.ts`
- `src/lib/drive-adapter.server.ts`
- `src/lib/drive-executor.server.ts`
- `src/lib/drive-library.server.ts`
- `src/lib/drive-organization.server.ts`
- `src/lib/storage-export.functions.ts`

### Batalha (4)

Substituto no Firebase: ação `listHouseBattles` em `/api/firebase-cloud-read` (leitura); serviço de batalha em emulador.

- `src/lib/battle/adapters/readonly-source.functions.ts`
- `src/lib/battle/battle-session.functions.ts`
- `src/lib/battle/v3/invitations.functions.ts`
- `src/lib/battle/v3/live.functions.ts`

### Cruzada (D&D) (5)

Substituto no Firebase: sem equivalente Firebase ainda.

- `src/lib/crusade/dnd-cormyr-private-loader.ts`
- `src/lib/crusade/dnd-private-custom.ts`
- `src/lib/crusade/dnd-private-overrides.ts`
- `src/lib/crusade/dnd-private-sessions.ts`
- `src/lib/crusade/dnd-verified-sources.ts`

### Espionagem (7)

Substituto no Firebase: ações `listSpyAgents` e `listSpyDossiers` em `/api/firebase-cloud-read` (leitura).

- `src/lib/espionage/spy-agent-actions.functions.ts`
- `src/lib/espionage/spy-browser-client.ts`
- `src/lib/espionage/spy-dossier.functions.ts`
- `src/lib/espionage/spy-management.functions.ts`
- `src/lib/espionage/spy-operations-browser.ts`
- `src/lib/espionage/spy-recruitment.functions.ts`
- `src/lib/espionage/spy-target-browser.ts`

### Jornal (1)

Substituto no Firebase: `FirebaseNewspaperReader` e `/api/firebase-cloud-newspaper`.

- `src/lib/newspaper/data.ts`

## 3. Fora das rotas

Nenhuma rota alcança estes arquivos, mas uma conferência posterior (17/11, 19h) mostrou que nem todos são órfãos de verdade.

**Sem nenhuma referência no código, nos testes ou nos workflows** (removidos neste PR):

- `src/components/calendar/narrator-character-registry.tsx`
- `src/components/drive-sync-admin.tsx`
- `src/integrations/supabase/auth-attacher.ts`
- `src/lib/espionage/region-turns.functions.ts`

**Ainda importados por componentes antigos de `/jogadores` ou lidos por testes** (sair junto com a área antiga, não antes):

- `src/components/calendar/chronology.tsx` (missivas, calendário e 6 testes)
- `src/lib/character-v2/migration.functions.ts` (`narrator-review.tsx`)
- `src/lib/espionage/region-review.functions.ts` (painel de rotas e teste)
- `src/lib/espionage/spy-mission-preview.functions.ts` (teste de probabilidade)
- `src/lib/espionage/spy-narrator-house-defense.functions.ts` (painel de defesa e teste)
- `src/lib/espionage/spy-target-defense.functions.ts` (prévia de defesa e teste)

Observação: o Lote 5 (`scripts/firebase/lot5-safety-preflight.mjs`) só verifica que `src/start.ts` não registra `attachSupabaseAuth`; a remoção do arquivo não afeta essa verificação.

## Ordem sugerida de remoção

1. Os 4 arquivos sem referência (seção 3).
2. Tirar o Supabase do bundle público (seção 1).
3. Depois que o piloto de leitura estiver no ar e aceito, apagar `/jogadores` inteiro e os domínios da seção 2 que já têm substituto de leitura.
4. Por último, `src/integrations/supabase/`, a dependência `@supabase/supabase-js` e os testes associados, junto com o desligamento do projeto Supabase.
