# Cormyr Cruzada V3.5 — adjudicação oficial (revisão → aprovação → aplicação)

## Critério fundamental
**O treino V3.4 não tem vínculo entre as pilhas fictícias e as unidades oficiais.**
É proibido aplicar baixas da V3.4 às fichas reais. O fluxo V3.5 aceita **somente**
replays PTE-2.0 salvos pelo Narrador contendo unidades importadas da ficha real
(`source.kind='house-readonly'`) nos dois lados, uma casa oficial por lado.

## Procedimento de Narrador
1. Acesse `Módulo de batalha → Homologação oficial`, apenas após habilitar a flag de homologação.
2. Escolha um replay oficial **concluído**, salvo e cuja sequência seja reexecutável/verificável SHA-256.
3. O backend busca as duas fichas oficiais, compara seus números de versão com a captura anterior e guarda os **hashes congelados** e o relatório de combate.
4. Para **cada unidade**, o Narrador define manualmente o inteiro `baixas oficiais` entre zero e as baixas táticas observadas, com justificativa de pelo menos dez caracteres. O valor NÃO é preenchido automaticamente.
5. `Salvar decisões` atualiza um plano versionado com hash SHA-256 (CAS).
6. `Aprovar dossiê` congela o plano mediante confirmação explícita do Narrador. **Nenhuma ficha muda nesta fase**.
7. `Aplicar oficialmente nas duas casas` exige outro gesto explícito e uma segunda flag do servidor. O backend revalida JWT/narrador, replay, plano, origens e snapshots das casas; gera cópias com alterações SOMENTE de `Unit.casualties` e nota de auditoria.
8. Uma única função PostgreSQL bloqueia o caso e as **duas linhas de casas em ordem estável**, compara suas versões e JSON de origem e atualiza ambas + recibo de auditoria numa transação. Erro em qualquer etapa faz rollback integral. Repetição de mesma chave UUID responde como idempotente; chave diferente após aplicação é rejeitada.

## Segurança e escopo
- Migração isolada `docs/battle/sql/0079_battle_v35_adjudication.sql` (após 0076 e tabelas oficiais existentes).
- Tabelas de dossiês e recibos com RLS somente Narrador e sem `INSERT/UPDATE` concedido ao usuário; serviço técnico do servidor é o único escritor.
- Flags padrão **fechadas**: `ENABLE_BATTLE_V35_OFFICIAL=true` (com `VITE_ENABLE_BATTLE_V35_OFFICIAL=true`) permite revisar; `ENABLE_BATTLE_V35_APPLY=true` (com `VITE_ENABLE_BATTLE_V35_APPLY=true`) habilita exclusivamente a aplicação oficial **após aceite formal**.
- Nunca executar migration ou flags em produção sem backup, restauração ensaiada, teste com dois JWTs reais, revisão dos parâmetros de perdas e aprovação expressa do Narrador.
- Se ficha mudou depois da captura, a homologação é recusada. O Narrador precisa preparar novo replay; não rebasear automaticamente estados oficiais.
- Nenhuma alteração de `health`, `xp`, `training`, `resources`, `treasury`, `power`, `fortifications`, `calendar`, `noble ages`.
- A tabela de sobreviventes `resolveSurvivors` **não é chamada**. Nenhuma condição, graduação, destruição ou custo em Poder são inferidos da arena. Uma política futura precisa de aprovação própria.
- `casualties` são decisões manuais oficiais, não as baixas de treino convertidas automaticamente.

## Evidências de teste
- `src/test/battle-v35-official.test.tsx`: rejeita modelos, delimita duas casas, valida relatórios, limita perdas, garante imutabilidade e não usa `resolveSurvivors`.
- PostgreSQL descartável no GitHub Actions: `battle-v35-bootstrap.sql`, `0079`, `battle-v35-smoke.sql`. O teste injeta falha no segundo UPDATE e prova a reversão da primeira casa, do recibo e do status.
- CI não executa SQL de produção. A UI e a aplicação permanecem desativadas até homologação humana.

## Dependências de lançamento
PR #270 → #271 → #272 → #273 (remoto) → esta PR V3.5. Depois da integração ainda é preciso publicar o Lovable e inspecionar a versão realmente em produção.
