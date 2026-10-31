# Hub Temporal de Cormyr — Lote 21: economia e unidades militares entre anos

**Data:** 31/10/2026  
**Base:** Lote 20, PR #146  
**Implementação:** regressões em PostgreSQL 16 descartável e Vitest das regras da Casa; sem deploy, migrations novas ou acesso a dados reais.

## Objetivo

Conferir que o Hub Temporal permita passar vários meses e anos em segurança, sem produzir **pagamentos, cobranças, Sorte, ações ou tropas automaticamente** e sem duplicar benefícios de construções. A fonte oficial de tempo determina o período; a ficha da Casa conserva um mês absoluto processado, que não pode ser revertido por uma correção narrativa.

A outbox pode emitir **notificações distintas para publicações distintas**. Mesmo ao retornar para uma data anterior já processada, essa notificação é informativa ou pede revisão do Narrador; ela nunca autoriza aplicar novamente efeitos financeiros ou militares.

## Teste SQL integrado

O arquivo scripts/test-temporal-multiyear-effects.sql usa uma única transação com ROLLBACK na fixture do CI.

| Momento | Casas | Efeitos verificados |
| --- | --- | --- |
| 1522, início | Duas Casas ativas e uma em rascunho | Recursos, duas unidades da Casa A, uma da B e projetos em construção |
| 1522-04 | Ambas as Casas ativas | Obras pai/filho concluídas; uma entrada no ledger por Casa, projeto não duplicado |
| 1523-01 | Ambas | Novo mês absoluto; recursos e tropas inalterados |
| 1524-01 | Ambas | Virada anual sem renda, Sorte ou convocação automática |
| 1525-01 | Ambas | Oito lançamentos históricos (quatro destinos por Casa), nenhum benefício econômico duplicado |
| Repetição da mesma publicação | Ambas | Mesma chave de operação retorna duplicata e não insere novo lançamento ou aviso |
| Correção 1525 → 1523 | Ambas | Não retrocede fichas nem reverte efeitos concluídos |
| Retorno 1523 → 1525 | Ambas | Não reprocessa mês já conciliado |
| 1525-02 | Ambas | Apenas o novo mês cria mais uma entrada por Casa |
| Durante todos os passos | Casa em rascunho | Continua fora de qualquer atualização automática |

A SQL valida tesouro, Poder, Riqueza, ações, Sorte, unidades e posses com comparações explícitas. Confere os registros únicos por (Casa, mês absoluto) e que campaign_temporal_effect_checkpoints permanece vazio.

A consulta à outbox é feita por RPC do Narrador, não por SELECT direto do jogador. Uma publicação de retorno a 1525 pode criar **um novo aviso militar** com outro operation_id; isso não é bônus duplicado. O teste considera avisos por operação separadamente de ações transacionais e de checkpoints.

## Teste de domínio TypeScript

O arquivo src/test/hub-temporal-multiyear-effects-lote21.test.ts exercita advance, balances, houseEffectLedger, unitMilitaryBonuses, unitStats, quoteMilitaryUnit e resolveHouseNumericBonus.

Os testes verificam:

- Múltiplos pontos da linha temporal entre 1522 e dez anos após, com limite de avanço de 120 meses; estados de Casa, unidades, benefícios e recursos ficam estáveis, exceto projetos legítimos.
- Saltar 36 meses de uma vez produz a mesma ficha que avançar 36 vezes em sequência; as obras dependentes terminam com a ordem correta.
- Ler novamente bônus militares ou efeitos numéricos não multiplica benefícios e não escreve valores nas habilidades das tropas.
- Uma torre e um engenheiro ativados concedem Defesa +4 somente quando estão ativos, sem bônus cumulativo por atualização posterior.
- Correção para um mês anterior a HouseState.month é explicitamente rejeitada pelo motor local, preservando a ficha já conciliada.
- Efeitos numéricos de Sorte, ganho e mitigação ficam disponíveis para eventos autorizados, sem serem creditados automaticamente pelo tempo.

## Limites e liberação

- **Não** processa soldos, tributos, bônus de batalha, mitigação ou Sorte automaticamente. O motor somente calcula estados/avisos já previstos.
- O PostgreSQL de testes tem Casas sintéticas. Isso não prova equivalência com as fichas legadas reais, com compras históricas ou com os dados dos jogadores.
- O histórico Drizzle ainda apresenta **69 SQL, 42 registros no journal e 27 SQL sem registro**, com prefixo 0041 duplicado. O Lote 16 confirmou que 0062/0063 não são reentrantes e a 0066 pode reverter a correção sazonal da 0067 se reaplicada fora de ordem.
- A cadeia de PRs agora declara #146 como predecessora deste lote. A variante alternativa #129 permanece excluída.
- Antes de integração produtiva: inventário autorizado do banco real, conciliação técnica do histórico, backup real restaurado em isolamento, verificação com dados representativos e aprovação expressa do responsável.

## Aceite

- [x] Criar cenário SQL integrado de três anos, com duas Casas ativas, uma em rascunho e exércitos existentes.
- [x] Testar retrospectiva, repetição de operação, retorno a período já processado e entrada em novo mês absoluto.
- [x] Provar ausência de checkpoint econômico ou militar automático na fixture.
- [x] Acrescentar regressões de domínio de 120 meses, salto direto versus incremental e bônus derivados.
- [x] Integrar os testes ao GitHub Actions e a cadeia de dependências até #146.
- [ ] Registrar conclusão do CI da PR deste lote.
- [ ] Obter evidências do Supabase real e homologação de backup restaurado autorizado.

**Status de produção: NO_GO.** Código de testes proposto em PR; nenhuma alteração aplicada à main, ao Supabase ou à campanha real.
