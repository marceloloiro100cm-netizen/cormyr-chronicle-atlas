# Lote 31 — identidade consistente durante leitura das permissões

**Base:** PR #156. **Data:** 31/10/2026.

A leitura `loadCampaignAccessScope` consulta identidade, cargo do Narrador, registro do jogador e permissões das Casas em chamadas distintas. Se uma troca de conta ocorrer durante esse fluxo, uma resposta atrasada não deve expor ao novo usuário o escopo composto sob a identidade anterior.

A função agora faz uma segunda chamada autenticada a `auth.getUser()` ao final e recusa retornar o escopo se a conta tiver mudado ou a sessão não estiver disponível. A política de cache, a RLS e a validação no servidor continuam sendo as camadas obrigatórias.

O teste de regressão simula duas identidades em uma mesma leitura de escopo e exige falha fechada. Tokens válidos mas com permissões alteradas **sem** troca de identidade continuam dependendo do polling, do React Query, das confirmações no servidor e das proteções dos lotes 27–30.

**NO_GO para produção:** permanecem a conciliação das 27 migrations SQL não registradas no Drizzle e o backup real autorizado pendente. Sem merge ou alteração real da campanha.
