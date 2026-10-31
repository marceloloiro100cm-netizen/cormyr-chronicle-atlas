# Hub Temporal de Cormyr — Lote 6: Cadastro Canônico de Nobres

**Data:** 31/10/2026 · **Dependência:** Lote 5, PR #131. **Estado:** código em PR, nenhuma escrita na produção.

## Escopo entregue

Este lote cria a **identidade estável e auditada de pessoas nobres**, mas **não executa envelhecimento automático**. A projeção anual (+1 na virada de ano de Harptos, sem dupla contagem) pertence ao Lote 7.

A migração `0062_canonical_character_registry.sql` introduz:

| Tabela | Propósito |
| --- | --- |
| `campaign_characters` | Um ID UUID por pessoa; nome, apelidos, Casa, papéis, raça, nascimento/idade-base, política etária, vida/morte, confiança, estado de revisão, versão e visibilidade |
| `character_source_links` | Um vínculo único por fonte de origem, sempre aprovado pelo Narrador; permite múltiplas fontes por pessoa |
| `character_review_queue` | Fila de candidatos, alegações e conflitos, sem assumir correspondência por nome |
| `character_relations` | Parentescos entre IDs estáveis; rejeita autorrelações, duplicidade e ciclos de ancestralidade |
| `character_registry_audit` | Registra criação, edição, confirmação de fonte e parentesco, com responsável, antes/depois e justificativa |

Não existe coluna persistida `current_age`: nascimento e `baseline_age/baseline_year` são a referência futura. Se o ano de nascimento e a idade-base forem incompatíveis, o cadastro recebe estado **conflict**, sem decidir silenciosamente qual valor é correto. Uma data de nascimento/morte com ano divergente é rejeitada.

### Fontes incluídas

A função `stage_campaign_character_sources()` cria **candidatos** a partir dos titulares de `campaign_houses`, dos lordes do cadastro oficial de jogadores e dos registros de personagem em `campaign_records`. Ela não altera essas fontes, não cria pessoas automaticamente e não vincula nomes semelhantes.

O script `scripts/generate-character-candidates.mjs` lê exclusivamente o catálogo público `public/cormyr/data.js` e as biografias `public/cormyr/histories/*.json` para gerar um **manifesto JSON local**, incluindo `source_kind`, `source_key`, nome candidato, nascimento alegado, idade textual e caminho da fonte. Não se presume que uma idade textual seja válida em 1522: `claimed_age_year` permanece nulo quando não documentado. Também não se equipara uma Casa do catálogo a um ID de Casa jogadora sem confirmação explícita.

**Exemplo de uso após checkout do PR:**

```bash
node scripts/generate-character-candidates.mjs ./candidatos-nobres.json
```

O arquivo é gerado localmente; o script **não acessa Supabase** e não envia dados para produção. Um Narrador pode revisar o JSON e importá-lo em grupos de até 500 entradas na área do Hub, através do RPC `import_character_source_candidates`. Reimportar a mesma origem não sobrescreve revisões já feitas.

### Administração e conciliação

Na seção **Hub Temporal → Nobres e genealogias**, o Narrador tem acesso a totais, pesquisa, fila de revisão, criação e edição de pessoas, dados vitais, políticas de idade excepcionais e vínculos familiares. Os registros só são associados a uma identidade estável pela ação explícita **Vincular a pessoa canônica**. A origem pode ser marcada também como **conflito** ou **ignorada**.

- `save_campaign_character`: escrita exclusiva do Narrador; exige justificativa, versão otimista e validação. Não altera fichas, histórias nem textos de origem.
- `review_character_source`: confirma uma única vinculação por `source_kind/source_key`, impedindo redirecionamento silencioso de uma fonte já ligada.
- `save_character_relation`: grava parentesco com autor e justificativa; rejeita ciclos de `parent`.
- `get_character_registry_hub`: leitura administrativa paginada/limitada, usada pela interface.

### Privacidade e RLS

**Somente o Narrador** pode consultar os dados completos das cinco novas tabelas no Lote 6. A autorização é verificada no banco, não somente na interface. Atributos `visibility` e `owner_user_id` são guardados para projeções futuras com regras por Casa e por jogador, porém a existência de uma pessoa secreta, seus vínculos, nascimento, genealogia e fontes não pode ser consultada por outros participantes neste lote. Nenhuma tabela é pública ao usuário anônimo. A projeção `/api/public/time` do Lote 5 não é modificada.

### Testes e validação

- `scripts/test-canonical-characters.sql` exercita RLS, fila e importação idempotente, criação e auditoria, confronto nascimento × idade de referência (ex.: Tomenn Staghunt), versão desatualizada, confirmação explícita, colisão e ciclos genealógicos, e negação de acesso a jogadores.
- `scripts/character-candidate-manifest.test.mjs` verifica extração reproduzível de biografias públicas, incluindo Percival Evenhand e Planchar Stonecastle, sem inventar ano de referência de idade.
- CI aplica a migração e roda o teste em PostgreSQL descartável, além de TypeScript, testes de componentes e build.

### Limites e implantação

1. O registro começa **sem pessoas canônicas já aprovadas**; fontes podem ser colocadas na fila para serem conciliadas pelo Narrador. O lote não pode afirmar quantas pessoas únicas existem antes dessa revisão.
2. Nenhuma identidade foi mesclada em produção e nenhuma genealogia foi sobrescrita.
3. Fichas Chronicle, legadas e Corte permanecem fontes autorais. A conexão de apresentação das idades dinâmicas nelas será feita no Lote 7, após revisão das fontes.
4. Migração 0062 depende de 0060/0061 e dos lotes anteriores. A produção possui histórico Drizzle a reconciliar (auditoria do Lote 1); é obrigatório backup, homologação e implantação coordenada.
5. Somente **idade cronológica** será derivada no Lote 7; idade aparente e exceções narrativas não serão inferidas automaticamente por raça ou texto.

**Critério do Lote 6:** IDs canônicos e fontes independentes, fila de pendências explícita, revisão e parentesco auditáveis, todas as leituras protegidas, sem atualização fictícia de idade.
