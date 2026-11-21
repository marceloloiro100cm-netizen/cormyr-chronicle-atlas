# Relatório de implantação — Espionagem V3: Mesa de Inteligência Operacional

**Projeto:** Atlas de Cormyr  
**Data:** 21/11/2026  
**Escopo:** área exclusiva do Narrador / Dossiês de Espionagem  
**Origem:** protótipo Gemini «Espionagem V2 · Mesa de Inteligência Operacional» e auditoria técnica posterior  
**Destino:** branch `feat/espionagem-v3-mesa-operacional-20261121`, via GitHub.  
**Situação na abertura deste relatório:** alterações implementadas na branch; implantação em produção e homologação end-to-end ainda NÃO confirmadas.

## 1. Objetivo

Preservar a proposta original de mesa única de inteligência, sem copiar os dados simulados da V2 nem substituir a lógica oficial. Reutilizar a central existente, os relatórios de dossiê, o arquivo de contraespionagem, o relógio Harptos e os onze mapas oficiais. Não alterar ficha de jogador, relógio, backend ou operações de produção sem uma implantação validada.

## 2. Alterações concretas

1. **Nova identidade da central:** título «Mesa de Inteligência Operacional», descrição clara do fluxo de trabalho e links internos para dossiês detalhados e incidentes.
2. **Indicadores clicáveis:** quatro contadores agora funcionam como filtros de Julgamento, Em andamento, Dossiês pendentes e Concluídas. Os filtros usam as operações recebidas do serviço privado existente; nenhum número fictício do HTML original é importado.
3. **Alertas do HUB:** a data vem de `useCampaignTime`, a consulta compartilhada do calendário oficial. As missões em viagem com chegada ultrapassada, ou em investigação com conclusão ultrapassada, são sinalizadas com comparação cronológica Harptos; nenhuma missão avança por porcentagem ou timer.
4. **Cartografia:** novo painel consultivo com mapa geral e mapas detalhados das 11 regiões usando `SPY_NOBLE_DETAIL_MAPS`, `spyHouseMapPoint` e `CormyrInteractiveMap`. Origem/alvo só recebem marcadores quando existem âncoras identificadas. Nomes ambíguos (como Mareforte, que está em mais de um mapa) não são inferidos. Imagem e SVG compartilham a mesma proporção; ausência de imagem recua para o mapa geral. O usuário pode selecionar a operação pela lista e escolher a região.
5. **Julgamento explicável:** após a resposta autorizada do servidor, mostrar total dos dados, modificador, DC homologada quando retornada, graus de falha e melhorias aplicadas. Nunca recalcular DC no navegador, jamais permitir julgamento de status não elegível pelo novo mapa.
6. **Navegação/legibilidade:** grupos de ações acessíveis, foco por teclado, controles responsivos e textos legíveis; ligação da central aos painéis administrativos pré-existentes.
7. **Testes adicionados:** casos de regiões únicas/ambíguas, alinhamento do mapa, mudança de região, datas ausentes, prazos oficiais cruzando Midwinter e missões encerradas.

## 3. Reaproveitamento de recursos já existentes

- **Dossiês completos:** sete atributos de Recursos, registros históricos de Exército/Poses, atualização temporal, versionamento e auditoria administrativa permanecem em `spy-dossier-panel.tsx`, `spy-dossier-report.ts` e serviços existentes.
- **Consequências oficiais:** sucesso, fracasso, fuga, prisão, morte, evoluções, versões e idempotência continuam calculados pelo servidor; a V3 acrescenta apenas a explicação pós-resolução.
- **Contraespionagem:** `SpyNarratorIncidentHistory` continua sendo a origem dos incidentes; a V3 cria acesso rápido, não simula alertas.
- **HUB Temporal:** mantém consulta e sincronização oficial existentes, sem tocar na data global.

## 4. Arquivos

Novos:
- `src/components/house/espionage/spy-narrator-operational-map.tsx`
- `src/components/house/espionage/spy-narrator-operational-map.css`
- `src/test/espionage-v3-mesa-narrador.test.tsx`

Modificados:
- `src/components/house/espionage/spy-narrator-operations-center.tsx`
- `src/components/house/espionage/spy-operations-center.css`
- `src/components/house/espionage/spy-dossier-panel.tsx`
- `src/components/house/espionage/spy-narrator-incidents.tsx`
- `src/components/house/espionage/spy-narrator-resolution.tsx`
- `src/components/house/espionage/spy-narrator-resolution.css`

## 5. Segurança, integridade e dependências

- O painel novo consome apenas dados já autorizados para o Narrador; não lê diretamente fichas sigilosas ou tabelas privadas de outras Casas.
- Nenhuma missão, dossiê, espião, construção, conta, calendário ou evento real foi gravado/modificado neste trabalho.
- Nenhuma regra de jogo foi substituída. A dificuldade e os resultados continuam exclusivos do backend existente.
- Sem novos serviços externos, chaves ou dependências npm; sem tokens Lovable e sem Vercel.
- O mapa ilustra a região e a posição de estandartes; **não** afirma mostrar a localização real do agente. A consulta de operações atual não disponibiliza toda a sequência de trechos validados para desenhar um trajeto real.

## 6. Validação

**Preparado:** testes automatizados na branch e revisões estáticas dos componentes.

**A confirmar antes da produção:** testes Vitest e build no GitHub Actions; testes de navegação e desempenho em celular; validação real das permissões com Narrador e jogador; acesso aos 11 arquivos de mapa no domínio; conferência com o HUB corrigido; integridade da consulta de missões/dossiês; ausência de regressões na central anterior.

## 7. Etapas pendentes de implantação

1. Obter CI verde (testes, build, lint aplicável).
2. Homologar a nova mesa em ambiente de teste com sessão real de Narrador e ao menos uma Casa jogadora.
3. Comparar contagens/decisões/dossiês antes e depois, somente em leitura.
4. Aprovar o merge na `main`, que aciona o Firebase App Hosting configurado; confirmar rollout e execução no domínio.
5. Como projeto futuro, disponibilizar a rota registrada da missão na API do Narrador para desenho de trechos reais, nunca inferidos do mapa.

**Status:** código preparado em branch; não declarar «publicado» sem merge, CI e verificação do domínio.
