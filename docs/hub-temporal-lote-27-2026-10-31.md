# Hub Temporal de Cormyr — Lote 27: revogação de vínculos e permissões em sessão ativa

**Data:** 31/10/2026  
**Base:** Lote 26, PR #152  
**Escopo:** Conselho dos jogadores, autorização de Casas e cargo de Narrador. Implementação somente em código e testes de banco descartável; nenhuma migração nova.

## Problema constatado

O Lote 26 limpa caches quando a identidade do Supabase muda. Porém, um administrador pode revogar uma Casa, retirar edição de atributos, inativar um jogador ou remover permissões de Narrador **sem trocar a identidade Supabase nem produzir evento auth no navegador**. Nesse caso, o painel e os módulos de calendário/missivas continuavam com cache e componentes React montados da permissão anterior até uma atualização eventual.

O servidor já mantém verificações próprias de autorização e RLS: a correção não substitui essas salvaguardas. O objetivo é remover prontamente os **dados apresentados na tela**, reinicializar formulários e impedir que o browser trate o direito anterior como atual depois de detectar uma mudança.

## Implementação

### Consultor de escopo da sessão

Arquivo `src/lib/auth/campaign-access-scope.ts`:

- Consulta apenas a identidade `getUser`, o RPC `is_campaign_admin`, o registro do jogador (ativo, troca obrigatória de senha) e suas próprias permissões de `house_memberships`, sob o JWT corrente.
- Não consulta nem publica nomes de outros jogadores, conteúdos das missivas, fichas ou dados do patrimônio.
- Calcula uma assinatura determinística das permissões, independente da ordem das Casas. Detecta vínculo excluído/adicionado, alteração de `can_edit`, `can_edit_attributes`, desativação ou promoção/rebaixamento administrativo.
- Qualquer erro de autenticação, leitura da função ou vínculo é tratado como indisponibilidade do escopo; não se deve permitir continuidade com uma resposta antiga.
- Faz somente leitura; não muda vínculos, cargos, relógio ou recursos.

### Comportamento do Conselho

Em `src/routes/_authenticated/jogadores.tsx`, a área reservada passa a exigir uma verificação de escopo atual para ser exibida, por meio de `['campaign-access-scope']`. Essa consulta é refeita **a cada 15 segundos enquanto o componente estiver ativo**, ao retomar a janela e ao recuperar conectividade.

Ao constatar mudança de permissão, o aplicativo:

1. Substitui o acervo privado pelo estado temporário “Verificando permissões atuais da campanha…”.
2. Elimina todas as demais consultas do React Query — inclusive missivas, fichas, indicadores e data oficial — antes de exibir o novo acesso, mantendo somente a consulta do próprio escopo.
3. Remove a seleção local de Casa e remonta o componente do Conselho com uma chave da nova assinatura de permissão, descartando formulários locais, editores e rascunhos transitórios.
4. Recarrega dados do servidor com as autorizações atuais. Uma identidade inesperada no resultado do painel bloqueia a exibição.
5. Em erro de verificação, o Conselho mostra um aviso de bloqueio e um botão para tentar novamente; não reutiliza a ficha da sessão anterior.

O evento Realtime existente do Conselho invalida também a consulta de escopo, mas **não depende exclusivamente do Realtime**: após revogar uma linha, o canal pode não transmitir o evento ao antigo autorizado por causa de RLS. O polling oferece recuperação, sem alegar revogação instantânea universal.

**Janela de sincronização:** até a próxima notificação Realtime disponível, foco de aba ou consulta periódica de 15 segundos, além dos atrasos de rede. O servidor precisa validar a permissão **em toda operação e leitura privada**; a checagem do frontend não é um mecanismo de autorização nem elimina completamente o risco de dados já exibidos antes da detecção.

### SQL de regressão

Arquivo `scripts/test-temporal-membership-revocation.sql`, executado em PostgreSQL 16 descartável dentro de transação com `ROLLBACK`.

O teste cria Narrador, dois jogadores, duas Casas e uma ficha sintética. Sem alterar o JWT de nenhum usuário:

| Etapa | Contrato exigido |
| --- | --- |
| Membro autorizado da Casa A | Leitura e edição da própria Casa, sem permissão para Casa B |
| Administrador desativa `can_edit` | Consulta continua possível, edição negada |
| Administrador revoga o vínculo | Leitura/edição por `in_campaign_house` negadas |
| Casa B não afetada | Jogador B conserva vínculo, jogador A não herda acesso |
| Administrador restaura leitura | Acesso de leitura volta; edição permanece negada |
| Administrador restaura edição | A permissão passa a ser reconhecida em nova verificação |
| Administrador remove cargo de Narrador | `is_campaign_admin` retorna falso no mesmo JWT; RPC privados e publicação do calendário são negados |
| Final | Sem publicações de data, pagamentos, recrutamento ou mudanças na ficha |

O teste SQL usa identidades fictícias, acessos sob `authenticated` e alterações efetuadas por contexto de instalação local isolada. Não testa diretamente uma interface real em navegador nem modifica contas reais.

### Testes da aplicação

`src/test/hub-temporal-access-revocation-lote27.test.ts` cobre assinatura determinística, revogação, redução de direitos, promoção/rebaixamento, erro de consulta, descarte de caches privados e os pontos de bloqueio do componente. Executado pela suíte Vitest do CI.

## Limites e requisitos de homologação

- Revogar vínculo de Casa não deve ser confundido com revogar automaticamente o histórico de uma **correspondência pessoal** entregue a um usuário; essas regras de acesso dependem das políticas específicas do servidor e devem ser auditadas separadamente. Este lote força uma nova leitura e impede reaproveitar conteúdo cacheado de permissão anterior.
- Não foi criada assinatura de eventos que contorne RLS, endpoint de leitura anônima ou nova permissão de administração.
- A troca de identidade do Supabase permanece tratada pelo Lote 26, que limpa **todo** o QueryClient e remonta a raiz.
- Revogação de cargo e vínculos é validada no banco no instante da nova chamada. Um frontend isoladamente não pode impedir leitura de conteúdo que o jogador já tenha visto ou copiado.
- A cadeia de PRs está empilhada e a variante concorrente #129 continua excluída.

**Status: NO_GO para produção.** Persistem a conciliação de 27 migrações históricas fora do diário Drizzle (69 SQL versus 42 entradas, com ordinal 0041 duplicado) e a exigência de backup real restaurado em homologação autorizada. Nenhuma mudança na `main`, no Supabase real ou nos dados de jogadores foi autorizada por este lote.
