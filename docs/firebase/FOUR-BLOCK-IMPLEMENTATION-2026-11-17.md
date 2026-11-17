# Cormyr — quatro frentes da liberação Firebase (17/11/2026)

## Evidência real conferida
- App Hosting confirmou a revisão `b029ac95` recebendo tráfego na execução #44123577024. Publicação de código não representa a campanha liberada.
- Auditoria protegida #44121053301: 14 contas Auth habilitadas, 14 vínculos de acesso, 6/6 estágios privados e 3/4 auxiliares.
- Único estágio auxiliar pendente: `migrationPublicContentStage`. As duas coleções de runtime operacional e correio não estavam verificadas. Existem quatro perfis/Casas pendentes, quatro acessos de campanha inativos e duas trocas de senha necessárias.
- Compilação, validação e testes de emulador passaram para `b029ac95`. Nenhuma sessão entre Casas reais foi aceita em Cloud.

## Implementação das quatro frentes — coleta de evidência sem alterar dados
O auditor protegido agora separa os seguintes contratos em `fourBlocks` e os resume no GitHub Actions:

1. **Conteúdo público:** status HTTP e verificação do documento privado `migrationPublicContentStage`; revisão individual de Casas, traduções e galeria permanece obrigatória antes da importação.
2. **Casas e Missivas:** status HTTP e verificação dos dois runtimes; a reconciliação com fontes atuais e o calendário verdadeiro seguem como pré-requisitos inegociáveis.
3. **Jogadores:** Auth habilitado é verificado separadamente de perfis ausentes, jogadores sem Casa, `active=false` e obrigatoriedade de troca de senha. Nenhuma atribuição de Casa ou concessão de acesso automática é efetuada.
4. **Homologação real:** distingue testes sintéticos em emulador de E2E autenticado com Narrador, Casa A, Casa B, Editor e anônimo, além de gravação e recarga de missivas/calendário.

Em todas as quatro frentes, `ready=false` até prova real específica; `readyForPlayers=false`, `readyForCutover=false` e `releaseDecision=NO_GO` são invariantes do auditor. Os relatórios excluem UIDs, e-mails, nomes de Casas, tokens, snapshots e dados de campanha.

## Próximas operações reais, ainda não efetuadas
- Obter a versão revisada do catálogo e traduções com `publicReviewed=true` por registro, validar o manifesto privado com `planReviewedPublicContent` e importar só a projeção pública aprovada.
- Reconciliar delta de origem e Storage; provisionar `campaignCloudRuntime` e `campaignMailRuntime` com snapshot/rodada/calendário reais e sem habilitar flags de escrita antes dos testes.
- Receber decisões corretas de perfil/Casa para os cadastros pendentes; nunca deduzir atribuições do nome, e-mail ou posição do usuário em uma lista.
- Executar testes autenticados reais por Casa e perfil, inclusive negativas, idempotência e persistência, antes de abrir a campanha.

**Status:** o contrato e diagnóstico das quatro frentes são implementados e testados em CI; a importação/reconciliação e a liberação operacional continuam bloqueadas pela ausência de fonte pública revisada, decisões de vínculo e aceite Cloud. Não usar Supabase, Lovable ou Vercel como fallback.
