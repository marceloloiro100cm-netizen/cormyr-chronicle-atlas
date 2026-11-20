# Firebase, item 8: representação de jogadores

A sessão de representação preserva o login Firebase do Narrador. Não emite JWT de outra pessoa, não solicita senha do jogador e não amplia as permissões atuais da conta representada.

## Controles

- `start_campaign_representation` aceita somente jogador ativo, sem troca de senha pendente e com Casas ativas da temporada 2.
- A sessão vive em `campaignCloudRuntime/{snapshot}/representationSessions/{narratorUid}`, com expiração de 30 minutos, iniciada e encerrada pelo Narrador real.
- Cada leitura ou escrita refaz a checagem da sessão e da identidade atual de Narrador e jogador. Não confiar em Casa, playerId, token ou perfil enviado pelo navegador.
- `campaign_representation_action` responde a `read`, `save_record`, `send`, `draft`, `reply` e `delete`. Não permite responder diretamente a uma resposta histórica do correio nem reescrever/importar cartas antigas. A UI bloqueia respostas a missivas históricas até reconciliação.
- A leitura filtra Casas, registros, missivas e respostas usando o escopo do jogador. O Narrador não recebe dados da outra Casa pelo contexto representado.
- A gravação de registros usa versão otimista, histórico do item 6, checagem transacional da sessão e auditagem com `realActorUid` e `representedUid`.
- As missivas Cloud usam o mesmo mecanismo transacional de cota, destinatário, data do HUB e verificação da Casa do jogador. A autoria da representação e a auditoria são registradas no mesmo commit do envio.
- Toda operação mutável gera registro de auditoria em `representationAudits`, e as cartas seguem mantendo auditoria no próprio serviço de correio.
- O acervo importado continua imutável. Não existe integração com Supabase na implementação do Firebase.

## Homologação e ativação

1. Confirmar `campaignCloudRuntime/{snapshot}`: `status=active`, `private=true`, `applicationEnabled=true`, `sourceSnapshotReconciled=true` e `representationReadApproved=true`.
2. Confirmar a integridade de `accountAccess` e a existência de cada Casa ativa no `migrationDomainStage`.
3. Validar, com Narrador e dois jogadores de Casas distintas, leitura isolada, envio e cancelamento com data oficial do HUB, edição de registro, expiração, revogação e reinício de sessão.
4. Não ativar `CORMYR_FIREBASE_REPRESENTATION_ENABLED` antes da homologação acima. Não ativar `CORMYR_FIREBASE_RECORDS_ENABLED` somente para liberar esta funcionalidade: a escrita exige sua aprovação específica.
5. Após aceite, modificar apenas o `apphosting.yaml` pelo GitHub e confirmar o commit servido no Firebase App Hosting. Nunca usar Vercel ou tokens Lovable.

**Situação:** a flag de representação permanece `false` até o aceite; nenhum dado de produção foi alterado pela implantação de código.
