# Correção do calendário antes do login — 06/11/2026

**Incidente:** visitantes anônimos viam respostas HTTP 401 do RPC privado `get_campaign_calendar` e do canal Realtime no cabeçalho de login. Separadamente, rotas `/api/public/*` usavam só `SUPABASE_URL` e `SUPABASE_PUBLISHABLE_KEY` do processo, que podem não estar disponíveis depois da remoção segura de `.env` (PR #290). O navegador foi corrigido no PR #292, mas os endpoints públicos exigiam a mesma resiliência.

## Contrato em produção
- `/auth`, recuperação e consentimento OAuth usam `PublicClock`, que lê `GET /api/public/time`, sem cookies nem sessão, valida o payload e exibe apenas período público publicado.
- Páginas autenticadas continuam `PrivateClock` com `useCampaignTime`, `get_campaign_calendar`, Supabase Realtime e checagens RLS originais. Os dados detalhados do Narrador e jogadores NÃO migram para rota pública.
- `/api/public/time`, catálogo, traduções, imagens e material do Narrador passam a usar fallback **somente para URL e chave publicável**, com prioridade das variáveis do host.
- As rotas privadas mantêm autorização (claims, is_campaign_admin) e o cliente administrativo continua EXIGINDO `SUPABASE_SERVICE_ROLE_KEY` no servidor; o fallback jamais concede bypass de RLS.
- No banco, `campaign_calendar` tem política SELECT somente para authenticated; o GRANT amplo para anon estava presente no banco de produção. A migração 0077 revoga direitos diretos de anon na tabela, deixando apenas o RPC público de cinco campos. Antes de executar em produção, verificar a versão e executar teste de aceite read-only de privilégios; o SQL é reversível por concessão administrativa, não modifica linhas.

## Aceite
1. Login/home carregam; login sem chamadas `get_campaign_calendar` nem canal de banco; data pública ou estado honesto de indisponibilidade.
2. `GET /api/public/time` responde para visitante sem cookies; sem missivas, casas, ano privado ou identidade do usuário.
3. Narrador e jogadores autenticados mantêm calendário privado com RLS, sem alterações de permissões de contas.
4. CRZ-1.0 permanece disponível somente no menu do Narrador; replay, combate e treinamento são locais/fictícios.
5. Run CI Vitest, TS, build, bancos descartáveis e smoke em produção. A existência do ambiente publicado não prova que todas as operações autenticadas foram verificadas sem contas reais.
