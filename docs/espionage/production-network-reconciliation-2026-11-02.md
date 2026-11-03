# CCA-ESP-MVP-001 — Conciliação inicial de agentes existentes

**Ambiente:** Supabase de produção associado ao Cormyr Chronicle Atlas.  
**Ação:** inserção aditiva em transação de localidades e agentes com fonte explícita na ficha da Casa, sem alterar saldo, ledger, missivas, calendário ou construções.
**Fonte executada:** [0085_initial_verified_network_agents.sql](./sql/0085_initial_verified_network_agents.sql), blob SHA `66fae5b4254ef5d0193ca3922400e9a212171886`.
**Estado:** conciliado; esta operação não homologou rotas externas, nem colocou missão em execução.

## Conferência direta do banco

| Casa | Propriedade validada | Região oficial da ficha | Agentes criados |
|---|---|---|---:|
| Ashkar | Rede de Espiões `hold-ashkar-spy` (ativa), Rede Ampliada `hold-ashkar-spy-exp` (ativa e ligada à Rede base) | `dragoncoast` | **3** |
| Erdenor | Rede de Espiões `hold-erdenor-spy` (ativa) | `horselands` | **1** |
| Total | 3 posses ativas | 2 regiões | **4** |

### Identificadores imutáveis de origem

- `base:hold-ashkar-spy:0`
- `expanded:hold-ashkar-spy-exp:0`
- `expanded:hold-ashkar-spy-exp:1`
- `base:hold-erdenor-spy:0`

O procedimento verificou `houseId`, `phase=active`, identificadores da posse, `itemId`, domínio, condição ativa, vínculo parental da ampliação e região `state.identity.region`. Criou duas localidades do tipo `domain` com `visibility=narrator` e quatro agentes com `status=available`; **nenhuma transação de Riqueza**.

O SQL usa `ON CONFLICT DO NOTHING` e verifica pós-condições de 3+1 agentes e região; uma divergência aborta a transação. Registrou duas entradas de auditoria `agents_reconciled` sem atribuir falsamente um ator de sessão ao Narrador.

## Pendências

1. **0 conexões regionais homologadas.** As regiões de origem não autorizam inventar fronteiras nem passagens por mar. Usar o formulário do PR #220 e fonte cartográfica aprovada.
2. Os agentes estão cadastrados no banco, mas não estão em missões. A criação de missão, adjudicação e consumidor temporal ainda não estão instalados em produção.
3. O painel da Ficha de Casa fica disponível apenas após revisão, merge autorizado e publicação do PR #220; esta conciliação não modifica a versão front-end hospedada.
4. O cadastro novo permanece fora do journal Drizzle, e os cenários H01–H20/backup-restauração seguem **NO_GO** para a liberação do módulo completo.

Este relatório registra fatos da execução, não equivale a comprovação de backup, ensaio de recuperação nem teste com JWTs reais.
