# CCA-ESP-MVP-001 — Lote 14 · Preparação de release controlado

## Decisão de 02/11/2026: **NO_GO PARA PRODUÇÃO**

Esta é uma **entrega de código e evidência em PRs de rascunho**, não um deploy. A implementação no Marco C contém contratos, UI, esquema SQL de revisão e cenários de PostgreSQL descartável. Os dados reais não foram migrados, as regras de Lei/contramedidas e roteiros reais não foram homologados, e o Hub Temporal continua sujeito ao bloqueio anterior.

## O que está pronto para revisão
- Lote 10: `docs/espionage/sql/0075_spy_core_REVIEW_ONLY.sql`, RLS, RPC `spy_submit_mission`, liberação auditada de carta. Local do SQL deliberadamente **não executável pelo migrador Drizzle**.
- Lote 10: `pros-spy-contract-batch`, posse repetível com custo de **5 Riqueza de alocação para 2 contratados**; usa `houseOperation('purchase')` existente e ledger canônico. O cadastro operacional persistente de agentes não deve ser habilitado antes das validações do banco.
- Lote 11: `docs/espionage/sql/0076_spy_temporal_REVIEW_ONLY.sql`, consumidor inicial **desativado** e processamento por Narrador com versão oficial, idempotência e auditoria.
- Lote 12: `.github/workflows/espionage-marco-c.yml`, PG16 **descartável** e testes de RLS, missões, cartas e salto temporal; não representa cópia de produção.
- Lote 13: `docs/espionage/lote-13-homologacao-narrador.md`, 20 casos de aceite a executar sobre cópia restaurada com sessões de jogador.
- Lote 14: `docs/espionage/release-evidence.json` e `scripts/espionage-release-gate.mjs` com evidência faltante = **NO_GO**.

## Dependências antes de executar qualquer SQL no projeto real
1. Verificar as versões finais e o histórico de branches Lovable/GitHub; resolver todos os PRs empilhados na ordem 194 → 214, sem force push/rebase de histórico publicado.
2. Reconciliação de `drizzle/meta/_journal.json` e estado do banco; prefixo 0041 duplicado, histórico temporal incompleto e testes de Missivas pendentes precisam ser saneados.
3. Backup físico/restaurável de produção e ensaio de restauração documentado num banco isolado contendo fichas, missivas, personagens e ledger; conferir RLS com identidades autenticadas e revogação de vínculos.
4. Revisão dos arquivos `0075`/`0076` como migrações **únicas** numeradas depois do journal reconciliado. Não promover por renomeação automática nem aplicar SQL manual sem registrar a transação Drizzle correspondente.
5. Implementar/homologar as funções autorizadas faltantes para materializar agentes e contratar sem divergência, planejar segmentos com rotas aprovadas, selar decisões e publicar relatórios sem qualquer SELECT privado indevido.
6. Habilitar o consumidor temporal somente após execução e replay dos testes duráveis; manter lançamento idempotente em cada segmento.
7. Narrador executa e assina os 20 cenários de aceite; validar mobile, exportação, pesquisa, audit logs e ausência de divulgação de relatórios selados.
8. Executar `node scripts/espionage-release-gate.mjs --enforce`; **somente GO com evidências válidas** permite considerar um plano de implantação. O script nunca publica nem faz SQL.
9. Definir janela, rollback, responsável e backup de produção. Executar a migração pelo pipeline Drizzle autorizado, conferir chaves e políticas no banco real, liberar as consultas de espionagem gradual e testar acesso de duas Casas.
10. Validar Lovable publicado **depois** do merge autorizado; realizar observação e rollback se surgirem problemas.

## Política de rollout
Nenhuma versão do Marco C altera produção até que os gates passem. O conteúdo demonstrativo do Marco B não deve ser tratado como missão real. O Narrador mantém controle sobre cartas, Lei-alvo e exceções de viagem. O registro de decisões anteriores preserva historicamente os resultados e impede dupla cobrança ou divulgação involuntária.

**Status executado:** PRs em branch, PostgreSQL de teste, relatórios de segurança. **Status não executado:** migração, homologação de produção, release e publicação.
