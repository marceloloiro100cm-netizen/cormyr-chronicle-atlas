# Correspondência entre casas e com o Narrador — auditoria de 02/11/2026

## Regra vigente (corrigida na mesma data)
- **Jogador → Narrador:** permitido para NPCs e assuntos privados; sem casa destinatária e sem jogador destinatário. A mensagem é privada ao remetente e Narrador.
- **Casa → Casa:** permitido; uma única linha física `campaign_letters` por casa destinatária. Narrador lê uma **cópia virtual para mediação**, não uma linha adicional.
- **Narrador → Casa:** permitido.
- **Jogador → jogador individual:** proibido; não criar entrega com `recipient_player_id`.
- A escolha "Narrador" no formulário do jogador é mutuamente exclusiva com as casas; no formulário do Narrador aparecem somente casas.
- Respostas continuam no fio original. Contas pessoais são usadas para autenticação, autorização e recibos de leitura, não como destinatários de novas missivas.
- A migração 0072 bloqueou inicialmente todos os destinatários não-casa; a migração 0073 **substitui essa regra** por casa-ou-Narrador de jogador, e bloqueia `p:` no RPC. A migração 0074 adiciona a caixa `Cópias para mediação` do Narrador sem duplicar entregas.
- O MCP `escrever_missiva` permite `casas` ou `narrador=true` exclusivamente e proíbe destinatários individuais.
- Harcourt pertence a **Horselands**.

## Reconciliação de produção
- Identificados 19 pares exatos casa/jogador; abrangem as casas Erdenor, Everlost, Harcourt e Silversky.
- Validados conteúdo, assunto, autor, data de campanha, semana de criação e entrega, tipo, estado e data de entrega.
- Nenhuma das 19 cópias individuais tinha resposta ou consequência exclusiva.
- Os 2 recibos de leitura encontrados foram preservados na cópia por casa.
- As 19 cópias individuais foram arquivadas por `deleted_at`, com incremento de versão e sinalização de sincronização. **Nenhuma cópia por casa foi excluída.**
- Backup completo em `campaign_migration_backups` com `reason='house-only-mail-dedup-20261102'`. Não apagar sem auditoria.
- Atualizações de tombstone dos 19 registros enviadas à `sync_outbox`.
- 10 registros históricos dirigidos ao Narrador, sem duplicata comprovada, foram **preservados**; o envio direto ao Narrador voltou a ser permitido para jogadores.
- Os novos envios devem usar `h:<house_id>` ou, exclusivamente para jogadores, `narrator`; `p:` continua proibido.

## Verificação
- Consulta em produção confirmou zero destinatários individuais ativos, 19 arquivos individuais e 2 recibos preservados.
- Para Harcourt: apenas uma entrega ativa para cada assunto *Coisas escondidas na lama*, *Boatos do Dragonmere* e *Informe da Costa*.
- Regressões de interface adicionadas para seleção exclusiva de Narrador ou casas, e filtro de mediação. A suíte SQL conserva cenários históricos executados antes das novas migrações e testa as regras atuais depois. Nenhum teste exige desligar a proteção na produção.
- O deploy é separado das mudanças de banco. Verificar a publicação da interface antes do aceite visual.

## Cuidados
A reconciliação de produção foi executada diretamente no Supabase e registrada no backup de auditoria, não reaplicar um script de reconciliação sobre dados diferentes sem validar os novos pares. As migrações 0072–0074 definem a proteção estrutural e a mediação sem duplicação.
