# Cormyr — Release fase A do Módulo de Batalha V2 (PTE-2.0)

Data de implantação técnica: 2026-11-05.  
Commit de incorporação da V2: `394ef7afbc122d35c9d3a208de10e2085bbb1829` (PR #258).  
Escopo autorizado: laboratório de batalhas **somente Narrador**, independente da campanha.

## Ativado nesta fase
- Menu **Módulo de batalha** na área autenticada do Narrador, filtrado por `data.admin`.
- Batalhas fictícias, editor de mapa, movimentação, resolução de dano/moral, controle de IA, replay verificável e importação somente leitura de unidades reais.
- Persistência de dados táticos **somente em memória da sessão do navegador** ou exportação JSON local.
- `VITE_ENABLE_BATTLE_MODULE` é habilitado na ausência de override; `false` no ambiente do build é um kill-switch de reversão imediata após novo deploy.
- Operações oficiais de HouseState, tesouro, experiência, calendário e missivas **não são chamadas** pelo módulo.

## Continua proibido nesta fase
- Não configurar `VITE_ENABLE_BATTLE_PERSISTENCE=true` nem `ENABLE_BATTLE_PERSISTENCE=true`.
- Não executar `docs/battle/sql/0076_battle_sim_homologation.sql` em banco real.
- Não publicar o salvamento/reabertura do banco ou aplicar baixas às fichas.
- Não abrir o módulo a jogadores nem criar rota de acesso público.

## Validações que autorizam ativação fase A
- CI Validate: Vitest, TypeScript, build de produção, banco descartável PostgreSQL.
- CI Chromium sintético: desktop/viewport 390 px, toque, foco/teclado, editor 11×9/15×11, zoom e replay adulterado.
- A autorização de usuário deve continuar sendo revalidada pelo servidor nos endpoints de unidades oficiais.

## Aceite operacional pendente — fase B
- Validar acesso como Narrador e negação ao jogador/conta revogada em ambiente publicado com contas de teste.
- Validar adaptador das unidades reais sem escrita, via conta administrativa autenticada.
- Revisar inventário de migrações do Hub Temporal: `drizzle.__drizzle_migrations` deve ser reconciliado com o repositório. Não aplicar SQL experimental enquanto houver divergências.
- Backup com restauração comprovada e SQL revisado em homologação antes de habilitar persistência.
- Validar salvar, conflito de versão, idempotência e revogação no Supabase real homologado.

## Rollback
- Suspender o laboratório configurando `VITE_ENABLE_BATTLE_MODULE=false` no ambiente do build e republicando.
- Alternativamente reverter apenas o commit da fase A. A V2 permanece incorporada ao repositório, porém inacessível no menu.
- Como não há migração aplicada nem escrita em fichas, não há rollback de dados de campanha a executar.

**Fase B: NO_GO até aprovação e evidências reais.**
