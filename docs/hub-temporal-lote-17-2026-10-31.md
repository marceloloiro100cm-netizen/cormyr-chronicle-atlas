# Hub Temporal de Cormyr — Lote 17: bloqueio de reexecução e ordem segura de revisão

**Data:** 31/10/2026 · **Base:** Lote 16 / PR #142

**Estado:** instrumentos de planejamento, matriz de riscos, testes automatizados e relatório no GitHub. **Sem merge na main, sem acesso ao Supabase real e sem executar migrações.**

## 1. Motivação e evidência já comprovada

O Lote 16 passou no CI e ensaiou individualmente as migrações 0060–0067 em oito clones descartáveis de PostgreSQL 16. O ensaio observou:

| Migração | Reaplicação em clone migrado até 0067 | Risco |
|---|---|---|
| 0060 — publicação transacional | Sem erro | Nenhuma mudança detectada no clone |
| 0061 — projeção pública | Sem erro | Nenhuma mudança detectada no clone |
| **0062 — registro canônico** | **Falhou** | Não reentrante nesse cenário |
| **0063 — idades anuais** | **Falhou** | Não reentrante nesse cenário |
| 0064 — cronologia | Sem erro | Nenhuma mudança detectada |
| 0065 — meses e posses | Sem erro | Nenhuma mudança detectada |
| **0066 — outbox de consumidores** | **Sem erro, alterou schema** | **Desfez a correção de travessias sazonais de 0067** |
| 0067 — pré-voo de liberação | Sem erro | Nenhuma mudança detectada |

O ensaio original está identificado pelo workflow GitHub Actions **41241607317**, no commit **7c564a18e611179a2302d4f4a04e1c907192e76b**. Os oito hashes de *Git blob* do SQL são fixados em \`docs/hub-temporal-replay-risks.json\`. O planejador verifica-os contra os arquivos atuais; se qualquer SQL mudar, o manifesto deve ser revisto e o ensaio refeito, nunca reaproveitado como evidência de um script alterado.

O êxito de uma reaplicação em clone não constitui prova de que repetir SQL em produção é seguro.

## 2. Funcionalidade implementada

### \`scripts/temporal-migration-sequence.mjs\`

Gera três tipos de saída sem conexão com banco:

- \`--report\`: ordem canônica nominal, bloqueios reais do catálogo e fatos de replay, **sem selecionar SQL executável**.
- \`--template\`: folha com os oito SQL e seus hashes SHA-256, inicialmente com status \`unknown\`.
- \`--check\`: confere uma folha preenchida com referências de deployment e schema, operadores independentes, data da revisão, SHA do frontend/backend e ambiente específico; **devolve apenas proposta de sufixo para revisão humana se todos os bloqueios documentais forem resolvidos**.

O script nunca produz comandos SQL, arquivos de migration, alterações no diário, tarefas de implantação, rollback ou uma autorização para alterar produção.

### Regras do planejador

1. A fonte deve ter exatamente uma migração por prefixo \`0060\`–\`0067\`, seguindo essa ordem.
2. Os hashes do SQL têm de corresponder aos arquivos reais, e os resultados de replay devem estar presos aos blobs observados pelo CI.
3. Cada script exige status \`applied\` ou \`not_applied\` com evidência de execução e comparação de schema. Desconhecimento (\`unknown\`) bloqueia a proposta.
4. Migrações aplicadas devem constituir **um prefixo contínuo**. É proibido sugerir aplicação de 0066 se 0067 já foi comprovadamente aplicada, pois seria uma reexecução mais antiga fora de ordem.
5. Somente uma sequência que contém as migrações **ainda não aplicadas, como sufixo contínuo** pode aparecer em \`reviewed_candidate_suffix\`. Mesmo nesse caso a saída é \`REVIEW_ONLY_NOT_EXECUTABLE\`, e \`go_no_go\` continua sempre \`NO_GO\`.
6. É indispensável comprovar a reconciliação histórica das migrações anteriores, a numeração duplicada 0041 e uma estratégia de Drizzle revisada independentemente.
7. A ausência de inventário de produção impede qualquer autorização real, e documentação autodeclarada não se converte em prova de implantação.

**Na branch atual, o catálogo ainda tem 69 scripts SQL e 42 entradas no diário, deixando 27 scripts sem registro.** Por isso, nenhum sufixo é proposto neste momento, independentemente de os testes de código passarem.

### Manifesto de riscos \`docs/hub-temporal-replay-risks.json\`

Registra, por migração, o hash Git de seu conteúdo, sucesso ou falha de replay em cópia, alteração de schema, alteração de dados e regressão sazonal. Não contém jogadores, dados da campanha, segredos ou ligações de acesso à produção.

### Testes \`scripts/temporal-migration-sequence.test.mjs\`

A cobertura inclui: NO_GO real, arquivo e hash divergentes, prova de replay adulterada, fonte ou ambiente errados, datas futuras, revisores iguais, status desconhecido, registros duplicados, inclusão de scripts inesperados e teste sintético da violação de ordem 0066–0067. O conjunto de testes usa cenários sintéticos para exercitar \`REVIEW_ONLY_NOT_EXECUTABLE\`, mas **não** afirma que o histórico de Cormyr está corrigido.

O workflow de CI acrescenta o passo **Temporal SQL dependency sequencing** e verifica que a análise real continua bloqueada. A cadeia de PRs no manifesto foi atualizada até #142, mantendo a alternativa concorrente #129 excluída.

## 3. Procedimento de inspeção

Após obter inventário autorizado do banco real, o responsável pode executar os comandos **offline**, em máquina local, com saída restrita a \`.temporal-audit/\`:

\`\`\`bash
mkdir -p .temporal-audit

node scripts/temporal-migration-sequence.mjs --report \
  > .temporal-audit/ordem-atual.json

node scripts/temporal-migration-sequence.mjs \
  --template --sha SHA_COMPLETO_40_CARACTERES \
  --environment homologation \
  > .temporal-audit/status-migracoes.json

# A folha deve ser preenchida com os registros legítimos da origem.
node scripts/temporal-migration-sequence.mjs \
  --check --sha SHA_COMPLETO_40_CARACTERES \
  --environment homologation \
  --evidence .temporal-audit/status-migracoes.json \
  > .temporal-audit/revisao-sequencia.json
\`\`\`

O relatório de \`--check\` terá **código 2** para estado bloqueado; \`--report\` não falha somente porque há pendências. Se um conjunto hipotético de evidências atingir \`REVIEW_ONLY_NOT_EXECUTABLE\`, isso ainda requer confirmação direta em logs/DDL, backup restaurado, homologação isolada, revisão de RLS e autorização separada do operador antes de qualquer DDL.

**Não executar em produção:** \`drizzle-kit migrate\` sem conciliar histórico, reexecutar a sequência 0060–0067 inteira, ou aplicar 0066 sobre 0067. Não preencher o diário artificialmente para satisfazer testes.

## 4. Fatos para decisão final

- **0062/0063:** não reentrantes nos clones testados; qualquer versão já aplicada deve ser registrada como \`applied\`, com análise do histórico e sem repetição.
- **0066/0067:** funções temporais podem ser redefinidas sem erro SQL, mas a ordem determina o comportamento das travessias sazonais. Preservar a lógica final de 0067.
- **0036/0041 e demais arquivos fora do diário:** impedem montar um plano executável a partir do GitHub. Precisam de evidência do registro efetivo em cada ambiente.
- **Rollback de calendário:** nunca corresponde a um rollback de esquema. Backup restaurável e janela operacional permanecem requisitos externos.

## 5. Aceite do lote

- [x] Plano puramente informativo com bloqueio para reexecução, status desconhecido, ordem quebrada e divergência de hash.
- [x] Fatos de replay fixados à execução real do CI e aos blobs dos oito SQL.
- [x] Folha de revisão de estado por migration e por ambiente, sem dados privados.
- [x] Testes automatizados de riscos e integração do diagnóstico ao CI.
- [x] Cadeia de PRs atualizada até #142, com #129 excluída.
- [ ] CI deste lote concluído e aprovado.
- [ ] Histórico de migrations e schema reais obtidos e auditados em leitura.
- [ ] Reconciliação de 27 SQL, 0036/0041 e estratégia Drizzle validada.
- [ ] Backup restaurado, homologação representativa e autorização expressa de corte.

**Conclusão:** o planejador impede que uma aparente lista de SQL pendentes seja interpretada como comando de execução. O Hub Temporal ainda está **NO_GO** para produção.
