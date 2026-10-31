# Hub Temporal de Cormyr — Lote 20: regressões funcionais integradas

**Data:** 31/10/2026  
**Base:** Lote 19, PR #145  
**Ambiente:** PostgreSQL 16 efêmero de CI e testes de domínio Vitest. Nenhuma data ou informação privada da campanha real foi modificada.

## Objetivo

Os lotes anteriores testaram serviços separadamente. Este lote verifica uma **mesma linha temporal compartilhada** que passa por missivas, nobres, projetos de construções, ficha militar, outbox e retrocessos narrativos. O cenário é executado após as migrações em **transação com ROLLBACK**, com Casas e usuários sintéticos.

### Fluxo de aceite integrado

| Etapa | Efeito esperado | Proibido |
| --- | --- | --- |
| Estado inicial | Nobre de 30 anos, duas unidades militares preexistentes, dois projetos dependentes e tesouro fixo | Alterar a campanha de jogadores |
| Rodadas de missivas | Uma carta datada de 1522 permanece vinculada ao tempo histórico | Mover o calendário pela abertura de rodada |
| Avanço até 1522-04 | Pai e filho concluídos, duas unidades preservadas, um evento de Casa e projeção militar informativa | Soldos, receita, Sorte, ações ou tropas criadas automaticamente |
| Replay da operação | Mesma publicação identificada como duplicata, sem novas entradas de Casa/outbox | Conclusão de projeto e bônus duplicados |
| Virada para 1523 | Idade derivada passa de 30 a 31; referência do nascimento, fichas e datas históricas fixas | Incrementar idade persistida, reescrever missivas ou criar unidades |
| Retificação 1523 → 1522 | Idade projetada volta a 30 por cálculo, preservando construções e ledger | Desfazer compras, demolir fortificação ou reembolsar recursos |
| Retorno a 1523 | Estado da Casa já processado permanece estável | Reprocessar meses, recrutar unidades ou creditar bônus novamente |
| Permissões | Jogador não pode publicar data nem consultar painel privado da outbox | Ler dados do Narrador |

### Arquivos implementados

- `scripts/test-temporal-integrated-scenario.sql`: cenário transacional de ponta a ponta executado no job `mail-database`. Todos os dados sintéticos são revertidos por `ROLLBACK`.
- `src/test/hub-temporal-integrated-lote20.test.ts`: testes reais de cálculo da Casa, usando `advance`, `unitMilitaryBonuses`, `unitStats`, `houseEffectLedger` e `quoteMilitaryUnit`. Validam bônus de fortificação somente após construção, repetição idempotente da projeção, controle de reversão histórica e ausência de efeitos econômicos.
- `.github/workflows/validate.yml`: executa a regressão SQL após as regressões de projetos, consumidores e pré-voo, com a mesma base efêmera.
- `docs/hub-temporal-pr-stack.json`: registra a PR #145 como dependência anterior, mantendo a alternativa #129 excluída.

## Distinções importantes

1. A idade do nobre é **projeção calculada por ano canônico**, não mutação da ficha.
2. A carta mantém `campaign_date` e não é redatada por mudança do relógio central.
3. Os projetos são processados por mês absoluto; correção retroativa **não** desfaz efeitos econômicos ou históricos.
4. As unidades militares pertencem a `noble_house_sheets.state.units`. Seus bônus são derivados das posses **ativas** na leitura; a passagem do tempo não recruta nem reescreve unidades.
5. Notificações da outbox de exército e economia não significam execução financeira ou militar automática; `campaign_temporal_effect_checkpoints` deve permanecer vazio.
6. O CI usa o banco vazio com fixtures sintéticas, **não uma restauração do banco real**. Portanto, seu sucesso não prova compatibilidade com todos os estados legados das Casas.

## Critérios de homologação para produção

- [x] Implementar regressão SQL cruzando nobres, missivas, obras, tropas e relógio numa única transação.
- [x] Testar replay, ano novo, retrocesso e retorno sem efeitos duplicados.
- [x] Adicionar testes de cálculo militar e econômico derivado a partir das posses.
- [x] Preservar RLS e proibir ações administrativas por jogador comum.
- [ ] GitHub Actions da PR deste lote aprovado.
- [ ] Inventário real do Supabase obtido e histórico Drizzle conciliado (69 arquivos SQL, 42 entradas, 27 divergentes, prefixo 0041 duplicado).
- [ ] Backup real autorizado restaurado, comparado, homologado e aprovado de forma independente.

**Estado de implantação: NO_GO.** O lote só prepara provas técnicas em CI. Nenhuma PR foi mesclada, nenhuma migration foi aplicada em produção e a data da campanha real permanece inalterada.
