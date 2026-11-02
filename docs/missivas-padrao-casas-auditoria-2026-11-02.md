# Correspondência somente entre casas — auditoria de 02/11/2026

## Regra vigente
- Todas as **novas missivas** têm `recipient_house_id` preenchido e `recipient_player_id` nulo.
- O Narrador e os jogadores escolhem **casas** no formulário; não existem destinatários individuais nem opção "Narrador" no envio novo.
- A resposta permanece no fio da missiva; autenticação de jogadores e recibos de leitura continuam individuais por questões técnicas de permissão.
- O banco de produção utiliza o trigger `zz_house_only_mail_recipient`, definido pela migração `0072_house_only_correspondence.sql`, inclusive para APIs legadas.
- O conector MCP `escrever_missiva` e `opcoes_missivas` também restringem os destinatários às casas.
- Harcourt pertence a **Horselands**.

## Reconciliação de produção
- Identificados 19 pares exatos casa/jogador; abrangem as casas Erdenor, Everlost, Harcourt e Silversky.
- Validados conteúdo, assunto, autor, data de campanha, semana de criação e entrega, tipo, estado e data de entrega.
- Nenhuma das 19 cópias individuais tinha resposta ou consequência exclusiva.
- Os 2 recibos de leitura encontrados foram preservados na cópia por casa.
- As 19 cópias individuais foram arquivadas por `deleted_at`, com incremento de versão e sinalização de sincronização. **Nenhuma cópia por casa foi excluída.**
- Backup completo em `campaign_migration_backups` com `reason='house-only-mail-dedup-20261102'`. Não apagar sem auditoria.
- Atualizações de tombstone dos 19 registros enviadas à `sync_outbox`.
- 10 registros históricos dirigidos ao Narrador, sem duplicata comprovada, foram **preservados** e não são mais uma opção válida para criação de novas missivas.
- Os novos envios e rascunhos devem conter apenas tokens `h:<house_id>`; tokens `p:` ou `narrator` não são aceitos pelo novo padrão.

## Verificação
- Consulta em produção confirmou zero destinatários individuais ativos, 19 arquivos individuais e 2 recibos preservados.
- Para Harcourt: apenas uma entrega ativa para cada assunto *Coisas escondidas na lama*, *Boatos do Dragonmere* e *Informe da Costa*.
- Regressões UI adicionadas para seleção somente por casas. A suíte SQL inclui teste de bloqueio real do trigger e mantém cenários legados em PostgreSQL descartável com o trigger desligado **somente durante esses testes históricos**.
- O deploy é separado das mudanças de banco. Verificar a publicação da interface antes do aceite visual.

## Cuidados
A reconciliação de produção foi executada diretamente no Supabase e registrada no backup de auditoria, não reaplicar um script de reconciliação sobre dados diferentes sem validar os novos pares. A migração 0072 só institui a proteção estrutural para os envios futuros.
