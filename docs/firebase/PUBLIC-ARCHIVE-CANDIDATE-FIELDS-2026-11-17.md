# Catálogo público — revisão de candidatos sem risco de atribuição automática

Em 17/11/2026, a auditoria protegida confirmou que 10 das 11 Casas do snapshot estão ativas na temporada 2 e possuem nomes únicos correspondentes no arquivo público, que apresenta 172 Casas em 11 regiões. Isso não significa que as 172 Casas sejam registros da campanha dos jogadores.

Esta etapa impede que duplicações de nome na fonte privada sejam classificadas como coincidências exatas, mesmo quando há apenas uma Casa homônima no catálogo público. A conferência agrega, para **cada coincidência única de nome**, a disponibilidade de região, classificação hierárquica, brasão público, referência segura a arquivo de história e descrição diretamente no catálogo. Os totais não incluem nomes/IDs privados, saldos, segredos, missivas, calendário ou credenciais.

Referências de história são conferidas apenas quanto ao formato `histories/<path>.json`; arquivos não são lidos nem publicados e a confirmação de existência e revisão editorial continua pendente. O conteúdo não recebe `publicReviewed=true`, não é importado no Firestore e não autoriza jogadores, Casa ou rodada. Um nome igual **nunca** é identidade suficiente para autorização de acesso.

O relatório permite priorizar quais campos precisam de revisão editorial antes da etapa independente `migrationPublicContentStage`. Todos os flags `readyForPlayers` e `readyForCutover` permanecem falsos.
