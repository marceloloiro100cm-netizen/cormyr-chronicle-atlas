# Espionagem — inspeção de pré-publicação em produção (02/11/2026)

**Ambiente inspecionado:** projeto Lovable `bdc007de-2bdf-4e28-8df8-b09ce46f884c`, consultas **somente SELECT** via conexão do projeto. **Não foi criado backup, alterado banco, aplicado SQL nem publicado.**

## Inventário verificado no banco real

| Evidência | Produção | Cópia de homologação antiga |
|---|---:|---:|
| Casas oficiais | 8 | Não confrontado |
| Fichas de Casas `noble_house_sheets` | 8 | Vazia no relatório de 31/10 |
| Missivas `campaign_letters` | 111 | Vazia no relatório de 31/10 |
| Entradas do ledger `noble_house_ledger` | 30 | Vazia no relatório de 31/10 |
| Tabelas `public` | 50 | 50 |
| Políticas RLS `public` | 50 | 50 |
| Entradas `drizzle.__drizzle_migrations` | 40 | 1 |
| `spy_assets` | Não existe | Não existe |
| `spy_operations` | Não existe | Não verificado |
| `spy_intel_reports` | Não existe | Não verificado |
| Tabelas do consumidor temporal | Existem | Não verificadas |

A cópia de homologação `41028f68-4fe7-4ed0-b123-c820522a0a3b` **não corresponde ao estado transacional da produção**. Ter o mesmo número de tabelas não confirma equivalência de dados, migrações ou hashes. Uma reconstrução isolada por restauração de backup verdadeiro continua obrigatória.

O journal versionado em `drizzle/migrations/meta/_journal.json` contém **42 entradas**. No banco há **40 registros**, com registros de timestamp/hash anteriores. O catálogo contém SQL sem journal e o prefixo `0041` duplicado. Não completar o journal automaticamente, pois a existência de objetos/linhas não prova qual script executou. A conciliação deverá validar hashes, alterações de esquema e cargas de dados **arquivo por arquivo**, sobretudo `0042_reconcile_house_workbooks` já detectada historicamente como aplicada sem registro no Drizzle.

## Falhas de CI conhecidas e tratamento

1. `Validate`: testes temporais tinham totais estáticos antigos de 71/29 SQL; testes foram ajustados para calcular a lista real a partir do catálogo, **sem transformar o NO_GO em GO**.
2. `mail-database`: teste de destinatários esperava a mensagem de `0072`, enquanto `0073` substitui a função para autorizar destinatário Narrador; ajustado para o contrato atual, preservando proibição de endereço direto ao jogador.
3. `missivas-ui`: mensagem de aviso mudou para `Nenhum destinatário selecionado`; as asserções de bloqueio sem destinatário foram mantidas.
4. Rodar `Validate` integral e `Espionagem Marco C — PostgreSQL descartável` novamente antes de considerar merge.

## Evidências ainda ausentes e impeditivos

- **Backup completo do PostgreSQL:** sem identificador de snapshot gerenciado ou `pg_dump` exportado; a integração Lovable disponível apenas expõe status e consultas SQL, não operações de exportação/restore de backup.
- **Restauração real:** não existe teste de recuperação com dados de produção na cópia segregada.
- **Reconciliação Drizzle:** arquivos sem journal, colisão de prefixo e cargas prévias ainda exigem verificação humana individual.
- **Homologação Narrador:** roteiro de vinte cenários em `docs/espionage/lote-13-homologacao-narrador.md` ainda sem assinatura/evidência do ambiente restaurado.
- **Aplicação SQL e APIs:** `0075` e `0076` são `REVIEW_ONLY`; agentes e missões reais ainda não têm todas as operações server-side (criação de células, itinerário validado, adjudicação, relatórios), portanto a interface não pode ser considerada funcional em produção.
- **Publicação:** não autorizada por `docs/espionage/release-evidence.json` (`state: NO_GO`), que não deve ser alterado sem documentação material e revisão independente.

## Checklist do operador da plataforma

1. Na plataforma gerenciadora do Supabase/Lovable, obter snapshot/restauração ou acesso seguro a dump físico completo (incluindo `auth`, `storage`, `public`, schema `drizzle`), sem inserir credenciais em GitHub/ChatGPT.
2. Restaurar em instância independente; comparar contagens, hashes de migração, chaves de posse e integridade de anexos.
3. Registrar evidências de 20 testes com usuários A/B e Narrador, e testar RLS/rollback no banco restaurado.
4. Integrar operações server-side pendentes e conferir `Validate` completo, não apenas testes isolados.
5. Solicitar revisão final de segurança e decisão formal de produção; somente então executar migrações rastreadas, merge e deploy.

**Decisão desta auditoria: NO_GO; nenhuma mutação de produção realizada.**
