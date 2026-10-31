# Lote 33 — proteção do cache e painéis após perda do cargo de Narrador

**Base:** PR #158, Lote 32. **Data:** 31/10/2026.

Se o Narrador perdeu seu cargo enquanto a aba administrativa continuava montada, não basta bloquear uma nova publicação: a interface pode conservar dados sensíveis na memória. O Lote 33 completa essa defesa.

## Mudanças

- Identificação explícita de erros de permissão do banco (`42501`) e de mensagens conhecidas de perda de cargo. Um erro de rede, por si só, não é tratado como revogação.
- Quando um comando de calendário, rascunho, conferência ou replay retorna erro de revogação, `NarratorCalendar` ou `TemporalConsumerHub` passam para uma tela de bloqueio que deixa de exibir o painel privado.
- Limpeza do cache React Query de missivas, Casas, histórico e projeções administrativas, preservando apenas a consulta de escopo que verifica as autorizações atuais.
- Testes de classificação de erro e limpeza real do cache, além de verificação dos bloqueios presentes em ambos os painéis.

A mudança mantém o controle oficial de segurança sob RLS e nas funções SQL. O clique do usuário não pode conceder acesso, e a limpeza do navegador não apaga registros persistidos da campanha. Revogação enquanto o navegador está offline continua dependente de atualização posterior, mas nenhuma gravação deve contornar a autorização do servidor.

## Pendências de implantação

A cadeia de PRs permanece aberta e o banco de produção **não foi acessado**. A conciliação das 27 migrações SQL fora do journal, o prefixo `0041` duplicado e a restauração de backup real autorizado são bloqueios ainda existentes.

**Decisão: NO_GO para produção.** Nenhum merge, deploy ou migração desta etapa é autorizado pelo relatório.
