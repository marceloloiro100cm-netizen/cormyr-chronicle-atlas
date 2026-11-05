# Liberação controlada de persistência — Cormyr Battle PTE-2.0
Data: 2026-11-05

## Escopo aprovado pelo usuário
**Disponibilizar ao Narrador** as opções de **salvar cópias de batalhas e consultar/reproduzir/exportar replays SHA-256** em produção. Não é conclusão da retomada editável de sessões existentes; a UI de Batalhas salvas permanece leitura/consulta, e IA pode atuar nas batalhas em memória antes do salvamento.

## Pré-liberação conferida em produção
- Cluster de produção do Lovable ID interno verificado, com tabelas `public.battle_sim_sessions`, `public.battle_sim_events` e `public.battle_sim_scenarios` **já existentes** e vazias. A instalação já estava presente na data de autorização; nenhuma reaplicação SQL foi necessária.
- As políticas RLS e as duas funções `battle_sim_commit_*` possuem definições equivalentes às do banco de homologação.
- Anônimos sem SELECT; `authenticated` sem INSERT/UPDATE direto e sem EXECUTE nas RPCs técnicas; `service_role` com as permissões previstas.
- **Teste transacional em produção APROVADO** com role do Narrador e claim simulada no PostgreSQL, criação de sessão+evento via service_role, SELECT do Narrador e negação de jogador. O teste terminou com ROLLBACK e contagens de sessões/eventos = 0. O primeiro teste foi abortado por uma consulta incorreta ao role do administrador sob RLS; corrigido e repetido com êxito.
- CI anterior aprovou motor TypeScript, Replay/SHA-256, navegador sintético, CAS com duas conexões, RLS e restore drill PostgreSQL isolado. [CI #42096543452](https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas/actions/runs/42096543452).

## Mudança nesta release
- UI: `BATTLE_PERSISTENCE_UI_ENABLED` ligada na ausência de `VITE_ENABLE_BATTLE_PERSISTENCE=false` (kill-switch de **build**).
- Servidor: `requirePersistenceEnabled` ligada na ausência de `ENABLE_BATTLE_PERSISTENCE=false` (kill-switch de **runtime**), mas ainda exige **JWT válido, is_campaign_admin() e campaign_access_active()** e valida Replay, snapshot de origem e hash antes de escrita.
- Nenhuma migração nova, nenhuma alteração em `HouseState`, unidades oficiais, recursos ou Hub Temporal.
- As operações SQL são confinadas às tabelas de simulação. O replay é verificado tanto no servidor antes de salvar quanto ao ler.

## Limitações e riscos remanescentes
- **Não foi possível executar E2E com JWT real de teste na aplicação publicada**, pois a ferramenta Lovable informou falta de créditos; a simulação SQL de claims não substitui E2E da aplicação. A existência do banco e o CI são evidência, mas não prova de uso de produção.
- O visualizador de batalha salva é somente leitura. Não há retomada editável/continuação compartilhada pela interface.
- A migração ainda não está no ledger Drizzle, por projeto; reconciliar o histórico antes de qualquer outra migração.
- O restore drill cobriu backup de PostgreSQL descartável, **não backup real do Supabase de produção**. Não afirmar conclusão de recuperação de desastre de produção.

## Suspensão imediata / rollback
1. Preferência: configurar `ENABLE_BATTLE_PERSISTENCE=false` no runtime e `VITE_ENABLE_BATTLE_PERSISTENCE=false` no build e publicar novamente. Não aplicar DROP ao banco real.
2. Alternativa: reverter **somente o commit desta liberação**, restaurando a exigência de flags true; republicar.
3. Preservar as tabelas `battle_sim_*`, inclusive as cópias do Narrador eventualmente salvas. Não executar backout destrutivo enquanto houver dados.

## Critérios pós-publicação
- Confirmar versão publicada pelo Lovable (não confundir sync do código ou status `pending` com deploy concluído).
- Validar com conta real autorizada, de forma não destrutiva: abrir Batalhas salvas, salvar replay fictício, reabrir, exportar; repetir como jogador e verificar negação; revogar narrador e verificar novas operações negadas.
- Até obter evidência desses itens, **liberação técnica integrada/solicitada** não equivale a aceite operacional integral.
