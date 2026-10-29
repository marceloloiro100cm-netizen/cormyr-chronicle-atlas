# Conferência preliminar das posses — 29/10/2026

Base analisada: `cd9df368de4936e8715b8c2b55537695ce843ef3`.

## Limite da conferência

As fichas anexadas mencionadas pelo usuário não ficaram acessíveis nesta solicitação. Os resultados abaixo são dos estados codificados em `0041_seed_complete_noble_house_possessions.sql`, não de uma consulta ao banco de produção nem de uma comparação com as fichas originais. Nenhum saldo foi alterado.

## Cálculo reproduzido

O motor em `src/lib/house/engine.ts` calcula total = base + permanente (sem bônus regional adicional para importação); disponível = total − alocado − comprometido. Os estados desta migração não contêm alocações substitutas nem obras em construção, portanto a soma dos custos de alocação reproduz essa conta.

| Casa | Defesa | Influência | Terras | Lei | População | Poder | Riqueza |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ashkar | 0 | 30 | 1 | 30 | 5 | 0 | 1 |
| grantass | -1 | -1 | -15 | 2 | 5 | -9 | -16 |
| silversky | -5 | 6 | -23 | 15 | 25 | 1 | 27 |
| everlost | 0 | 0 | 0 | 40 | 29 | 0 | 0 |
| erdenor | 9 | -9 | -17 | 25 | 34 | 6 | 1 |
| fewmerry | -4 | 3 | -15 | 22 | 28 | -10 | -15 |

Grantass, Silversky, Erdenor e Fewmerry apresentam saldos negativos nesses dados. Isso pode indicar totais importados como saldos livres, posses duplicadas ou déficits históricos legítimos. A conta aritmética não resolve qual interpretação corresponde às fichas.

Há também custos históricos diferentes do catálogo atual: em Fewmerry, infantaria treinada tem Poder 5 (cotação atual 3 + 4 = 7), enquanto apoio treinado tem Poder 7 (cotação atual 3 + 2 = 5). Não recalcular custos históricos automaticamente: descontos e adaptações precisam de fonte.

## Migração existente e próxima conciliação

A migração 0041 usa correspondência parcial de nome com LIMIT 1 e substitui todo o estado existente em caso de conflito. Isso pode atingir uma casa ambígua e descartar operações posteriores. Não executar novamente como mecanismo de atualização.

Após receber as fichas:
1. Identificar cada casa pelo UUID e registrar arquivo/versão de origem.
2. Comparar totais, ajustes permanentes, posses, unidades, custos e saldos com o estado atual e o histórico.
3. Explicar cada divergência, distinguindo regras atuais de custos históricos.
4. Aplicar atualização transacional versionada com cópia do estado anterior, chave idempotente e lançamento de auditoria, preservando compras posteriores.
5. Conferir saldos após importação e verificar a aplicação no banco de produção separadamente do merge no GitHub.
