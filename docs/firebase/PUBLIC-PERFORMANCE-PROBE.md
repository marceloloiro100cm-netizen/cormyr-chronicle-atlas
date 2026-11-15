# Item 25 — Latência das APIs públicas, leitura anônima

Este probe complementar, executado pelo GitHub Actions após cada push na `main`, realiza **exatamente nove requisições GET** no domínio público `https://atlas.cormyr.com.br`: três para cada rota de calendário, catálogo de Casas e traduções (sem autenticação).

O teste mede tempo individual, p50 e p95 e verifica HTTP 200 JSON. Usa `redirect: manual`, `credentials: omit`, `cache: no-store` e timeout de 12 segundos. Não lê, grava nem imprime o corpo das respostas. Não usa API key, senha, JWT, cookie, token do Narrador, projetos Firebase Cloud ou operações de escrita.

O resultado mede **somente a latência vista pelo runner do GitHub**, variável conforme rede, aquecimento do backend e região. **Não** comprova capacidade com muitos jogadores, desempenho das missivas, segurança das contas, custo do Firestore, estabilidade ao longo de dias, ou equivalência dos serviços Firebase Cloud.

O workflow é informativo: resultados ruins aparecem como avisos para análise, não autorizam corte nem alteram uma campanha em andamento. Critérios de desempenho reais e limites financeiros precisam ser definidos e testados no ambiente de homologação com contas autorizadas, depois da importação de dados reconciliados.

Arquivos:
- `scripts/firebase-production-public-latency.mjs` — medição anônima de baixo volume.
- `scripts/firebase-production-public-latency.test.mjs` — prova de 9 GETs, ausência de credenciais, comportamento fail-closed e supressão de erros privados.
- `.github/workflows/firebase-production-acceptance.yml` — job `public-latency`.

**Estado do Item 25:** observação pública de baixo volume implementada; homologação de carga e custos Firebase Cloud ainda pendente. `readyForCutover=false`.
