# Firebase — importação atômica do estágio público revisado

O contrato em scripts/firebase/public-content-cloud-stage.mjs foi criado após a auditoria protegida de 17/11/2026 confirmar HTTP 404 em migrationPublicContentStage.

**Ainda não houve importação real.** A fonte pública revisada não está disponível nem aprovada para publicação. O código não tem CLI de produção ou agendamento automático, portanto não altera o Firebase por um push.

Pré-condições para o operador protegido: conteúdo privado revisado explicitamente por registro com publicReviewed=true; versões de catálogo/traduções validadas; snapshot privado com estágio domain e storage completos; mesmo inventário de Casas ativas e nomes do source DomainStage; digest SHA-256 de um plano público exato aprovado de forma independente.

O importador recalcula o plano public-content-review-plan.mjs, confere o digest e obtém inventário de Casas a partir do snapshot real. Se faltar aprovação, um campo, a revisão de qualquer Casa, se houver divergência de nomes/casas ou estágio incompleto, não escreve nada.

Quando todas as condições forem atendidas, uma transação Firestore com cinco creates publica de uma vez o marcador private reviewed migrationPublicContentStage/<snapshot>, o catálogo published e três documentos de tradução (en/es/de). Não sobrescreve uma etapa já existente e não modifica o runtime.

Mesmo depois de importar dados públicos revisados, os endpoints públicos continuam desabilitados enquanto campaignCloudRuntime não estiver reconciliado, os flags necessários não estiverem aprovados e os testes reais não passarem. O importador sempre informa NO_GO e nunca concede Auth, papel, Casa, acesso público, Storage ou DNS. Nenhuma credencial, UID, nome de Casa, hash de snapshot ou texto privado deve aparecer nos logs do CI.

Testes de contrato: scripts/firebase/public-content-cloud-stage.test.mjs rodando em GitHub Actions sem credenciais, integrados ao workflow firebase-cloud-access-readiness.yml. O fluxo operacional de importação real só poderá ser criado depois de existir uma fonte aprovada e privada.
