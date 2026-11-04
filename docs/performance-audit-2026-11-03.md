# Auditoria de desempenho e falhas — 03/11/2026

Escopo: revisão estática do repositório privado `Cormyr Chronicle Atlas` (acervo público, Conselho dos Jogadores, missivas, fichas das casas, armazenamento de retratos e integração temporal). **Não** inclui telemetria de produção, acesso ao banco real, perfil do navegador autenticado ou testes de carga. Números abaixo descrevem arquivos e código, não tempos medidos de resposta.

## Alterações de baixo risco nesta branch

1. **Missivas:** `ReplyForm` só consulta `reply_delivery_week` quando o formulário está aberto; o intervalo de 15 segundos permanece ativo durante a edição. Isso evita N consultas periódicas para respostas fechadas.
2. **Retratos privados:** `PrivateImage` só inicia `storage.download` quando a imagem entra no campo de observação com antecedência de 300 px; navegadores sem `IntersectionObserver` preservam o carregamento normal. Foi incluído `staleTime` de um minuto na consulta de imagem, sem ampliar o acesso permitido no servidor.
3. **Realtime do Conselho:** apenas alterações nas nove tabelas efetivamente lidas por `loadPanel` invalidam o índice pesado `campaign-panel`. A verificação de escopo/permissões continua disparada por qualquer evento e por polling próprio de 15 segundos. O canal do calendário, suas invalidações e as verificações RLS não foram alterados.
4. **Salvamento:** após uma operação, foi removida uma recarga completa redundante de `campaign-panel`; o painel ainda recarrega ao final, inclusive se a sincronização de pasta falhar.
5. Teste de regressão: `src/test/private-image-performance.test.tsx` verifica que retrato fora do campo visível não baixa e que existe fallback para navegadores sem observador.

## Mapa de achados e backlog

| ID | Severidade | Evidência | Impacto | Próxima ação |
|---|---|---|---|---|
| PERF-01 | Alta | `jogadores.tsx`: `postgres_changes` escuta o esquema `public` inteiro e havia invalidação indistinta de `campaign-panel` | Reconsultas de várias tabelas mesmo quando a alteração era alheia ao painel | **Mitigado** nesta branch; avaliar assinaturas filtradas após inventário da replicação e RLS |
| PERF-02 | Alta | `missivas-tab.tsx`: RPC `reply_delivery_week` com `refetchInterval:15000` em cada `ReplyForm` montado | Consultas periódicas de formulários fechados | **Mitigado** com `enabled:open` |
| PERF-03 | Média-alta | `campaign-content.tsx`: `PrivateImage` chamava `storage.download` logo na montagem | Download de retratos fora de tela e consumo de rede/memória | **Mitigado** por carregamento por proximidade |
| PERF-04 | Alta | `panel-data.ts`: `loadPanel` agrega casas, jogadores, vínculos, registros integrais, cartas, comprovantes, respostas, catálogos e rodadas; consulta escopo antes e depois por segurança | Alto payload/latência e custos durante recarga; `campaign_records.select('*')` não possui paginação explícita | Planejar consultas paginadas e por casa/aba sem retirar validações de escopo; ensaiar com grande volume |
| PERF-05 | Média | `jogadores.tsx`: `afterSave` recarregava painel antes e depois de sincronizar pasta | Latência e requisições duplicadas após salvamento | **Mitigado** nesta branch |
| PERF-06 | Média | `public/cormyr/assets/`: mapas PNG de ~2,8 MB a ~4,5 MB cada; alguns correspondem a versões regionais distintas | Carga lenta de mapas em conexões móveis | Criar miniaturas WebP/AVIF com versões integrais para baixar; conferir rótulos antes de substituir |
| PERF-07 | Média | `src/components/house/hub.tsx` importa muitos módulos especializados e catálogos, mesmo sendo exibida uma seção por vez | Possível custo de JS inicial e parse em dispositivos fracos | Medir chunks no build e introduzir `React.lazy` + `Suspense` gradualmente, com testes por aba |
| BUG-01 | Alta | `panel-data.ts` pagina cartas e recibos mas não `campaign_records` | Risco de truncamento silencioso se o limite de linhas do provedor for excedido | Consultar limites reais no banco, implementar paginação ou leitura por casa com testes de integridade |
| BUG-02 | A verificar | Usuário já relatou falhas de visualização de espiões, fotos e divergências de cadastro | Possíveis erros de consulta e consistência entre capacidades e agentes criados | Testes autenticados de Ashkar e de uma casa sem agentes, com banco de homologação |
| BUG-03 | A verificar | Integrações externas YouTube e NotebookLM dependem de permissões/embeds e links ativos | Reproduções bloqueadas e experiências de erro | Medir percentuais de erro em produção e validar links individualmente |
| SEC-01 | Alta para revisão | Arquivo `.env` aparece versionado no repositório privado | Possível exposição de segredos *caso* contenha chaves privilegiadas | Verificação privada dos nomes/tipos de chaves, remoção de segredos e rotação se necessário; não imprimir valores no relatório |
| OPS-01 | Bloqueio conhecido | Workflow de validação tem diagnósticos temporais `NO_GO` para alterações de produção dependentes de migrações | Não é possível inferir implantação segura apenas de build/testes | Conferir inventário/migrações e homologar separadamente; esta branch não modifica SQL |

## Verificações recomendadas antes da publicação

- Testes: `node --test scripts/*.test.mjs`, `bun run test`, `bunx tsc --noEmit`, `bun run build`.
- Perfis em dispositivos móveis: registrar TTFB, FCP, LCP, TBT/INP, JS inicial, peso das imagens, número de requisições, consultas Supabase por aba e tempo para abrir fichas/missivas.
- Fluxos obrigatórios: Narrador, jogador sem vínculo, jogador de uma casa, representação, troca e revogação de permissão, cronologia oficial, missivas entregues/rascunhos, espião inexistente e novo agente, construção e compra de posse, download PDF/Excel.
- Segurança: confirmar que cache de imagens privadas é descartado ao mudar sessão ou perder acesso; confirmar RLS no Storage e APIs sob contas com permissões distintas.
- Banco: `EXPLAIN ANALYZE` (homologação) de `mail_page`, `get_campaign_calendar`, acesso às casas e listagens de missivas, verificando índices e cardinalidade.

## Limitações e entrega

Esta revisão não mediu a lentidão em produção nem certifica zero erros. As otimizações estão propostas na branch de auditoria, sem merge, publicação ou aplicação de migrações. A aferição quantitativa e o aceite funcional precisam ocorrer na homologação com contas representativas. Não reduzir a frequência das checagens de acesso nem desabilitar regras RLS como atalho de desempenho.
