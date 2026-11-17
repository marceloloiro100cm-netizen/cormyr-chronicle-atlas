# Cormyr — entrada principal agora usa Firebase (17/11/2026)

## Migração funcional sem Supabase
A rota pública /auth foi modificada para autenticar somente no Firebase Auth com o cliente REST já existente e sua sessão por aba, sem criar dependências, chaves privadas ou SDK adicional. O login leva para /firebase-access, que valida UID, perfil, Casas e demais recursos diretamente com o serviço Firebase protegido.

A seleção visual de perfil/Casa foi retirada do login porque jamais concedeu autorização. A identidade e a associação às Casas devem vir exclusivamente dos documentos de acesso do snapshot no Firebase, verificados pelas APIs do servidor. A rota não usa nem aceita JWT do Supabase, não grava perfil/role e não permite editar dados de campanha.

O link antigo com ?next= é analisado pelo validador legado para compatibilidade de URL, porém a sessão Firebase segue para a área Firebase; não envia o usuário para o painel antigo /jogadores que continua dependente de módulos legados. O catálogo público é informativo; sua indisponibilidade não impede tentativa de autenticação Firebase.

A recuperação de senha usa o endpoint público e já existente de Firebase Auth com uma resposta indistinguível para contas existentes/inexistentes. O cliente guarda refresh token apenas na sessão da aba, sem inseri-lo em URL, logs ou no repositório.

## Limites da implementação
Isso migra apenas a entrada /auth. A antiga /jogadores e funções administrativas legadas permanecem para substituição posterior, sem fallback automático de autenticação. A habilitação Auth de 14 contas não é autorização para jogar: os runtimes de Casas e Missivas seguem não provisionados, o conteúdo público revisado segue ausente e parte dos perfis está incompleta.

## Testes
src/test/firebase-main-login-route.test.ts verifica o uso exclusivo do Firebase, destino seguro, ausência da seleção de perfil/Casa, recuperação genérica e acesso independente do catálogo público. Confirmar Build e Validate e a revisão servida em App Hosting após a publicação.
