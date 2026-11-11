# Migração total Cormyr → Vercel + Supabase independente

**Estado: preparação somente leitura; NO-GO para corte.** Este documento não indica que dados privados já foram exportados. A aplicação atual no Lovable e o banco original não devem ser apagados, redefinidos ou modificados por rotinas de testes.

## Objetivo e inventário obrigatório

Migrar **a instância real** (não apenas as migrations presentes no GitHub): Auth (incluindo `auth.users`, identidades e hashes de senha), vínculos das Casas, fichas e recursos, missivas e respostas históricas, anexos, imagens internas, personagens, calendário, espionagem, batalhas e eventuais arquivos privados. As senhas em texto puro **não devem** ser lidas ou exportadas; os hashes existentes devem ser preservados por um método oficial compatível com a versão do Auth.

Banco original identificado no código: Supabase ref `qkdznngbkwodsbpkpoax`, hoje vinculado ao Lovable Cloud. As rotas já publicadas na Vercel não provam migração de dados.

## Gate 0 — autorizações e origem acessível

- [ ] Credenciamento administrativo da equipe Vercel `cormyr` autorizado **pelo dono**, sem compartilhar tokens em chat.
- [ ] Banco Lovable Cloud reativado com acesso autorizado a exportação completa, **ou** suporte forneceu backup verificável. Não recriar a instância para contornar suspensão.
- [ ] Controle de migrações aplicado versus repositório reconciliado: há scripts fora do diário Drizzle; proibir `drizzle push` indiscriminado.
- [ ] Criado Supabase **separado** para destino, com orçamento, controle de acesso e região adequada.
- [ ] Confirmação de que nenhum usuário mudará senha/email/ID. Login no novo projeto pode exigir **nova sessão**, mas não redefinição de senha se a importação completa dos hashes funcionar.

## Gate 1 — exportação protegida

1. Capturar snapshot read-only de contagens no **banco de origem**, via operador autorizado. Não enviar relatórios contendo contagens privadas a CI público.
2. Gerar backup lógico/gerenciado da origem com os mecanismos oficiais Supabase para **roles, schema, data, auth e histórico de migrações**. Incluir extensões, customizações de RLS, funções, triggers, políticas, grants e esquema `auth`. Atenção: há diferenças entre backups lógicos e `Restore to a new project`; não presumir que o recurso de clonagem esteja disponível no Lovable Cloud.
3. Migrar separadamente **os bytes reais de Supabase Storage**. Um `pg_dump` da tabela `storage.objects` exporta **metadados**, não os arquivos. Preservar os caminhos, nomes, tipos, buckets, privacidade, políticas e vínculos de anexos; comparar contagem, tamanho e hashes dos bytes por objeto em ambiente privado.
4. Versionar somente manifestos **sem segredo**. Dumps, arquivos, tokens, chaves JWT, hashes de senha, e-mails e missivas nunca entram no GitHub ou em logs de CI.
5. Guardar backups criptografados com controle de acesso e teste de restauração.

Documentação oficial:
- https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore
- https://supabase.com/docs/guides/platform/clone-project
- https://supabase.com/kb/troubleshooting/migrating-auth-users-between-projects
- https://supabase.com/docs/guides/platform/migrating-within-supabase/dashboard-restore

## Gate 2 — restauração em destino isolado

- [ ] Restaurar Auth e relações com **IDs originais**, sem recriação de usuários.
- [ ] Verificar que as senhas originais funcionam em **contas de teste autorizadas**; não testar com dados pessoais do Narrador em automações.
- [ ] Configurar URLs/keys novas Supabase apenas nas configurações de ambiente apropriadas da Vercel. Chave service-role é estritamente server-only.
- [ ] Recriar configurações de Auth (redirect URLs, OAuth, SMTP, MFA), Realtime, Edge Functions, Storage e cron que **não** são copiadas automaticamente.
- [ ] Confirmar políticas RLS antes do primeiro login de teste; narrador, jogador e não autenticado devem continuar isolados. Não habilitar temporariamente SELECT público em dados privados.
- [ ] Substituir ou desativar explicitamente integrações dependentes do gateway Lovable (Drive) antes de considerar produção.
- [ ] Registrar fonte/destino e hash criptográfico dos artefatos de backup no cofre operacional (não no repositório).

## Gate 3 — verificação de contagens sem exposição

O script `scripts/full-migration-inventory.mjs` é **somente leitura**, consulta uma lista fixa de tabelas e não exibe conteúdo privado.

Rodar localmente, em shell seguro, com variável de ambiente definida no cofre de credenciais do operador:

```sh
# Primeira execução: somente no banco de origem autorizado.
node scripts/full-migration-inventory.mjs --snapshot > /caminho/privado/origem.json

# Segunda execução: configurar URL do banco restaurado, separadamente.
node scripts/full-migration-inventory.mjs --snapshot > /caminho/privado/destino.json

node scripts/full-migration-inventory.mjs --compare \
  /caminho/privado/origem.json /caminho/privado/destino.json
```

**Atenção:** `CORMYR_MIGRATION_AUDIT_DATABASE_URL` deve vir do mecanismo seguro de ambiente, não da linha de comando, e precisa permitir SELECT inclusive no esquema `auth` para auditar usuários. Se houver acesso negado, parar; nunca enfraquecer RLS/grants em produção para fazer passar.

Contagens idênticas **não** provam igualdade de hashes de senha, conteúdo de cartas, RLS, arquivos Storage ou integridade de relações; precisam de testes transacionais e manifestos criptográficos privados adicionais. Mesmo que `aggregate_counts_match=true`, o script retorna `cutover_authorized=false`.

## Gate 4 — aceite funcional e corte controlado

- [ ] Testar login de Narrador, jogador e contas sem permissão; alternar Casa não altera autorização.
- [ ] Conferir missivas recebidas/enviadas, respostas, destinatários, anexos, exclusões e histórico de datas.
- [ ] Conferir todos os buckets privados e imagens nas fichas/cartas; links assinados continuam protegidos.
- [ ] Conferir espiões, missões em andamento, fichas militares, batalhas, logs e HUB Temporal sem **avançar o relógio em produção**.
- [ ] Validar rotas SSR/API, WebGL, ativos estáticos, erros, cache, limites de funções e acessos do Drive.
- [ ] Estabelecer uma janela de congelamento de escritas, exportar delta final, restaurar e comparar novamente; testes de escrita só no destino isolado.
- [ ] Só após aprovação explícita, publicar variáveis e domínio de produção. Manter origem intacta para rollback e impedir escrita simultânea em dois bancos.
- [ ] Planejar retomada em caso de erro sem perder missivas produzidas após o corte; rollback não é simples se houver gravações novas.

## Estado desta preparação

A configuração inicial Vercel existe em PR #370. O primeiro deploy Preview não comprova restauração do banco. O script deste lote não acessa produção automaticamente e **não** transfere senhas, mensagens, imagens ou anexos por si só.

**Status oficial: NO-GO até existência de um backup legível e autorização administrativa Vercel, restauração isolada validada e aprovação do corte.**
