# Firebase Cloud — pré-validação adicional dos runtimes (17/11/2026)

O último diagnóstico protegido confirmou a importação histórica (6/6) mas retornou HTTP 404 no estágio público e nos dois runtimes. A ativação Auth (14/14) NÃO significa que as Casas ou Missivas estejam operacionais.

Esta implementação acrescenta uma sonda somente leitura ao auditor protegido, sem exigir Cloud Shell:
- Lê os 6 roots históricos e os 4 auxiliares do mesmo snapshot. Reporta apenas quantidades e **nomes fixos de estágios faltantes**, sem conteúdo.
- Confere separadamente a projeção temporal privada em migrationTimeEngineStage/<snapshot>/calendar/current: data Harptos válida, versão inteira positiva e campo lastRound opcional de histórico.
- Distingue a presença dos documentos campaignMailRuntime e campaignCloudRuntime da conclusão dos estágios.
- Não usa lastRound como openRound. A rodada realmente aberta, a revisão da fonte viva, o delta final, a integridade por bytes do Storage, os acessos por Casa e o aceite real autenticado dependem de evidência separada.

A saída é sanitizada em fourBlocks.operations.sourcePreflight. Nenhum ID, hash, data do calendário, senha, Casa ou mensagem é serializado. Falhas de provedor viram apenas o booleano runtimeSourceProbeFailed. O workflow de auditoria protegida continua exigindo aprovação de firebase-auth-test-activation.

**Nenhum documento novo é criado no Cloud; nenhum flag/secret é alterado.** readyForRuntimeProvisioning=false, readyForPlayers=false, readyForCutover=false e releaseDecision=NO_GO permanecem constantes. Esse diagnóstico identifica exatamente quais fontes de operação estão prontas e quais dependem de revisão privada.
