# Missivas — etapas 1 e 2

## Alterações
- Leitura considera respostas entregues de outros autores, inclusive em conversas iniciadas pelo usuário.
- Respondida exclui rascunhos, respostas programadas e mensagens do próprio remetente.
- Rascunhos e Programadas incluem respostas nesses estados dentro de conversas entregues.
- Rascunhos de missiva podem ser retomados pelo autor com controle otimista de versão; respostas em rascunho podem ser editadas.
- A prévia de resposta consulta a mesma função de semana usada pelo envio e pela publicação do rascunho.
- A abertura/fechamento e os envios usam o mesmo bloqueio transacional.
- A autorização de respostas exige acesso à missiva principal e conta ativa. Anexos usam essa regra via RLS.
- O Drive consulta a autorização central para o proprietário da pasta. Missivas são exportadas somente quando entregues, em pastas individuais ou do Narrador; novas cópias de missivas em pastas compartilhadas ficam bloqueadas.
- Novas missivas recuperam assunto/texto não enviados ao remontar o formulário na mesma sessão da página. Não há persistência do texto em armazenamento local; recarregar a página pede confirmação. Arquivos selecionados precisam ser anexados novamente se o formulário for desmontado.
- O Narrador pode consultar os recibos individualmente; o filtro Minha leitura se refere à leitura do usuário atual.

## Implantação
1. Aplicar a migração aditiva `drizzle/migrations/0035_missivas_lifecycle_and_audience.sql` pelo mecanismo de migrações do ambiente conectado.
2. Publicar o frontend e o servidor deste commit após a migração. A aplicação passa a chamar novos RPCs; apenas sincronizar arquivos no Lovable não comprova que o SQL foi aplicado.
3. Verificar com duas contas de teste: resposta recebida em enviada, editar rascunho duas vezes, publicar, encerrar semana, acesso de outra casa e anexos.
4. Validar uma exportação em pasta de teste aprovada. A regra nova não apaga cópias históricas que já existam no Drive; revisar permissões dessas pastas separadamente.

A migração não remove missivas ou histórico e não altera a semana aberta. Em reversão do frontend, manter a migração de segurança; não restaurar políticas permissivas.

## Validação automática
O job `mail-database` cria PostgreSQL descartável, aplica todas as migrações e executa `scripts/test-mail-permissions.sql`. Não usa credenciais de produção. Verifica auditoria de rascunhos, conflito de versões, publicação, leitura repetida, RLS de usuários/casas, anexos, exclusão e equivalência da autorização do Drive.

O job habitual mantém validação do acervo, testes Vitest e build. Os testes legados dependentes de credenciais continuam separados; nunca executar o teste antigo que modifica rodadas globais em produção.

## Fora deste lote
Múltiplos destinatários, corte, unidades, novos filtros e paginação permanecem para as próximas etapas. Nenhuma seleção destes campos foi adicionada.
