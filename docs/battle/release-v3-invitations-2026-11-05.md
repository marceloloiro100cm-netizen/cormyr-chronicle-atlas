# CORMYR · V3 — Convocações de batalha, RLS e aceite

## Objetivo entregue
O usuário autenticado vê **Batalha → Batalhar**, que abre o simulador V3 com casas-modelo. Somente quando há uma convocação `open` destinada à casa à qual o jogador está vinculado aparece o segundo botão **Batalha convocada (n)**. Um jogador sem convite continua com apenas **Batalhar**.

O Narrador recebe a tela **Convocar batalha**, onde escolhe um destinatário real de sua campanha (casa autorizada) e dois exércitos completamente fictícios, comandantes e cenário V3. O botão é separado de **Criar batalha** (laboratório PTE-2.0). Convocação não atualiza tropas nem provoca missão militar oficial. Permite encerrar convocações antigas, removendo-as imediatamente da lista dos jogadores.

### Segurança
- A estrutura `battle_v3_invitations` contém somente dados de demonstração, ID da casa destinatária e autor; não armazena fichas, saldo, exército oficial, turnos ou baixas.
- RLS: Narrador confirmado por `is_campaign_admin()` + `campaign_access_active()` pode criar/consultar/encerrar. Jogador só recebe `SELECT` se `status='open'`, `campaign_access_active()` e `in_campaign_house(target_house_id,false)` forem verdadeiros.
- Anônimo sem privilégio de leitura. Jogador nunca consegue criar ou alterar convites, ainda que tente chamar a API diretamente.
- Funções TanStack Start com `requireSupabaseAuth`; o servidor revalida o papel antes de cada operação e a RLS aplica a segunda camada.
- Nenhum acesso a `noble_house_sheets` nem `houseOperation` pelas novas funções.

### Evidência já executada
- Aplicado **apenas ao novo PostgreSQL isolado de homologação** (cluster `7703760980994770283`) `docs/battle/sql/0077_battle_v3_invitations.sql`.
- Testes SQL com 3 identidades sintéticas, Narrador, jogador membro, jogador externo, vínculo revogado e tentativa de `UPDATE` não autorizado: **todos aprovados**. Todos os registros sintéticos criados dentro de uma transação revertida.
- Zero usuários sintéticos, casas sintéticas e convites remanescentes. Nenhuma alteração no banco de produção nesta execução até passar pelos testes do PR.

### Limites esclarecidos
- A batalha convocada V3 continua um **exercício local contra IA**, não multiplayer entre aparelhos, com exércitos-modelo definidos pelo Narrador.
- Para a fase da campanha real haverá necessidade de partidas sincronizadas, replay V3 servidor, decisões de ambos os participantes e integração de perdas homologada; não presumir que o convite por si só compartilha turnos.
- O botão Condicional só será habilitado para a produção depois da migração aditiva com RLS e CI aprovados.
