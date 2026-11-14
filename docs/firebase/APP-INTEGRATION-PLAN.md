# Integração do app: inventário e plano (Fase 2, etapa 2)

Levantamento de tudo que `src/` usa do Supabase (90 arquivos, fora dos testes), para trocar módulo a módulo por serviços Firebase atrás de um adaptador.

## O que o app usa hoje
- **RPCs:** cerca de 75 funções distintas. Mais usadas: `is_campaign_admin` (44 usos), `campaign_access_active` (14), `save_campaign_record` (9), `in_campaign_house` (9).
- **Tabelas via `.from()`:** 50 tabelas. As maiores: `campaign_records`, `campaign_houses`, `campaign_players`, `house_memberships`, `noble_house_sheets`, `drive_sync_*`, `letter_*`, `house_catalog`.
- **Auth:** `signInWithPassword`, `getSession`, `getUser`, `onAuthStateChange`, `updateUser`, `signOut`, e a API de administração (`createUser`, `listUsers`, `deleteUser`, `updateUserById`).
- **Storage:** bucket `campaign-images`.
- **Realtime:** calendário (`components/calendar/realtime.ts`) e a tela de jogadores.
- **Servidor:** 24 arquivos com `createServerFn`, mais as rotas `api/*`, `mcp.ts` e o consentimento OAuth.
- **Navegador direto:** 34 arquivos de componentes e rotas chamam o Supabase direto do navegador, protegidos só por RLS.

## Consequência de arquitetura
Os serviços Firebase construídos nas fatias 1 a 6 rodam no servidor (Admin SDK) e as regras do Firestore negam o acesso direto dos clientes. Portanto toda chamada hoje feita do navegador passa a ser uma função de servidor (`createServerFn`) que valida o ID token do Firebase e chama o serviço. Leituras diretas pelo SDK de cliente só onde as regras já permitem (poucas: ficha de Casa, livro, registro por `get`).

## Adaptador proposto
`src/integrations/backend/` expõe uma interface por domínio (`access`, `houses`, `records`, `characters`, `schedule`, `time`, `mail`, `drive`, `representation`, `newspaper`, `storage`), com duas implementações: a atual (Supabase) e a nova (Firebase). Uma variável de ambiente escolhe por domínio qual usar, então dá para migrar módulo a módulo e voltar atrás (rollback) trocando uma chave. Os testes por papel rodam contra as duas implementações.

## Cobertura Firebase hoje, por domínio
| Domínio | Uso no app | Firebase |
|---|---|---|
| Acesso e perfil (`is_campaign_admin`, `campaign_access_active`, `in_campaign_house`, `current_campaign_profile`) | 70+ usos | Pronto (documentos de acesso) |
| Auth (login, sessão, administração de contas) | 40 usos | Migração de contas pronta no emulador; falta o cliente Firebase Auth |
| Casas, jogadores, vínculos, catálogo | 90 usos | Importação tipada pronta; faltam comandos de administração (`player-admin.functions`) |
| Fichas de Casa e livro | 30 usos | Pronto (fatia 1 e complementos) |
| Registros e acervo | 40 usos | Pronto (fatia 3) |
| Personagens | 8 usos | Pronto (fatia 2 e complementos) |
| Agenda e tempo | 14 usos | Pronto (fatias 3b e 4) |
| Representação e conteúdo privado | 6 usos | Pronto (fatia 5), faltam as ações de carta |
| Drive | 30 usos | Núcleo e executor de registros prontos (fatia 6); falta o adaptador real do Google e as cartas |
| Correio (cartas, respostas, rodadas, recibos, rascunhos, consequências) | 60 usos | Parcial: leitura, envio, caixa unificada e recibos no emulador; faltam rascunho semanal e agendado, edição, restauração, exclusão, ações datadas e consequências |
| Jornal (A Folha Sem Selo) | 25 usos | Só leitura arquivada; faltam edição, publicação, agendamento, encomendas e notificações |
| Espionagem (`spy_*`) | 12 usos | Nada portado |
| Batalha (`battle_*`, 17 tabelas) | 25 usos | Nada portado |
| Entregas temporais (`resolve/replay_temporal_delivery`, painéis) | 5 usos | Só importação do histórico |
| Imagens (`campaign-images`) | 6 usos | Exportação e regras de Storage prontas; falta o serviço de acesso por escopo |
| Realtime (calendário, jogadores) | 2 módulos | Trocar por listeners do Firestore (leituras permitidas) ou polling |

## Ordem proposta
1. **Base:** adaptador, cliente Firebase Auth, ponte ID token para servidor, `access`. Sem isso nada mais troca.
2. **Casas e jogadores**, depois **fichas de Casa**, **registros** e **personagens** (domínios já prontos e mais lidos).
3. **Agenda e tempo** e **representação**.
4. **Imagens** (Storage) e **Drive** com o adaptador real do Google.
5. **Correio completo** (fechar as lacunas e ligar à representação e ao Drive).
6. **Jornal**, **espionagem**, **batalha** e **entregas temporais**: precisam primeiro ser portados (SQL para núcleo e serviço no emulador, como nas fatias 1 a 6) e só então integrados.
7. **Testes por papel** em cada módulo e, no fim, reconciliação, congelamento, DNS e rollback.

## Decisões que preciso de você
- Jornal, espionagem e batalha entram na migração agora ou depois do corte (podem continuar no Supabase por um tempo)? Eles somam cerca de metade do trabalho restante.
- Adaptador por domínio com variável de ambiente (recomendado) ou corte único de tudo de uma vez.
