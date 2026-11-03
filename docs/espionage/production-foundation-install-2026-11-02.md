# CCA-ESP-MVP-001 — Registro da instalação limitada no banco de produção

**Execução:** solicitação explícita do Narrador em 02/11/2026; ações e verificação registradas na mesma sessão.
**Ambiente:** projeto Lovable `bdc007de-2bdf-4e28-8df8-b09ce46f884c`, banco Supabase de produção.
**Script executado:** `docs/espionage/sql/0084_foundation_scoped_install.sql` (Git blob SHA `fbf62763136d4f1e06ecaae293429a8ec119dcc9`).
**Escopo autorizado:** tabelas de agentes e missões, ligações regionais e função de désdias, em transação atômica. O SQL é um recorte do schema `0075` (tabelas, índices e RLS, **sem** funções de envio/divulgação), `0082` (rotas regionais e RPCs autenticados) e `0083` (cálculo Harptos).

## Pré-execução (consultas SELECT)

| Verificação | Antes |
|---|---:|
| Tabelas `spy_%` | 0 |
| Funções `spy_%` | 0 |
| Fichas `noble_house_sheets` | 8 |
| Missivas `campaign_letters` | 111 |
| Ledger `noble_house_ledger` | 30 |
| Diário `drizzle.__drizzle_migrations` | 40 |
| `noble_house_ledger.operation_key` | uuid |
| Índice/constraint único de `house_id, operation_key` | presente |

## Comprovações de pós-execução (consultas SELECT)

| Verificação | Depois |
|---|---:|
| Tabelas `spy_%` | **14** |
| Tabelas `spy_%` com RLS ativado | **14** |
| Tabelas `spy_%` com SELECT para `anon` ou INSERT/UPDATE/DELETE direto para `authenticated` | **0** |
| Agentes cadastrados | 0 |
| Missões cadastradas | 0 |
| Conexões regionais cadastradas | 0 |
| RPC `spy_get_regional_strategy(text)` | instalada |
| RPC `spy_review_region_link(...)` | instalada |
| Função `spy_add_desdias(text,integer)` | instalada |
| `authenticated` pode executar `spy_add_desdias` diretamente | não |
| `anon` pode executar `spy_add_desdias` diretamente | não |
| `service_role` pode executar `spy_add_desdias` | sim |
| `spy_add_desdias('1524-07-30',1)` | `1524-08-10` |
| `spy_add_desdias('1524-07-30',3)` | `1524-08-30` |
| `spy_add_desdias('1522-12-30',1)` | `1523-01-10` |
| Fichas `noble_house_sheets` | **8** |
| Missivas `campaign_letters` | **111** |
| Ledger `noble_house_ledger` | **30** |
| Diário `drizzle.__drizzle_migrations` | **40** (não alterado) |

## Limites e próximos controles

- **Não foi criado nem testado um backup restaurável.** A ferramenta conectada permite SQL, mas não expõe dump/restore gerenciado. O script operou somente sobre **novos objetos**, sem modificar dados existentes.
- **Não há agentes, missões ou fronteiras cadastradas.** Ligações terrestres/marítimas dependem de homologação pelo Narrador, e agentes dependem de conciliação das posses.
- **Não foram instaladas** as funções `spy_submit_mission`, adjudicação e publicação de cartas, nem o consumidor temporal. Consequentemente, o módulo **não está funcional de ponta a ponta** e nenhum prazo executa avanços automáticos.
- **Não houve merge, deploy nem alteração no `main`.** O SQL aplicado está documentado nesta branch. A migração futura deve reconciliar esses objetos previamente instalados com o journal Drizzle, com revisão humana. Não reaplicar `0082` integralmente cegamente (usa `CREATE TABLE` sem `IF NOT EXISTS`).
- O arquivo de liberação da Rede de Espiões continua **NO_GO** para o produto completo; a instalação limitada NÃO equivale ao aceite dos 20 cenários H01–H20.

**Decisão de alcance:** fundação de dados e cálculo temporal instalados; funcionalidades transacionais da espionagem permanecem desativadas até homologação.
