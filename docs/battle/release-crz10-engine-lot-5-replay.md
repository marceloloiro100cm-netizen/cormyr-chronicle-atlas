# CRZ-1.0 — Lote 5: replay auditável e retomada local

**Origem:** continuação do PR #282 e do manual normativo `03-regras-cormyr-cruzada-passo-a-passo.md`, mantendo os redutores do CRZ separados do PTE-2.0.

## Implementação

- `src/lib/crusade/replay.ts`: `crzReplayBegin`, `crzReplayRecord`, `crzVerifyReplay`, `crzReplayResume`, `crzReplaySerialize` e `crzReplayParse`.
- Versão explícita de replay, configuração inicial preparada, `seed`, `rulesetHash`, hash do estado inicial e hash gênese.
- Cadeia SHA-256 por comando com índice, hash anterior, ator declarado, comando, estado antes/depois, RNG antes/depois e eventos completos produzidos pelo redutor.
- Verificador **reexecuta desde o estado inicial** e compara comando, eventos, estado e hash de cada transição, recusando regras desconhecidas e estados ilegais. A retomada somente ocorre após a verificação integral.
- Limites: 2.000 comandos, 8 MB de JSON e 5.000 eventos do redutor. Exportação/importação locais, sem banco ou rede.
- Testes sintéticos independentes: movimento e turno, roundtrip JSON, retomada, híbrido PCG32, ataque, adulteração de comando/resultado/RNG/estado/ordem/hash, ator indevido e bloqueio de fontes oficiais.

## Garantias e limitações

A cadeia prova **consistência e reexecução determinística**. Ela **não é assinatura digital nem prova identidade do jogador**: quem controla todo o arquivo pode produzir outro replay internamente válido. Autenticidade futura exigirá âncora de hash armazenada por servidor, controle de autoria, verificação de autorização e CAS/RLS. Não associar esta função à aprovação oficial de baixas do PTE-2.0/V3.5.

Este lote não permite selecionar exércitos reais, importar arquivo 05 de bestiário, publicar CRZ no site, alterar o calendário, atualizar fichas, executar ações remotas ou desbloquear os presets WOTR/PTE-compat. Mantém o `house-readonly` bloqueado.

## Critérios de aceite

1. GitHub Actions Validate (testes, TypeScript e build) verde, com logs reais; regressões de banco PostgreSQL descartável devem continuar verdes.
2. Conferir a divergência normativa de `overkill='cap'` no `T-INT-01` antes de aceitar dados de campanha: o preset padrão CRZ-5E **não** produz as mesmas baixas do exemplo carry.
3. Testar em homologação o futuro fluxo gráfico de salvar/importar/reproduzir; **nenhuma interface CRZ nem persistência é entregue neste lote**.
4. Só mesclar a pilha de PRs após revisão da dependência #282 e sem descartar a variante paralela #281 sem reconciliação.

### Próximo lote sugerido

**Lote 6:** interface CRZ própria para treino, com HUD de movimentos/ataques, painel do General, log auditado, importação/exportação de replay, cenários-modelo e testes Playwright desktop/mobile. Não habilitar multiplayer nem escrita na campanha.
