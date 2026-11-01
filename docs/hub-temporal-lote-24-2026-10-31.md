# Hub Temporal — Lote 24: permissões administrativas e sincronização

**Data:** 31/10/2026  
**Base:** Lote 23 (PR #149)  
**Escopo:** testes em PostgreSQL 16 descartável do CI e sincronização do cliente. Não acessa produção.

## Objetivo

Verificar que o jogador vinculado a uma Casa continua sem poderes de Narrador mesmo após a publicação de uma nova data, e que o Narrador precisa usar uma versão atual do calendário para publicar ou corrigir um período.

## Teste SQL integrado

Arquivo: scripts/test-temporal-narrator-authority.sql. O teste cria duas identidades sintéticas, um Narrador e um jogador que é membro real de uma Casa sintética. Todo o cenário é executado em uma transação com ROLLBACK.

| Ação | Jogador da Casa | Narrador |
| --- | --- | --- |
| Consultar data pública de Harptos | Permitida | Permitida |
| Consultar outbox e preflight privado | Negada | Permitida |
| Consultar impacto mensal de outras Casas | Negada | Permitida |
| Ler rascunhos e histórico administrativo | Negada | Permitida |
| Pré-visualizar ou publicar a data do Reino | Negada | Permitida com versão atual |
| Executar o processador mensal diretamente | Negada | Sem RPC público |
| Resolver ou reler entregas temporais | Negada | Permitida conforme contrato |
| Publicar com versão desatualizada | Negada | Também negada |
| Retroceder sem autorização explícita | Negada | Também negada |

O Narrador avança o mês de 1522-01 para 1522-02, confere a ficha sintética, tenta publicar usando uma versão antiga e testa o bloqueio de retrocesso não autorizado. Depois, confirma uma única revisão econômica e repete a mesma requisição para verificar a idempotência; reutilizar a chave com decisão diferente falha.

Finalmente, o jogador tenta novamente obter acesso ao painel privado e publicar o calendário com a nova versão. O teste exige que permaneça bloqueado. Nenhum passo pode gerar créditos, tropas ou checkpoints de efeitos automáticos.

## Sincronização da interface

Arquivo: src/components/calendar/narrator-calendar.tsx. A lista isolada de invalidação após a publicação foi substituída pelo catálogo central temporalQueryKeysForInvalidation(), já usado no Realtime e no polling oficial. Isso também atualiza correspondência, Conselho de jogadores, fichas nobres, idades, outbox e indicadores.

Uma consulta de prévia administrativa também é invalidada. Essas invalidações somente solicitam atualização de dados, não publicam uma segunda data nem executam efeitos econômicos ou militares.

O teste src/test/narrator-calendar-publish.test.tsx foi ampliado para verificar a atualização cruzada de caches após uma publicação confirmada.

## Segurança e limites

A validação de permissões continua no PostgreSQL. O cliente não pode conceder poderes de Narrador, e o servidor deve validar o identificador do ator, a versão do relógio e o motivo da correção. Os testes usam somente fixtures descartáveis, nunca usuários reais.

O histórico Drizzle ainda apresenta **69 SQL, 42 entradas no journal e 27 arquivos sem registro**, além da duplicidade 0041. A restauração de backup real autorizado, a reconciliação das migrações e a aprovação independente continuam pendentes.

**Status de implantação: NO_GO.** A PR deste lote não modifica a main, a data da campanha nem o Supabase de produção.
