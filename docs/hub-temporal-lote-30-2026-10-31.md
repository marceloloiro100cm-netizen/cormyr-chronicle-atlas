# Hub Temporal Cormyr — Lote 30: portão de regressão da segurança das sessões

**Data:** 31/10/2026 · **Base:** Lote 29, PR #155  
**Natureza:** auditoria estática de código e testes de cenários adversos em CI, sem operação na produção.

## Objetivo

Consolidar uma proteção automatizada sobre as entregas dos lotes 26–29 e exigir que futuras mudanças não removam silenciosamente:

- a limpeza total dos caches privados e desmontagem de componentes na troca de identidade;
- o acompanhamento de alteração de cargo, vínculo ou edição durante sessões existentes;
- a autorização da operação da Casa no início e imediatamente antes do commit;
- a conferência transacional do vínculo e da versão da ficha no banco;
- a rejeição de respostas privadas carregadas em um escopo antigo;
- as regressões SQL de isolamento de sessão e revogação de vínculos.

## Implementação

### Gate de segurança offline

O novo script `scripts/temporal-access-release-audit.mjs` inspeciona arquivos críticos do aplicativo, SQL versionado, workflow e testes de regressão em execução. Possui apenas `--report` e `--gate`.

As verificações cobrem raiz de autenticação, React Query, acompanhamento de escopo do Conselho, carregamento de missivas, fichas, processamento de operações, commit PostgreSQL e os testes SQL transacionais.

O modo `--gate` falha quando um marcador de proteção ou teste crítico é removido. Inclui também verificações de **ordem**, para evitar que um retorno de dados aconteça antes da última revalidação da permissão ou que o commit aconteça antes da última verificação de vínculo.

O resultado é legível por máquina e inclui os sinalizadores explícitos `real_database_tested: false`, `real_browser_sessions_tested: false`, `execute_migrations: false`, `authorize_merge: false`, `production_release_authorized: false`, `go_no_go: NO_GO`. Esses campos não são configuráveis por parâmetro e não servem como autorização.

### Testes adversos

`scripts/temporal-access-release-audit.test.mjs` introduz intencionalmente alterações em cópias de memória dos arquivos inspecionados:

1. remover a limpeza de cache no logout;
2. retirar a revalidação antes de gravar a ficha;
3. desativar a consulta periódica de permissões;
4. remover o portão de permissões antes de devolver o acervo;
5. suprimir um teste SQL obrigatório;
6. tentar executar os modos inexistentes `--deploy` e `--apply-migrations`.

O CI deve **reprovar** essas versões com falhas injetadas, mas aceitar o código protegido. Os testes reais de Vitest e PostgreSQL permanecem ativos.

### Integração ao workflow

A etapa `Hub Temporal active-session permission acceptance gate` é executada antes dos testes de componentes. Publica uma síntese de guardas e regressões no GitHub Actions e falha se o relatório indicar qualquer autorização produtiva.

A cadeia de PRs é atualizada até #155 como predecessora do Lote 30; a variante conflitante #129 permanece fora da sequência.

## Limites importantes

Uma busca estática por marcadores não substitui teste de navegador real e pode não identificar alterações semânticas mais sutis. A política RLS e os métodos privados do servidor continuam sendo a fronteira efetiva de autorização. O portão não cria um monitor externo nem valida dados de produção.

Há ainda **69 arquivos SQL**, **42 lançamentos no Drizzle journal**, **27 scripts fora do journal**, prefixo `0041` duplicado e necessidade de restauração de backup real autorizado. Essas pendências impedem concluir que o Hub Temporal pode ser integrado ou implantado em produção.

**Estado: NO_GO.** Sem merge, deploy, alterações em contas reais, data oficial, missivas ou dados da campanha. Os lotes 28–30 somente ampliam segurança e provas sobre o repositório de desenvolvimento.
