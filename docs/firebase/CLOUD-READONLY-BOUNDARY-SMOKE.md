# Auditoria pública das quatro APIs Firebase de leitura — 17/11/2026

Este lote testa se as APIs recém-expostas do Firebase Cloud chegam **aos seus próprios controles de acesso**, e não ao bloqueio legado genérico.

Rotas de leitura com contrato separado: simulação de construções, economia operacional, reconciliação da Casa (Narrador) e histórico do Tesouro. Cada uma deve devolver somente HTTP 503 com seu código de flag desativada ou HTTP 401 com `authentication_required`, sem credenciais. Retornar 503 com `legacy_backend_paused` é falha, pois significa que a rota de leitura não alcançou seu guard do Firebase.

Rotas de escrita/legado preservadas: aquisição de construções, ajuste de Tesouro e ponte de emulador. Elas devem continuar com HTTP 503 e `legacy_backend_paused` enquanto o site permanece em modo arquivo.

O script envia somente sete POSTs sem token, cookie ou dados de jogo, com uma ação impossível e um corpo JSON fixo. Respostas são limitadas a 512 bytes, códigos de erro são pré-definidos e nenhum documento privado é lido ou impresso. O workflow não concede permissões, não ativa usuários e não importa ou modifica dados.

Passar nos testes prova apenas isolamento e roteamento HTTP em um instante; não constitui prova de login real, prontidão de economia nem de isolamento entre duas Casas autenticadas. `readyForPlayers=false` e `readyForCutover=false` permanecem até as auditorias protegidas e homologação completa.
