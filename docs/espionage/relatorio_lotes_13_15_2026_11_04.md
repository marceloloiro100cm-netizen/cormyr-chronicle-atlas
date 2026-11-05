# Cormyr Chronicle Atlas — Dossiês de Espionagem
## Relatório de execução dos lotes 13 a 15 — 04/11/2026

### Lote 13 — Atualização segura na visão do jogador

O painel de Espionagem passa a disponibilizar **Atualizar dossiês**. Ele
reconsulta a RPC `spy_intelligence_read` com o identificador da própria Casa
autorizada, sem leitura direta do inventário do alvo.

- O botão apresenta estado `Atualizando…` enquanto a consulta ocorre.
- Foco na janela e reconexão podem revalidar dados já obtidos.
- Falha de autorização continua apresentando erro em vez de valores de
  uma consulta anterior.
- Dados desconhecidos permanecem explicitamente marcados e o total
  real de unidades/posses de outra Casa continua oculto.

### Lote 14 — Gerenciamento de descobertas pelo Narrador

Criada função pura `spyDossierActionOptions` para alinhar as opções
do formulário à situação oficial de cada dossiê:

- **Adicionar descoberta:** somente itens do catálogo que ainda não
  foram descobertos.
- **Atualizar valor conhecido:** somente descobertas presentes e
  ainda respaldadas pelo catálogo oficial.
- **Revogar conhecimento:** qualquer segredo atualmente conhecido,
  inclusive uma unidade dissolvida ou posse que deixou de constar do
  inventário ativo.

O formulário impede alterações que exigem catálogo quando a consulta
à fonte oficial falha. A tentativa de reprocessar missões diferencia
pendência de fonte da ausência de premiação por sucesso. A consulta
administrativa não apresenta dados antigos em caso de erro (proteção
contra manutenção visual de informações no cache após perda de acesso).

Todas as decisões continuam passando pelas RPCs verificadas pelo
PostgreSQL e registradas na auditoria do Narrador.

### Lote 15 — Testes de regressão, revisão e implantação

Adicionados testes de:
- Descoberta de itens novos sem duplicação.
- Revalidação apenas de conhecimento previamente adquirido.
- Revogação de um segredo sem referência oficial ainda ativa.
- Atualização do painel da Casa sem mudar de identidade.
- Ocultação das informações administrativas após falha de autorização.

**Escopo de implantação:** frontend e funções TypeScript. Nenhuma migração
de banco é necessária nos lotes 13–15, portanto nenhum valor de ficha,
agente, missão ou registro histórico será modificado.

### Critérios de aceitação

- [x] Código da atualização manual e das opções administrativas criado.
- [x] Testes de regressão adicionados.
- [ ] Pipeline de CI (testes, TypeScript, build) concluído.
- [ ] PR integrada à branch principal.
- [ ] Sincronização GitHub/Lovable confirmada.
- [ ] Publicação específica confirmada (não confundir com
  `is_published=true` de uma versão anterior).
- [ ] Testes com duas contas autenticadas de Casas diferentes; exigem
  sessões de teste autorizadas, não devem ser simulados com usuários
  reais de produção.

**Referência:** os lotes 1–12 já implantaram o registro persistente,
as três abas, a consulta autenticada por Casa, os índices e o bloqueio
de vazamento no histórico de segredos revogados. Este lote não reverte
essas garantias.
