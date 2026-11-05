# Cruzada V3.2 — comandantes evolutivos em treino

Relacionado à issue #269; esta branch parte do quartel V3.1 (PR #270).

## Entrega
- Progressão funcional de XP exclusivamente para os dez comandantes **MODELO**, com níveis 1–5: 0, 100, 250, 450 e 700 XP.
- Quarenta talentos originais (quatro por comandante). Requisitos mínimos de nível 2/3/4/5, um ponto por nível acima de 1 e aquisição sem duplicidade.
- Especialidade militar: +1 de ataque, +1 de defesa, +1 de movimento (sempre limitados pelos tetos do motor); assinatura: segunda carga do poder por batalha.
- Academia exibida ao selecionar comandantes na preparação da partida livre, sem editar convocações fechadas.
- XP atribuído automaticamente **somente a comandantes controlados por humanos**, após o encerramento do treino. Regra: vitória 120, empate 90, derrota 70, mais até 50 XP por rodadas, máximo 200 por batalha.
- Aplicação dos talentos apenas aos snapshots fictícios no início do encontro e contador V3 de cargas `powerUses`.
- Registro com versão explícita `V3-COMMANDER-1`. `usedPowers` booleano original é preservado para compatibilidade com snapshots anteriores.
- Progressão é mantida somente no estado React da sessão; fechar a tela/recarregar elimina a evolução. Isto é intencional para impedir confusão com XP oficial enquanto não há backend RLS exclusivo.

## Segurança / compatibilidade
- Nenhuma mutação em `noble_house_sheets`, `HouseState`, atributos militares oficiais, eventos ou Hub Temporal.
- Nenhum dado ou replay PTE-2.0 é migrado.
- Editor e motor não realizam transações Supabase.
- Os testes verificam os quarenta talentos, limites, isolamento, versão, cargas e interface de treino.

## Gates para revisão
Executar CI: Vitest, TypeScript, build e navegador; depois homologar desktop/mobile com contas de teste. **Não publicar** até aprovação do Narrador. O XP persistente com RLS, o mapa estratégico e as partidas multiplayer estão fora desta fase.
