# App: costura de autenticação (Firebase Auth)

Primeira peça da integração do app. **Nada disso está ligado**: `src/start.ts` continua usando `attachSupabaseAuth`, e o app segue em Supabase.

- `src/integrations/auth/token-provider.ts`: interface `AuthTokenProvider`, `selectAuthBackend` (só o valor exato `firebase` escolhe Firebase; o padrão é Supabase) e `bearerHeaders`.
- `src/integrations/auth/firebase-rest-auth.ts`: cliente de Firebase Auth sobre os endpoints REST (login por e-mail e senha, renovação do ID token com margem de 60 s, uma renovação por vez, rotação do refresh token). Sem dependência nova; aponta para o Auth Emulator com `emulatorHost`. Refresh rejeitado encerra a sessão; erro de rede a mantém.
- `auth-seam.test.ts`: testes com `fetch` simulado.

Próximos passos: verificação do ID token no servidor (hoje o middleware valida JWT do Supabase), adaptador por domínio e a troca do `attachSupabaseAuth` atrás da trava, sempre com testes E2E por papel.

## Anexador de bearer

`src/integrations/auth/bearer-attacher.ts` escolhe o token pela trava (`selectAuthBackend`) e não cai no outro backend quando o escolhido falha. Não está registrado em `src/start.ts`.
