# Aceite negativo anônimo no Firebase Cloud — 18/11/2026

O site publicado tem duas proteções independentes: (1) a barreira
`CORMYR_ARCHIVE_ONLY` fecha APIs ainda não liberadas; (2) as rotas Firebase
explicitamente excluídas da barreira exigem Auth e/ou flags de runtime.

A rotina `scripts/firebase/cloud-readonly-boundary-smoke.mjs` envia apenas
um `POST` anônimo de **ação impossível** para cada destino fixo, sem token,
cookie, corpo válido, segredo ou resultado privado; o limite de resposta é
512 bytes e somente códigos de erro estritamente permitidos são analisados.

- Quatro rotas de **leitura especial**: orçamento de construção, economia,
  reconciliação de Casa e auditoria de tesouro. Aceitam somente o erro
  específico de flag desligada HTTP 503 ou `authentication_required` 401.
- Três rotas **Cloud permitidas pelo router**: sessão/leitura, missivas e
  jornal. Mesma exigência de flag própria ou 401 sem credencial.
- Quatro rotas **interrompidas pela barreira archive-only**:
  construção, ajuste de tesouro, ponte antiga e tesouro Cloud. Aqui
  somente `legacy_backend_paused` 503 é aceito. Um 401 não prova que
  uma rota de escrita permanece realmente fechada.

A auditoria não aceita HTTP 200, 302, 400, erro genérico 503, HTML,
redirect, ausência de cache-control no-store ou mensagens contendo dados
privados. Não abre token de jogador, escreve carta, altera saldo, publica
edição ou acessa Firestore.

**Integração com deploy:** o teste local roda em PR e push; a execução
anônima no domínio acontece somente depois de a auditoria de App Hosting
confirmar a publicação do SHA da `main`. A liberação de jogadores
continua `NO_GO`: esse teste não substitui sessões reais de narrador,
editor, Casa A e Casa B nem gravação e recarga efetivas.

O workflow foi configurado para ser reexecutado quando qualquer uma
dessas rotas ou a barreira de arquivamento mudar. Não usar sistemas
legados para suprir falhas de publicação.
