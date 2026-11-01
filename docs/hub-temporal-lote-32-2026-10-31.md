# Lote 32 — autorização do Narrador imediatamente antes de comandos

**Base:** PR #157, Lote 31. **Data:** 31/10/2026.

O Narrador pode permanecer com telas do calendário e de revisões abertas depois que seu cargo é revogado. Os RPCs do banco já exigem privilégios, mas a interface não conferia novamente o cargo antes do envio.

Foi criado `requireFreshNarratorAccess()`, que consulta o RPC canônico `is_campaign_admin` imediatamente antes das seguintes ações:

- Salvar ou excluir um evento em rascunho.
- Publicar uma data oficial ou eventos.
- Confirmar ou dispensar uma entrega temporal com justificativa.
- Solicitar replay de uma entrega em modo somente leitura.

Se o RPC falha ou retorna falso, o comando **não é enviado** e a interface comunica a falta de permissão. A autorização do servidor, a versão otimista do calendário, a idempotência do comando e a política RLS permanecem obrigatórias. A checagem de frontend é pré-voo, não concessão de permissões.

O teste de publicação simula cargo válido no momento da prévia e revogado antes do clique, exigindo zero chamadas ao RPC de publicação. Testes adicionais validam a política de erro e a presença dos guardas em todas as quatro ações.

**NO_GO em produção:** 27 migrações sem registro no journal Drizzle e homologação de backup real autorizado ainda pendentes. Nenhuma alteração foi aplicada ao banco real.
