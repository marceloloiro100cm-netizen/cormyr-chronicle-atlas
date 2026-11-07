# Auditoria completa — Módulo de batalha Cormyr
**ID:** CCA-BATTLE-AUDIT-2026-11-07  
**Baseline do repositório (produção conectada, antes da intervenção):** `main` `32130b8ab499494f3fa1b53fbb4d187fd45aa5fe`  
**PR de correções não publicadas:** [#320](https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas/pull/320)  
**Documento de referência:** `CCA_MODULO_BATALHA_V2_IMPLEMENTACAO.md`, versão CCA-BATTLE-V2-2026-11-05, derivado do documento `Especificações.md`.  

## 1. Sumário executivo

O módulo está funcionalmente avançado, mas a experiência se afastou da proposta de um **simulador tático único, simples, apartado e exclusivo do Narrador**.

A primeira ação de quem entra no módulo deveria ser **preparar uma batalha**, não escolher qual dos quatro produtos/variantes precisa utilizar. A especificação prevê **uma jornada de preparação → implantação → batalha → resultado/replay**, com ferramentas especializadas nos momentos apropriados.

**Achado predominante:** fragmentação de UX, não ausência de motores. A produção reúne:
- **PTE-2.0**: simulador detalhado com editor de mapa, 16 tipos terrestres, controle de unidades e resultado;
- **Cruzada V3 / PTE-3.0-SANDBOX**: exércitos-modelo, comandantes, poderes, IA e replay local;
- **CRZ**: regras e replays próprios, variantes de dano e progressão local do General;
- **Mapa estratégico/cercos**: exercício por dia e custos abstratos, fora do MVP original.

**Decisão recomendada:** não mesclar regras matemáticas diferentes. Unificar a entrada, a navegação, a terminologia, a acessibilidade e progressivamente o catálogo de sessões; preservar os motores independentes com hashes/versionamento.

## 2. Fontes e escopo efetivamente inspecionados

- Especificação V2 `CCA-BATTLE-V2-2026-11-05`, incluindo objetivos, telas A–E, exclusões, definições de pronto e matriz B-001 a B-040;
- `AGENTS.md`, `README.md`, `package.json`, `src/routes/_authenticated/jogadores.tsx`, `src/lib/battle/feature-flag.ts`;
- Componentes `BattleNarratorHub`, `BattleSetup`, `BattleArena`, `BattleV3NarratorEntry`, `BattleV3Game`, `BattleBoard`, `BattleMapEditor`, `BattleSourcePicker`, `BattleAccessCheck`, `BattleCommanderPortrait` e `BattleStrategicLab`;
- `src/lib/battle/v3/commanders.ts`, `invitations.functions.ts`, `live.functions.ts`, `battle-session.functions.ts`;
- Contratos de testes e fixtures `src/test/battle-*`, workflows de validação e testes de navegador sintético;
- Metadados do projeto Lovable `bdc007de-2bdf-4e28-8df8-b09ce46f884c`.

**Limites:** revisão do código e execução dos checks de PR no GitHub. Não foram usados login real de Narrador e jogador em produção, consulta à RLS efetivamente implantada em Supabase, testes reais com dispositivos físicos, auditoria de memória com profiling ou operação destrutiva. CI sintético não é E2E de autorização real. O campo `latest_commit_sha` do editor não certifica, sozinho, a revisão binária efetivamente publicada.

## 3. Matriz de achados com severidade, evidência e tratamento

| ID | Área | Severidade | Achado verificado | Tratamento |
|---|---|---|---|---|
| A-01 | UX/hub | **Alta** | O início exibia várias ações equivalentes: Batalhar, Criar batalha, CRZ, cerco, importar, regra, diagnóstico, convites e persistência; ordem contraintuitiva. `BattleNarratorHub.tsx` | **Corrigido na PR #320:** PTE como entrada principal, V3 rápida secundária, salvas e ferramentas avançadas recolhíveis. |
| A-02 | Preparação | **Alta** | Cinco formulários detalhados sequenciais mesmo para simular somente dois exércitos-modelo. `BattleSetup.tsx` | **Corrigido na PR #320:** início rápido com nome, cenário, controle IA/manual, posicionamento legal automático; todas as cinco etapas detalhadas preservadas. |
| A-03 | Interface V3 | **Alta** | Consulta de tropa oficial aparecia **depois** da configuração/jogo V3 e montava consultas antes de o usuário solicitá-las. `BattleV3NarratorEntry.tsx` | **Corrigido na PR #320:** importação opcional vem antes da preparação e só monta o seletor quando aberto. |
| A-04 | Clareza da composição | **Alta** | A V3 exibia o roster da casa-modelo mesmo quando era substituído por tropas copiadas. `BattleV3Game.tsx` | **Corrigido na PR #320:** mostrar unidades efetivamente copiadas e desabilitar seletor de modelo substituído. |
| A-05 | Teclado | **Alta** | Até 99/165 hexágonos colocados na sequência de Tab por tabuleiro; operação cansativa. `BattleBoard.tsx` | **Corrigido na PR #320:** único tab stop, setas entre hexágonos, Enter/Espaço ativam, ajuda textual, preservando clique e toque. |
| A-06 | Acesso do jogador | **Crítica** | A aba de jogador está suprimida pelo `BATTLE_PLAYERS_ENABLED=false` e pelo gate do Narrador; entretanto as funções de convite ainda existiam sem um kill switch próprio de servidor. `feature-flag.ts`, `invitations.functions.ts` | **Mitigado na PR #320:** chamadas via funções do servidor recusadas por padrão, exigindo `ENABLE_BATTLE_INVITATIONS=true` para reabilitar. **RLS de acesso direto ao Supabase continua dependendo da política implantada; não afirmar isolamento total de API sem auditoria real do banco.** |
| A-07 | Autorização | **Alta** | RLS/sessões verificadas em testes de banco descartável; aceite JWT multi-identidade na publicação real ainda não comprovado. | **Pendente:** teste narrador, jogador, usuário de outra casa, revogação e tentativa de escrita direta. |
| A-08 | Persistência | **Alta** | PTE oferece `Batalhas salvas` somente após confirmação do servidor; V3 usa replay de arquivo local; CRZ tem outra serialização. | **Pendente:** unificação do catálogo de sessões por adaptadores, sem reinterpretar regras antigas. Não prometer persistência se o servidor estiver indisponível. |
| A-09 | Arquitetura | **Alta** | Coexistem PTE, V3, CRZ e cerco como experiências separadas, com informações visuais e regras parcialmente diferentes. | **Mitigação UX agora.** Unificar navegação e contratos de sessão posteriormente; não combinar motores de combate incompatíveis. |
| A-10 | Prontidão das regras | **Média** | PTE possui legalidade tática, IA, relatório e replay com testes de domínio; referências experimentais continuam não canônicas. | Manter `PTE-2.0 (experimental)` e as golden fixtures B-001–B-040. |
| A-11 | Batalhas com duas casas | **Alta** | Multiplayer V3 usa backend isolado e kill switch `BATTLE_NARRATOR_ONLY_RELEASE=true`; não há aceite real de duas sessões de jogadores. | Manter oculto/desabilitado. Não aplicar a migração 0078 nem reativar variáveis nesta auditoria. |
| A-12 | Dados oficiais | **Crítica** | Adaptadores de origem são de leitura e as baixas da simulação não devem chegar à ficha; serviços de persistência revalidam origem e role. | Invariante preservada; não foram implementadas escritas de `HouseState`, sobreviventes, economia, XP militar ou calendário. |
| A-13 | Experiência de combate | **Média** | PTE possui mapa com zoom e controles próprios; V3/CRZ usam arena ampliada, mas ainda não uma barra operacional idêntica. | Manter motores; planejar cabeçalho/mapa/ações/histórico padronizados quando aprovado. |
| A-14 | Resultados | **Média** | PTE tem relatório de baixas por agrupamento, replay e export; V3 histórico e JSON próprio; CRZ after-action próprio. | Futuro: catálogo de relatórios com `rulesetId`, `engineKind` e `replayHash`. |
| A-15 | Retratos | **Baixa** | 20 arquétipos presentes, `BattleCommanderPortrait` usa assets locais e fallback acessível. | Preservar arquivos WebP locais; verificar manualmente todas as correspondências e recortes. |
| A-16 | Progressão | **Média** | CRZ concede XP exclusivamente local ao General-modelo a partir de replay; não é XP oficial da ficha. | Deixar rotulado `Treinamento`; não sincronizar com recursos/XP da campanha. |
| A-17 | Cerco/estratégia | **Média** | O mapa possui cinco pontos e custos abstratos, não é geografia/tempo oficial de Cormyr. | Reposicionar em ferramentas avançadas, com aviso de protótipo, sem integrá-lo ao Hub Temporal. |
| A-18 | Mobile/desempenho | **Média** | Há CSS responsivo e cobertura sintética de Chromium. Não há medições reais de FPS, latência do reducer ou controle de memória no aparelho do Narrador. | **Pendente** benchmarking e touch E2E nos dispositivos-alvo; não divulgar números estimados. |
| A-19 | Ergonomia do editor | **Baixa** | Pincéis/mapa e zonas funcionam em formulário próprio; sua exibição antes do combate amplia muito a tela de preparação. | Editor permanece somente na montagem detalhada, não no caminho rápido. |
| A-20 | Implantação/CI | **Alta** | A integração Lovable/GitHub exige conferir revisão publicada após merge e ação Publish; `get_project.latest_commit_sha` não certifica release ao vivo. | Executar CI nesta PR; **não publicar até autorização explícita para esta revisão e aceite da versão real.** |

## 4. Confronto do relatório V2 com a implementação

| Requisito V2 | Situação do projeto antes da revisão | Situação visada após PR #320 |
|---|---|---|
| Exclusividade Narrador | Visibilidade desligada ao jogador; funções de convites ainda acessíveis sob RLS | Visibilidade mantém-se desligada; servidor de convites negado por padrão |
| Tela inicial clara | Excesso de botões de mesmo peso | Criar batalha PTE, batalha rápida V3 e continuar; outros sob expansão |
| Até cinco agrupamentos por lado | Presente no PTE e na V3 | Preservado |
| Preparação detalhada | Presente, mas longa | Continuará disponível; início rápido opcional |
| Quatro cenários + editor | Presente | Preservado |
| Hexagonal com teclado, toque e zoom | Presente, mas Tab percorre todas as células | Roving Tab + setas; clique/touch e zoom preservados |
| Ataque, dano, moral, retaliação, IA | Presentes em motores experimentais próprios | Sem alteração dos cálculos de motor |
| Unidades oficiais somente leitura | Presente | Fonte opcional antes do jogo e roster mais claro |
| Resultado, exportação, replay | Presentes, mas por motor e armazenamento distintos | Preservados; unificação fica para lote posterior |
| Persistência B | Testes e serviço condicionais | Inalterada; precisa teste real de disponibilidade |
| Aplicação de baixas nas casas | Fora do escopo e não oferecida | Continua fora do escopo |
| Cercos/estratégia/magias | Implementados experimentalmente após V2 | Avançados, sem contaminar fluxo principal |

## 5. Arquitetura recomendada, sem retrabalho de motores

O produto deve ter **uma fachada tática do Narrador** com três camadas:
1. **Começar:** `Criar batalha` (PTE), `Batalha rápida com comandantes` (V3), `Continuar batalha` (se servidor autorizar).
2. **Durante:** campo hexagonal dominante, unidade ativa/turno, habilidades/ações, histórico compacto e resultado auditável.
3. **Avançado:** editor detalhado, regras CRZ, cercos, importação de replay, diagnóstico e controles de persistência. Convites/multiplayer permanecem desabilitados.

**Não fundir PTE-2.0, PTE-3.0-SANDBOX e CRZ.** Seus estados, fórmulas e hashes são diferentes; alterar histórico de batalhas para unificação visual quebraria reprodutibilidade. O alvo da próxima consolidação deve ser apenas uma camada de apresentação de `BattleSessionSummary` e `BattleSessionAdapter` para listar/retomar com regras versionadas.

## 6. Correções desta PR (código)

- `src/components/battle/BattleNarratorHub.tsx`: redução de opções visíveis por padrão; fluxo principal organizado.
- `src/components/battle/BattleSetup.tsx`: iniciar treino de duas tropas fictícias em um clique após escolher nome, cenário e adversário; montagem completa preservada.
- `src/components/battle/BattleV3NarratorEntry.tsx`: consulta de tropas reais antes da partida, lazy e removível.
- `src/components/battle/BattleV3Game.tsx`: reconhecimento de cópias oficiais na composição exibida.
- `src/components/battle/BattleBoard.tsx`: foco único e navegação por setas; sem alteração de movimentos/danos.
- `src/components/battle/BattleAccessCheck.tsx`: distingue recurso propositalmente desligado de falha de autorização.
- `src/lib/battle/v3/invitations.functions.ts`: kill switch de servidor nos três endpoints de convites.
- `src/components/battle/battle-cleanup.css`: contraste, ritmo espacial, layout responsivo e expansão progressiva.
- Testes de regressão: `src/test/battle-ui-editor.test.tsx`, `src/test/battle-ux-simplification.test.tsx`, `src/test/battle-map-roving-focus-audit.test.tsx`, `src/test/battle-v3-invitations.test.ts`.

## 7. Plano de aceite (não simular aprovação)

**Verificações automatizadas:** CI `Validate` (Vitest, TypeScript, produção) e `Battle browser acceptance (synthetic)`; testes de RLS no PostgreSQL descartável. Registrar saídas, falhas e exceções no PR. A aprovação do CI não é prova de funcionamento no site publicado.

**Aceite manual obrigatório no ambiente correto (Narrador):**
1. Entrar como Narrador e identificar apenas duas opções iniciais de criação; jogador não deve visualizar a área.
2. Criar simulação rápida em cada um dos quatro cenários, contra IA e manual. Confirmar que existem somente duas unidades sintéticas.
3. Abrir montagem detalhada; adicionar unidades até cinco por lado; impedir sexta; escolher `warships` deve ser indisponível; editar mapa, posicionar e iniciar.
4. Selecionar um hexágono por Tab; avançar usando setas e confirmar com Enter/Espaço. Validar toque no celular e mapa sem expansão externa obrigatória.
5. Completar uma batalha com ataque, defesa, espera, retaliação, moral e derrota; revisar baixas e replay.
6. No Narrador, ativar fonte oficial opcional V3 e verificar que o roster indica as cópias autorizadas, sem afetar os dados originais.
7. Verificar que jogador, sessão revogada e não membro não recebem dados de snapshots, sessões salvas ou convites; tentar a API direta e ler políticas RLS aplicadas.
8. Verificar persistência somente quando disponível; gerar/reimportar replay e recusar JSON adulterado.
9. Verificar 20 imagens e fallback de comandante; testar em Android e desktop sem cortes.
10. Conferir SHA da versão publicada no Lovable e rodar smoke test em produção sem modificar fichas, calendário ou contas.

## 8. Pendências após simplificação (não incluídas na PR #320)

**P1 — Prontidão operacional:** teste real JWT/RLS após publicação e reconciliação de schema; verificar especificamente tabela de convites acessível diretamente pelo cliente Supabase, não apenas funções do servidor.

**P1 — Unidade da experiência:** tornar o padrão de mapa/ações/histórico igualmente claro em PTE, V3 e CRZ, mas sem misturar reducers e formatos de replay.

**P2 — Continuidade de sessões:** catálogo de batalhas por motor e regras, com tratamento de `in-memory`, `saved-server` e `local-export`; distinguir continuação local de persistência real.

**P2 — Dispositivos/desempenho:** perfil de render do mapa em 11×9 e 15×11, teste de movimento por toque, layout sem overflow e custo de carregamento de imagens.

**P3 — Conteúdo avançado:** melhorar mapa de cerco (modelo fictício declarado) apenas se fizer parte da experiência aprovada pelo Narrador; manter fora do MVP principal.

## 9. Regra de publicação

Esta auditoria **não aplica migração**, não executa `deploy_project`, não altera credenciais e não toca dados reais da campanha. A PR deve ser testada e revista antes de qualquer merge. A mesma publicação continuará exclusivamente no Narrador; `BATTLE_PLAYERS_ENABLED=false` e `BATTLE_NARRATOR_ONLY_RELEASE=true` permanecem em vigor.
