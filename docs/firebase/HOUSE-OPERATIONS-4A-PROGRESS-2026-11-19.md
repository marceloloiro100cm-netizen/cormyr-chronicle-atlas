# Ficha da Casa: progresso do item 4a

A operação `houseOperation` do Supabase continua funcionando, sem alterar
suas mensagens, permissões ou commit histórico. O novo
`src/lib/house/operation-core.ts` não depende de banco e contém:

- enumeração canônica das 55 ações;
- separação das políticas de papel do Narrador, fase de revisão e
  necessidade de período oficial;
- transições puras de criação, edição e exclusão de domínios, incluindo
  duplicidade, restrição de fase e proteção de domínios com tropas e posses.

As outras 52 ações **ainda não estão extraídas**. As seguintes categorias
dependem de fatos carregados do banco antes da operação:
catálogo e regras, calendário, NPCs e Corte, vínculos de Casas vassalas,
histórico de livro-razão para desfazer, jogador/membros e sorteios
auditáveis. Esses dados devem entrar como contexto explícito na função
pura, sem consultas de rede, relógio ou aleatoriedade internos.

Próxima sequência para concluir o 4a:
1. separar as 52 transições restantes por domínio;
2. passar no contexto catálogos, NPCs, identidade e calendário;
3. passar entradas aleatórias já auditadas como dados;
4. comparar resultados com os testes de regressão do Supabase por ação;
5. só depois construir a transação Cloud de 4b.

`CORMYR_FIREBASE_HOUSE_OPS_ENABLED=false` continua protegendo as operações
de escrita; este PR **não libera 4b nem 4c**.
