# Firestore — verificação dos dois runtimes inativos (17/11/2026)

O [bootstrap protegido #44152563447](https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas/actions/runs/44152563447) foi aprovado, concluiu com sucesso e reportou `documentsCreated: 2`. Os documentos `campaignCloudRuntime/<snapshot>` e `campaignMailRuntime/<snapshot>` foram criados numa única transação em estado `pending`. A origem privada (6 de 6), o estágio histórico de Storage e o calendário privado foram comprovados. Esta etapa não publica o catálogo, não atualiza Auth e não ativa a aplicação.

O audit `cloud-runtime-source-preflight.mjs` passou a verificar o estado `pending` e todas as flags de desativação de ambos os runtimes, incluindo ausência de `openRound`/`calendarVersion`, sem expor os IDs do snapshot, as Casas, as contas ou os dados operacionais. O relatório de operador exibe os dois itens separadamente, nunca tratando a existência de documento como aprovação de uso.

**Próximas condições, ainda pendentes:** reconciliação de delta vivo e Storage por bytes, conteúdo público revisado individualmente, validação de rodada atual, perfis/vínculos incompletos, testes reais de isolamento de Casas e gravação/releitura de missivas. A decisão permanece `NO_GO`, mesmo com os dois drafts confirmados.
