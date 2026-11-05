# Relatório de execução — CCA-BATTLE-V2, lotes 8–11

**Status:** código em PR #258, `feat/battle-v2-lots-0-3`, ainda não mesclado.  
**Perfil:** PTE-2.0 **experimental**, não canônico.  
**Escopo:** área autenticada do Narrador. Nenhuma escrita em fichas oficiais.

## Lote 8 — IA e replay
- `src/lib/battle/domain/ai.ts`: heurística sem sorteio, usa `getLegalActions` e reducer existentes; escolhe ataques e aproximação legal, bloqueia WAIT e impõe guardas contra loops.
- `src/lib/battle/domain/replay.ts`: SHA-256 via `@noble/hashes`, serialização canônica, cadeias `initialStateHash / prevHash / stateHash` e verificação de cada comando. Arquivos alterados são rejeitados.
- `BattleReplay.tsx`: linha de tempo, exportação/importação e reconstituição validada. `BattleSetup` permite Narrador/IA para cada lado.
- `Undo` continua local e forma ramo novo ao exportar apenas ações remanescentes.
- Aceite: 20 cenários variados em Vitest com replay e hash idênticos; CI avalia.

## Lote 9 — Adaptador de origem
- `adapters/unit-readonly.ts` usa `unitStats` e `unitMilitaryBonuses` sem reproduzir as regras de ficha.
- `adapters/readonly-source.functions.ts`: leitura com `requireSupabaseAuth`, `is_campaign_admin` e `campaign_access_active` antes **e após** consulta; JSON do cliente traz somente IDs/decisão, nunca HouseState.
- Bloqueios: naval, destruída, efetivo 0, tipo não pertencente à origem, mistos sem justificativa e fonte repetida em um cenário.
- Ficha oficial com saúde parcial gera alerta; PV táticos começam cheios. Bônus de dano do livro permanecem **não mapeados**, sem dupla aplicação de defesa/armadura.
- `BattleSourcePicker` mostra lista mínima de unidades e adiciona cópias somente leitura. Não substitui/edita dados da casa.

## Lote 10 — Persistência isolada, preparada sem deploy
- SQL **candidato**, não publicado e fora de `drizzle/migrations`: `docs/battle/sql/0076_battle_sim_homologation.sql`.
- Tabelas: `battle_sim_sessions`, `battle_sim_events`, `battle_sim_scenarios`; todas com RLS. Sem escrita direta de usuários e RPCs reservados a `service_role`.
- Serviço servidor revalida perfil/Replay e origens reais, acessa role corrente, usa chave técnica **apenas** no servidor; cria snapshot e aplica comando com CAS/UUID idempotente.
- Flags em duas camadas: `VITE_ENABLE_BATTLE_PERSISTENCE=true` na UI e `ENABLE_BATTLE_PERSISTENCE=true` no servidor. O padrão é desligado. Ativar só **após** aplicar em banco homologado e provar RLS.
- `BattleSavedPanel` lista e consulta com replay verificado. Em progresso, o laboratório pode propor salvamento quando flags forem habilitadas; a leitura continua restrita ao Narrador. A retomada editável de uma sessão compartilhada e comandos automáticos persistidos por IA precisam de aceite E2E próprio antes da publicação.
- Nenhuma migração foi aplicada em Supabase de produção ou homologação existente.

## Lote 11 — QA / hardening
- Testes Vitest de invariantes, IA, origem, replay e bloqueios estáticos no código, além de casos B-001..B-040 já cobertos por suítes anteriores.
- Job isolado `battle-database` em GitHub Actions com PostgreSQL 16 descartável; aplica o SQL **apenas no container do CI**, com bootstrap sem dados privados, verifica RLS para anon/jogador/narrador/revogado, atomicidade, idempotência e rollback.
- `bun run test`, `bunx tsc --noEmit`, `bun run build` no workflow Validate.
- E2E em browser real/mobile e UX touch/zoom não estão automaticamente comprovados por Vitest; exigem ambiente de homologação e evidência antes de aprovação do release.

## Checklist bloqueante de liberação

- [ ] Rever migrações já aplicadas e registrar inventário do banco de homologação e backup restaurável. **NO_GO temporário do Hub Temporal** não pode ser ignorado.
- [ ] Homologar SQL por DBA com o histórico Drizzle e revisar privilégios de função/roles do Supabase real.
- [ ] Executar CI `battle-database` em container PostgreSQL e apresentar logs, além dos checks gerais.
- [ ] Validar JWT de jogador, narrador e narrador revogado com contas de teste reais na homologação.
- [ ] Executar E2E Playwright/browser móvel com 11×9 e 15×11, teclado, toque, replay adulterado, salvar/reabrir e mudança de acesso.
- [ ] Verificar leitura de casas reais autorizadas sem expor estado completo ao navegador.
- [ ] Auditar `BattleBoard` em touch: scrolling/pinch/teclado e foco visível nos tokens.
- [ ] Ativar flags **somente** na homologação; nunca habilitar persistência sem migração.
- [ ] Revisar PR, aprovar merge e depois publicação Lovable em etapas separadas.

**GO/NO_GO do momento:** `NO_GO` para banco real e produção até os itens acima. Aprovação automática do CI não equivale a evidência de testes browser/DB existente.

## Como verificar em homologação (após aprovação)
1. Fazer snapshot/backup e inventário de migrações do banco alvo.
2. Executar o SQL candidato e os scripts de verificação em banco descartável, conferir esquema e RLS.
3. Habilitar as duas flags de persistência no ambiente isolado; usar contas de teste do Narrador.
4. Criar batalha A vs IA, executar até desfecho, exportar e importar replay; confirmar hashes.
5. Criar unidade read-only com `strength=100`, `casualties=17`, checar 83 iniciais e nenhuma alteração na ficha.
6. Testar gravação duplicada de comando, conflito entre abas, rollback induzido e revogação de privilégios.
7. Caso qualquer checagem falhe: deixar ambas as flags desligadas e não mesclar.
