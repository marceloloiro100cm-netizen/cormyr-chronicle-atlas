# Hub Temporal — Lote 14: Go/No-Go técnico e preparação da integração

**Data:** 31/10/2026  
**Base:** Lote 13 / PR #139  
**Status:** código de avaliação, testes e procedimento de liberação preparados em branch; **sem merge na main, sem deploy e sem alteração da campanha real**.

## 1. Resultado e fronteira de responsabilidade

Este lote consolida as quatro auditorias anteriores (Drizzle, contratos/RLS, pilha de PRs e CI) e as evidências operacionais em um **relatório de prontidão que falha fechado**. O relatório não abre PRs, não faz merge, não se conecta a banco, não executa DDL, não publica calendário e não recebe credenciais de produção.

Os novos arquivos são:
- \`scripts/temporal-release-readiness.mjs\` — consolidado determinístico com diagnóstico Go/No-Go; evidências são documentos fornecidos pelo operador, **não atestados autenticados**.
- \`scripts/temporal-release-readiness.test.mjs\` — cenários de migração inconsistente, ausência de evidência, divergência de SHA, troca de ambiente, desatualização, falhas de CI/RLS, backup não restaurado e autorização indevida.
- \`docs/hub-temporal-pr-stack.json\` — atualizado para incluir PR **#139**, após #138, mantendo #129 fora da cadeia.
- \`scripts/temporal-stack-audit.test.mjs\` — alinhado ao novo manifesto.
- \`.github/workflows/validate.yml\` — etapa informativa com resumo **NO_GO** na execução comum do CI. O build e a suíte de SQL continuam funcionando independentemente da falta de evidência real.

### Situação real de prontidão nesta branch

| Requisito | Situação |
| --- | --- |
| Lotes 1–13 preparados em PRs | Evidências de PRs e CI anteriores disponíveis; **ainda não mesclados à main** |
| Histórico Drizzle totalmente conciliado | **Não** — 69 SQL / 42 entradas / 27 fora do diário |
| Colisão de numeração 0041 resolvida com histórico real | **Não** |
| Inventário de produção somente leitura recebido | **Não** |
| Teste com banco legado representativo e usuários reais de homologação | **Não** |
| Backup de produção restaurado em ambiente isolado | **Não comprovado** |
| Planos de rollback e janela aprovados | Plano definido, aprovação operacional ainda pendente |
| PR alternativa #129 | **Excluída** da ordem de integração do Hub |
| Liberação final | **NO_GO** até resolver os bloqueios |

**A existência de build verde nunca equivale a aprovação de produção.**

## 2. Contrato do avaliador

Comando seguro, offline e reproduzível:

\`\`\`bash
node scripts/temporal-release-readiness.mjs --report
\`\`\`

Saída JSON resumida:

\`\`\`json
{
  "go_no_go": "NO_GO",
  "technical_evidence_complete": false,
  "production_release_authorized": false,
  "merge_authorized": false,
  "migration_execution_authorized": false,
  "any_operation_performed": false,
  "external_evidence_unverified": true,
  "human_review_required": true
}
\`\`\`

Campos adicionais incluem motivos de bloqueio, identidade de ambiente/commit e contagens verificadas do catálogo local.

### Uso com evidências de um ambiente autorizado

O operador, após coletar e revisar os documentos **fora** do GitHub, pode testar o diagnóstico:

\`\`\`bash
node scripts/temporal-release-readiness.mjs --gate \
  --sha SHA_VALIDADO \
  --environment homologation \
  --migration evidencia-migracoes.json \
  --contracts evidencia-contratos.json \
  --stack evidencia-prs.json \
  --ci evidencia-ci.json \
  --operations checklist-operador.json
\`\`\`

Os cinco arquivos são envelopes no formato \`{format_version:1,kind,environment,source_sha,observed_at,report}\`, com \`kind\` em \`migration|contracts|stack|ci|operations\`. O validador exige que os cinco apontem ao **mesmo SHA e ambiente**, tenham data de observação válida com até 24 horas e possuam campos mínimos:

- \`migration\`: \`ready_for_deploy=true\`, \`inventory_verified=true\`, zero problemas, contagens reconciliadas com os arquivos SQL versionados.
- \`contracts\`: \`contract_ok=true\` e todos os testes de RLS, RPCs e relógio público aprovados.
- \`stack\`: \`live_verified=true\`, \`chain_consistent=true\`, \`all_merged=true\`, sem erros e sem autorização implícita.
- \`ci\`: \`conclusion=success\`, jobs \`validate\` e \`mail-database\` aprovados para o commit.
- \`operations\`: backup efetivamente **restaurado e testado**, homologação representativa, testes de usuários e RLS, conciliação da migração, ensaio de rollback e janela de implantação autorizada.

Os envelopes são documentos autodeclarados, **não assinados nem autenticados por esta ferramenta**. Os resultados devem ser conferidos diretamente nos sistemas de origem pelo operador e revisados independentemente. Não hospedar evidências com dados confidenciais, segredos, tokens ou dados de jogadores em PRs públicas.

Se faltarem requisitos: \`--gate\` retorna código **2** e \`NO_GO\`. Se todos forem declarados completos: retorna sucesso da **validação documental**, porém \`go_no_go=MANUAL_APPROVAL_REQUIRED\` e **\`production_release_authorized=false\`**. Não é um mecanismo de deploy automático e não é certificado de segurança.

## 3. Ordem de integração para o operador

Depois de aprovação explícita e inspeção dos diffs ainda pendentes:

\`#127 → #128 → #130 → #131 → #132 → #133 → #134 → #135 → #136 → #137 → #138 → #139 → [PR do Lote 14]\`

- #126 é auditoria/base de referência separada; a alternativa #129 do Lote 4 **não** deve ser mesclada conjuntamente com #130.
- Cada PR foi inicialmente criada sobre a branch anterior, **não diretamente sobre main**. Confirmar o resultado de cada merge e a necessidade de atualizar a base da PR seguinte, evitando a duplicação de commits e efeitos.
- Não mesclar automaticamente neste lote. Não avançar datas em uma base real para testar o comando.
- Uma PR marcada como \`mergeable\` no GitHub representa apenas ausência de certos conflitos de código, **não** compatibilidade do schema real ou permissão para implantar.

## 4. Processo Go/No-Go antes do corte

1. **Inventariar (somente leitura):** obter hashes, catálogo e estado do Drizzle da instância autorizada. Confrontar logs de DDL e histórico do deploy; resolver a lacuna 0036, a numeração duplicada 0041 e os 27 arquivos fora do diário. Não inventar versões ou inserir registros manualmente no histórico.
2. **Congelar o commit:** registrar SHA do frontend e do backend/RPC. Revalidar CI para esse SHA após cada merge.
3. **Isolar a homologação:** restaurar cópia autorizada com acesso restrito; comparar os contratos de calendar, nobres, missivas, construções e exércitos. Executar testes mutantes **somente em banco descartável**.
4. **Validar segurança:** sessão anônima, jogador comum e Narrador devem ter acessos distintos; leitura de dados privados de outra Casa é proibida. Testar retrocessos e idempotência sem reabrir projetos nem redistribuir recursos.
5. **Backup e recuperação:** restaurar integralmente backup em ambiente independente, ensaiar retorno ao frontend compatível e documentar eventual perda de dados posteriores ao backup. Nunca interpretar retrocesso do jogo como rollback de banco.
6. **Aprovar formalmente:** operador responsável pela base, revisor independente e Narrador registram janela de manutenção e critérios de suspensão em repositório apropriado e protegido.
7. **Corte, somente após autorização separada:** aplicar o conjunto de migrações efetivamente faltantes, de forma transacional, coordenado ao frontend. Executar smoke read-only, verificar versão da data oficial, preflight e logs. Reabrir escritas de campanha somente após validação humana.

### Critérios de interrupção imediata

- Diferenças de hash ou ordem entre migrações, SQL ausente do diário ou número 0041 não reconciliado.
- \`invalid_houses>0\` no pré-voo, ou fichas de posse/projeto sem referência canônica.
- RPC administrativa executável por usuário comum, dados privados expostos ao anônimo ou trigger de outbox ausente.
- Idempotência falhando; operações de publicação reexecutando receita, sorte, construção ou unidade.
- Falta de backup restaurável, divergência na data oficial ou migração parcialmente aplicada.
- Qualquer alteração inesperada em missivas, exércitos ou valores econômicos.

## 5. Evidência coberta pelo CI deste lote

O CI verifica os scripts de release por testes Node, audita a consistência do manifesto de PRs, executa SQL/RLS e testes anteriores em PostgreSQL descartável, testa frontend/Vitest/TypeScript e compila o site. Publica apenas um resumo agregado de prontidão, **sem dados sigilosos**.

A etapa informativa \`temporal-release-readiness --report\` **não é uma falha do CI** quando mostra \`NO_GO\`. O CI pode legitimamente ficar verde com a **produção bloqueada**, porque as duas noções são independentes.

## 6. Critérios de aceite do Lote 14

- [x] Consolidar tecnicamente migrações, contratos, integração de PRs, CI e requisitos operacionais em um único relatório.
- [x] Garantir negação por padrão e impossibilidade de autorizar implantação via script.
- [x] Validar consistência de SHA, ambiente, temporalidade das evidências e rejeitar hashes divergentes.
- [x] Integrar testes automatizados e resumo de bloqueios ao workflow.
- [ ] CI final da PR aprovado.
- [ ] Inventário real fornecido e migrações reconciliadas.
- [ ] PRs anteriores integradas com revisão humana, sem duplicidade.
- [ ] Homologação, backup e janela de manutenção aprovados separadamente.
- [ ] Autorização específica de implantação por pessoas responsáveis.

**Conclusão:** Lote 14 prepara o corte e evidencia por que **a implantação continua bloqueada**. Não altera a data atual do jogo, ficha de nobres, economia, construções, missivas ou tropas.
