# Lote 28 — operações em voo durante revogação

Verificação dupla: autorização no início e no término da operação de Casa; a função de commit transacional existente é responsável por negar vínculos revogados, verificar versão e registrar operação atômica. Uma autorização coletada antes de uma tarefa demorada não vale como autorização final.

Testes: `scripts/test-temporal-inflight-revocation.sql` simula revogação do direito de edição depois de a operação ser preparada, sem permitir gravação; após a restauração do vínculo aceita uma operação única. A suíte `src/test/house-inflight-revocation-lote28.test.ts` exige os guardas de início, fim e transação.

Limite: o teste SQL emprega a função de commit preexistente, não garante isolamento serializável entre todas as transações concorrentes de produção. Nenhuma migração nem banco real foi alterado.

Status: **NO_GO** para produção: diário Drizzle e backup real autorizado continuam pendentes.
