# Hub Temporal de Cormyr — Lote 26: isolamento entre sessões

**Data:** 31/10/2026  
**Base:** Lote 25, PR #151.  
**Estado:** alteração proposta em branch; nenhuma modificação em produção.

## Falha identificada

O root do aplicativo chamava `router.invalidate()` e `queryClient.invalidateQueries()` quando ocorria `SIGNED_IN` ou `USER_UPDATED`, mas **a invalidação não apaga resultados privados existentes**. Missivas, fichas de Casas, idades, dados do Narrador, outbox e cronologia podiam continuar no cache até a chegada de uma resposta ou a remontagem da interface. Além disso, `SIGNED_OUT` não limpava o QueryClient no listener central; o botão manual de logout era protegido, mas logout de outra aba, expiração e mudança de identidade mereciam uma fronteira única. O cabeçalho também podia apresentar a última data cacheada durante erro do RPC.

## Modificações

Em `src/lib/auth/session-boundary.ts`, uma máquina de estados simples classifica INITIAL_SESSION, SIGNED_IN, SIGNED_OUT, USER_UPDATED e TOKEN_REFRESHED. Uma **mudança efetiva de usuário**, logout ou atualização dos dados do usuário:

- Limpa **todo** o React Query cache via `queryClient.clear()`, cancelando consultas antigas e removendo resultados privados; não se limita a invalidar chaves.
- Incrementa `sessionEpoch` no root e remonta a subárvore privada via `<Outlet key={sessionEpoch} />`. Isso elimina estados locais de cartas, editores, formulários e seleções vinculadas à sessão anterior.
- Reavalia permissões de rota com `router.invalidate()`.
- Em logout ou mudança entre duas contas conhecidas, remove a seleção de Casa do sessionStorage e qualquer destino OAuth residual. Não apaga o armazenamento interno de tokens gerenciado pelo Supabase.

Na inicialização de uma aba nova ou renovação do token do **mesmo usuário**, a máquina não destrói repetidamente o cache. Se uma notificação de login chegar sem usuário autenticado válido, a política falha em modo fechado, descartando o cache.

O cabeçalho `src/components/campaign-shell.tsx` não mostra mais uma data antiga quando `useCampaignTime` está em erro.

### Representação administrativa do Narrador

`src/routes/_authenticated/jogadores.tsx` agora elimina todos os caches de Casas, missivas, relógio e outbox ao entrar ou sair de **Acessar como jogador**, preservando temporariamente somente a consulta `campaign-panel` da identidade administrativa que continua autenticada. A representação não altera a conta Supabase, mas muda o escopo de dados; o servidor continua aplicando suas próprias autorizações. A saída revalida o painel.

## Ensaios do Lote 26

`src/test/hub-temporal-session-boundary-lote26.test.ts` verifica mudanças A→B, logout, atualização de identidade, reconexão da mesma conta, token de outra conta, chegada atrasada de resposta privada, isolamento de representação e presença de limpeza/remontagem no root. Usa React Query real com dados sintéticos para provar que a cache não conserva as consultas antigas.

`scripts/test-temporal-session-isolation.sql` reproduz uma mesma conexão PostgreSQL descartável com JWTs alternados Narrador→Casa A→Casa B→Casa A→logout. Exige que cada pessoa veja apenas a sua carta entregue em Hammer de 1522, que a outra Casa não leia o histórico de correspondência, que nenhuma conta comum acesse a outbox do Narrador e que a identidade ausente não retorne as cartas de uma sessão anterior. Toda a fixture é encerrada por `ROLLBACK`.

O CI executa este cenário após as regressões de cronologia do Lote 25 e também executa todos os testes Vitest, TypeScript e build.

## Limites e riscos restantes

A limpeza é uma **fronteira de segurança no navegador**, não substitui RLS, autenticação real de cada RPC, políticas de armazenamento ou validação de permissão em operações administrativas. O mecanismo não previne captura de conteúdo que tenha sido salvo externamente pelo usuário; cada sessão ainda deve ser protegida pelas permissões do servidor.

A migração da campanha real permanece **NO_GO**: há 69 SQL históricos contra 42 entradas Drizzle, **27 arquivos fora do journal**, ordinal 0041 duplicado e ausência de restauração homologada de backup real autorizado. Nenhuma migration foi adicionada ou executada no Supabase de produção.

**Critério de conclusão deste lote:** todos os testes do CI no SHA final da PR, incluindo isolamento de identidade, RLS, TypeScript e build, precisam estar aprovados. A PR não deve ser mesclada automaticamente.
