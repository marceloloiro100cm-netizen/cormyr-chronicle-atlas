# Cormyr — migração da recuperação de senha para Firebase

O portal /auth passou a usar Firebase Auth. Agora a tela /reset-password também usa apenas Identity Toolkit REST para confirmar códigos de redefinição enviados pelo Firebase.

A operação válida é o POST de accounts:resetPassword com oobCode e newPassword, usando apenas a chave pública do Firebase já configurada. O código não é gravado em Storage, Firestore, logs, cookie, fragmentos de navegação ou no repositório; a rota elimina o código do endereço após a leitura. Não aceita o antigo token Supabase no fragmento, não infere perfil/Casa do usuário e não cria sessão ao redefinir a senha. Em caso de sucesso, desconecta a sessão local e permite o login do zero em /auth.

A rota suporta um link de ação do Firebase dirigido a /reset-password?mode=resetPassword&oobCode=..., **caso essa URL de ação seja configurada no Console/Auth**. O manipulador de e-mail padrão do Firebase, no domínio do Google, pode executar a recuperação sem visitar esta rota. Não foi alterado domínio, template de e-mail ou configuração do Firebase.

A entrada no jogo continua condicionada ao perfil no Firestore, runtimes reconciliados e aceite Cloud real. Nenhum privilégio, IAM, conta, senha existente ou flag do projeto foi alterado por este commit. Testes cobrindo formato do payload, invalidez, ausência de sessão e remoção de Supabase.
