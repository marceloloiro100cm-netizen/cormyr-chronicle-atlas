# Lote 36 — falha transitória não é revogação de cargo

**Base:** PR #161. **Data:** 31/10/2026.

Na validação do Lote 35 identificou-se que `requireFreshNarratorAccess`
classificava indisponibilidade do RPC de cargo como perda explícita de
privilégio. A operação era bloqueada (correto), mas a interface podia
eliminar todos os dados administrativos apenas por falha de rede.

## Alteração

- A consulta `is_campaign_admin` continua obrigatória imediatamente antes
  de rascunho, publicação, revisão e replay.
- `data=true` e ausência de erro são o único resultado que autoriza
  continuar.
- `data=false`, `data=null` sem erro ou negação de permissão `42501`
  bloqueiam e sinalizam revogação.
- Erro de transporte/outage também bloqueia o comando, porém informa
  indisponibilidade e não dispara a purga global por revogação.
- Testes novos abrangem resposta verdadeira, falsa, nula, erro de rede e
  negação RLS. O teste histórico do Lote 32 foi ajustado ao contrato preciso.

## Situação

Sem acesso à produção, sem migração, publicação de data ou alteração de
fichas. Continuam pendentes conciliação de 27 SQL, conflito de prefixo
`0041` e homologação de backup real. **NO_GO**.
