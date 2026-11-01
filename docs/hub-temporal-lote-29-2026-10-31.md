# Hub Temporal — Lote 29: respostas privadas tardias

**Base:** PR #154 (Lote 28). **Data:** 31/10/2026.

Uma consulta pode carregar várias páginas de missivas, histórico ou ficha de Casa enquanto o Narrador remove a permissão. O Lote 26 esvazia o cache após eventos de autenticação e o Lote 27 compara permissões periodicamente, mas uma resposta ainda pode chegar entre duas verificações. Este lote acrescenta uma segunda consulta de permissão **antes de devolver os dados**.

- `loadPanel`: identifica o usuário autenticado e seu escopo no início; ao terminar todos os carregamentos, exige identidade e fingerprint idênticas à primeira leitura. Falha sem devolver os dados ao React Query se cargo, Casa, edição ou status tiverem mudado.
- `loadHouseHub`: refaz a checagem de leitura da Casa no final, recusa perda do cargo de Narrador e verifica novamente edição de atributos. Não devolve os dados antigos se o acesso foi revogado.
- `loadHouseLedger`: verifica novamente o vínculo antes de devolver o resultado da exportação paginada.
- `assertUnchangedAccessScope`: contrato testável que detecta alteração de identidade ou permissões.
- Testes de aplicação conferem os contratos de começo/fim, a proibição da resposta stale e o limite da autorização.

**Limite:** rechecagens em chamadas separadas reduzem a janela de exposição, mas não equivalem a uma transação atômica entre todas as leituras. RLS continua obrigatória. Não prova revogação instantânea em clientes offline nem é homologação em dados reais.

**Produção NO_GO:** 27 migrações fora do journal Drizzle, prefixo 0041 duplicado, restauração de backup real pendente. Nenhuma PR mesclada, sem acesso ao Supabase real.
