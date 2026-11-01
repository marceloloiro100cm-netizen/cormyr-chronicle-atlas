# Homologação da Ficha de Personagem V2 — inventário do ambiente real

**Data da consulta:** 01/11/2026 · **Fonte:** SELECT de metadados no PostgreSQL de produção do Lovable, sem escrita.

## Inventário verificado

| Evidência | Resultado |
|---|---:|
| Registros em `campaign_records` | 64 |
| Registros com `kind='character'` | 19 |
| Fichas V1 estruturadas pelo prefixo Chronicle | 0 |
| Fichas legadas identificáveis pela tabela GOT e título | 6 |
| Outras entradas (retratos/Corte/narrativas) | 13 |
| Pessoas no registro canônico `campaign_characters` | 0 |
| Vinculações em `character_source_links` | 0 |
| Candidatos em `character_review_queue` | 0 |
| Tabelas de rascunho V2 no banco | ausentes |
| Entradas no journal `drizzle.__drizzle_migrations` | 40 |
| Registros na tabela de backups de migração | 13 (existência não valida restauração) |

**Casas com ficha legada reconhecível:** Ashkar, Erdenor, Fewmerry, Goldfin, Grantass e Silversky.

**Casas sem ficha reconhecível nesse inventário:** Everlost e Harcourt. Os registros dessas Casas podem conter outros documentos ou imagens; ausência de ficha reconhecida não prova ausência da fonte em Drive.

## Decisão técnica: migração e publicação

**NO-GO para liberar a Ficha V2 aos jogadores.** A identidade canônica é mandatória, mas não existe cadastro nem vínculo; não é seguro casar pessoas por semelhança de nome. Nenhum atributo importado, equipamento, especialidade ou Destino deve virar estado oficial sem revisão.

**GO para publicar melhorias não destrutivas:** diagnóstico do Narrador, seleção apenas de fichas reconhecíveis, advertências de valores faltantes/duplicados, PDF de prévia, motor de regras já protegido por flags. As fichas existentes continuam em produção inalteradas.

A minuta `docs/sql-drafts/0070_character_v2_assisted_drafts.sql` **não está no catálogo executável**: a sequência de migrações 0062/0063 ainda possui bloqueios históricos documentados, e não há ensaio de restauração com hashes e RLS homologados neste ambiente. Não executar 0070 diretamente em produção.

## Caminho de conclusão (ações verificáveis)

1. No painel administrativo do Narrador, abrir **Calendário → Nobres e genealogias → Importar fontes internas**. Isso cria candidatos para revisão sem modificar as fichas. **Não foi executado por esta alteração.**
2. Cadastrar as pessoas canônicas individualmente com nascimento, Casa, visibilidade, proprietário e fonte. Vincular cada registro explicitamente; não aprovar por semelhança de nome.
3. Na aba **Ficha → Ficha do Personagem → Conciliação V2**, selecionar cada uma das 6 fichas reconhecidas. Verificar cada graduação, Astúcia, especialidades, qualidades, defeitos, Destino, idades e valores inconsistentes. O valor 2 para grau ausente é **provisório**, não é compra nem graduação confirmada.
4. Localizar/importar as fichas faltantes de Everlost e Harcourt por seus originais, sem inventar graduação ou criar arquivo vazio.
5. Fazer inventário/autorização da sequência Drizzle e aplicar o SQL apenas em ambiente de homologação após backup com restauração testada. Executar testes de acesso indevido por Casa, revogação e corrida entre versões.
6. Implementar e homologar a RPC transacional de compras de XP/Destino; reconciliação explícita do saldo inicial em vez de creditar tudo do texto.
7. Executar teste comparativo Aldaeric (Defesa de Intriga 11, Compostura 9), amostra das demais Casas, PDF e rollback.
8. Só após aceite do Narrador, habilitar gradualmente V2 por personagem, mantendo ficha anterior e trilha auditável.

## Consultas reproduzíveis (somente leitura)

```sql
SELECT count(*) FROM public.campaign_records WHERE kind='character';
SELECT count(*) FROM public.campaign_characters;
SELECT count(*) FROM public.character_source_links;
SELECT count(*) FROM public.character_review_queue;
SELECT to_regclass('public.character_v2_drafts');
SELECT count(*) FROM drizzle.__drizzle_migrations;
```

A autorização para publicar alterações de código **não equivale** à aprovação para associar identidades, modificar valores de campanha ou executar migrações destrutivas. O sistema deve diferenciar claramente “código publicado” de “V2 ativada”.
