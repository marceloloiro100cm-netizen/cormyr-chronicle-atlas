# Hub Temporal de Cormyr — Lote 5: Interface e sincronização pública

**Data:** 31/10/2026 · **Base:** Lote 4 (PR #130).  
**Âmbito:** apresentação do relógio canônico, sincronização de leitores autenticados e projeção mínima do dia publicado ao Atlas anônimo.

## 1. Central Temporal do Narrador

A rota autenticada de administração mantém a seção `calendario` (identificador estável); o menu passa a exibir **Hub Temporal**. A tela exibe:

- resumo da **data oficial**, désdia atual ou festival, estação, versão e status da assinatura;
- links de navegação para **Comando e prévia**, **Eventos oficiais**, **Histórico** e **Visão dos jogadores**;
- controles de avanço, correção extraordinária e publicação de eventos **reutilizando o RPC transacional do Lote 4**;
- alerta quando a versão consultada diverge da versão-base do formulário, com bloqueio de publicação e ação de atualização;
- prévia de consequências e histórico exclusivos do Narrador, sem expor conteúdo privado aos jogadores;
- layout responsivo para dispositivos menores.

Os controles de escrita continuam restritos ao Narrador. Não há botão que avance o relógio para jogadores e nem se altera uma data histórica ao simplesmente visualizar sua página.

## 2. Cabeçalho e calendário autenticados

O cabeçalho do Conselho mostra o **período oficial completo**, por exemplo: 2ª désdia · Hammer · 1522 CV, em vez de somente o ano. O calendário do jogador e o painel do Narrador seguem a única chave `['campaign-calendar']` do Lote 3.

A assinatura Realtime passa a ser **multiplexada por QueryClient**. Cabeçalho, calendário e painel do Narrador utilizam um único canal por sessão; um último consumidor o desassina. Na recepção de atualização, as consultas do relógio, eventos publicados, rascunhos do Narrador, histórico e interfaces de Casa são invalidadas. Na reconexão, os dados são buscados novamente. Se a conexão em tempo real falhar, a leitura autenticada mantém o polling de **15 segundos**. A mensagem visual indica esse estado, sem prometer conexão ativa quando não estiver confirmada.

A data do narrador nunca é substituída silenciosamente durante uma edição. Se a versão mudar, o botão de confirmar é bloqueado até revalidar a prévia.

## 3. Data oficial no Atlas público

O Atlas em `public/cormyr/index.html` é HTML/JS estático e não deve exigir login apenas para mostrar a data do Reino. A migração **0061_public_campaign_time_projection.sql** cria o RPC `get_public_campaign_time()`:

- função SQL `SECURITY DEFINER`, com `search_path` fixo;
- execução explicitamente permitida para `anon` e `authenticated`;
- resposta contendo **exatamente** `year`, `month`, `day`, `festival` e `version`;
- nenhum acesso anônimo direto a `campaign_calendar`, `campaign_time_operations`, missivas, eventos em rascunho, Casas, auditorias ou personagens;
- nenhuma alteração do calendário ou eventos em produção.

A rota `GET /api/public/time` usa chave **publicável**, sem JWT do usuário e sem service role; valida e transforma o resultado em `date`, `label` e `period` legíveis. O `Cache-Control: no-store` evita um ano antigo por cache. Erros retornam apenas aviso genérico 503, sem mensagens internas.

O script estático `public/cormyr/campaign-time.js` consulta a rota pela **mesma origem**, com `credentials:omit` e `cache:no-store`, no carregamento, a cada **30 segundos**, ao voltar à aba e ao recuperar o foco. Ele escreve somente `textContent`, não interpreta HTML vindo do servidor e não usa nenhuma senha, JWT ou storage. Falhas não mostram ano fictício. A etiqueta fixa `1522 CV` que representava o **presente** na barra lateral foi substituída, mas os textos históricos que documentam acontecimentos de 1522 permanecem intactos.

**Limite deliberado:** o Atlas público recebe a **data oficial**, não recebe lista privada de agendas nem missivas. O catálogo histórico, suas imagens e textos anteriores continuam como acervo histórico. Em páginas públicas, a data dinâmica é o indicador central no menu lateral.

## 4. Testes e critérios

O CI aplica a nova migração no PostgreSQL descartável e executa `scripts/test-public-campaign-time.sql`:

- permite ao visitante anônimo consultar exclusivamente a data já publicada;
- comprova que o visitante não possui SELECT sobre a tabela de calendário nem histórico;
- garante que a projeção contenha somente cinco campos;
- verifica publicação do Narrador, festival Shieldmeet e propagação de ano ao visitante;
- comprova que preview, comandos e auditorias permanecem inacessíveis aos anônimos.

Os testes de aplicação incluem:

- `src/test/public-campaign-time.test.ts`: validação estrita do snapshot, festival e remoção dos metadados privados;
- `src/test/calendar-realtime-shared.test.tsx`: somente um canal para vários consumidores autenticados, reconexão/fallback e limpeza;
- `scripts/public-calendar-time.test.mjs`: HTML estático sem ano presente fixo, consulta pública sem credenciais, contrato SQL de mínima exposição;
- testes anteriores de calendário, Narrador, representação administrativa e Casa não podem regredir.

## 5. Implantação coordenada e pendências

**Nenhum deploy ou DDL de produção foi executado.** O PR do Lote 5 depende do Lote 4 (#130), que depende do Lote 3 (#128) e Lote 2 (#127). Publicar a rota pública sem aplicar a migração 0061 produz um erro 503 seguro: a data pública aparece indisponível. A implantação deve conciliar as migrações em produção identificadas no Lote 1, confirmar backup restaurável, aplicar a migração 0060 antes do frontend do Hub, aplicar 0061 e publicar a versão aprovada do aplicativo de forma coordenada.

A projeção de idades a partir de datas de nascimento, o cadastro canônico dos nobres, efeitos econômicos por ano, projetos e integração com todos os consumidores privados seguem os Lotes 6 a 10. O Lote 5 **não envelhece personagens nem altera históricos**.

## 6. Critérios de aceite operacional após implantação

1. Narrador publica avanço de uma désdia e confirma a versão; ambas as interfaces autenticadas exibem o novo período sem recarregamento manual.
2. Um navegador anônimo vê a nova data no Atlas via `/api/public/time` sem receber qualquer informação privada.
3. Se o socket falhar, o Conselho se atualiza em até um ciclo de polling; se o endpoint público falhar, a barra lateral explicita a indisponibilidade sem voltar a 1522.
4. O ano histórico de acontecimentos anteriores permanece inalterado.
5. Cada canal Realtime da mesma sessão é compartilhado entre os componentes.

A execução destes testes operacionais **contra produção** depende de implantação autorizada e ainda não pode ser declarada realizada.
