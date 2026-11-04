# CORMYR — Dossiês de Espionagem
## Relatório técnico-funcional, versão 2.2 (protótipo e implementação)

**Escopo:** espionagem entre Casas nobres, usando os agentes, o calendário,
a dificuldade, a rolagem e a resolução homologada do site.
**Estado do desenvolvimento:** lotes 1–6 integrados à `main` pelas PRs #247 e #248;
migrações SQL 0104 e 0105 aplicadas no Supabase do projeto ativo; lote 7 de
homologação/publicação integral ainda pendente.

### 1. Objetivos e princípios
A informação pertence à Casa investigadora, não ao espião. Para cada par
**Casa investigadora → Casa-alvo** existe no máximo um dossiê, com três
modalidades independentes:

| Objetivo | O que descobre | Progresso |
|---|---|---|
| Recursos da Casa | Defesa, Influência, Terras, Lei, Poder, População, Riqueza | 0–7 / 7 |
| Exército | Unidades militares individuais, por identificador único | N unidades conhecidas, sem informar o total real |
| Posses | Construções, terras e propriedades efetivamente adquiridas | N posses conhecidas, sem informar o total real |

O formulário da missão contra uma Casa oferece **somente uma escolha** dessas
três. Seu resultado se aplica apenas ao objetivo escolhido. Não há "prêmios"
transferíveis entre modalidades.

### 2. Sucesso, novas descobertas e revalidação
A missão é resolvida pelo Narrador com a dificuldade e a rolagem existentes.
Em um sucesso, revela **3 itens**, mais 1 para cada grau adicional de sucesso,
até **+4**. A mecânica técnica proposta usa 1 grau adicional a cada 5 pontos
inteiros acima da dificuldade já homologada.

| Margem de sucesso | Grau adicional | Capacidade |
|---:|---:|---:|
| 0–4 | +0 | 3 |
| 5–9 | +1 | 4 |
| 10–14 | +2 | 5 |
| 15–19 | +3 | 6 |
| ≥20 | +4 | 7 |

*Essa graduação adicional não substitui nem altera a regra vigente de
graus de **falha**; apenas mede a extensão de uma vitória.*

O sistema prioriza itens **ainda desconhecidos**; excedentes, quando não
existirem novos itens suficientes, podem **revalidar** registros conhecidos.
Para Recursos, há exatamente sete chaves possíveis, sem repetição. Exército
e Posses não têm limite global de sete: a capacidade é **por missão**.

Todas as descobertas guardam uma **fotografia do valor na data da missão**.
A aquisição de uma fortificação ou alteração de efetivo não atualiza
automaticamente o conhecimento de outra Casa.

### 3. Persistência e segurança
- Dossiê único pelo par investigador/alvo.
- Registro único por (dossiê, modalidade, atributo/unidade/posse).
- Evento imutável por revelação/revalidação, referenciado à missão.
- Missão homologada processada no máximo uma vez.
- Linha do tempo usa a data oficial do HUB Temporal.
- Jogadores só poderão consultar seus próprios dossiês, por RPC segura,
  no lote 5; nenhum atributo desconhecido chega ao navegador.
- Narrador terá consulta geral e correções auditáveis no lote 6.
- Operações fracassadas, canceladas ou não homologadas não revelam segredos.

### 4. Protótipo visual — visão do jogador

**Espionagem → Dossiê**

\`\`\`text
┌──────────────────────────────────────────────────────────────────┐
│ CORMYR  /  ESPIONAGEM                           [Dossiê]         │
│ Informações reunidas pela Casa Goldfin                            │
├──────────────────────────────────────────────────────────────────┤
│ FILTROS: [Região ▾] [Casa ▾] [Progresso ▾]                        │
│                                                                   │
│  ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐      │
│  │ HARCOURT        │ │ EVENHAND        │ │ PHELLES         │      │
│  │ Recursos: 3/7   │ │ Recursos: 6/7   │ │ Recursos: 7/7   │      │
│  │ Exército: 4     │ │ Exército: 2     │ │ Exército: 8     │      │
│  │ Posses: 6       │ │ Posses: 0       │ │ Posses: 12      │      │
│  │ [Abrir dossiê]  │ │ [Abrir dossiê]  │ │ [Abrir dossiê]  │      │
│  └─────────────────┘ └─────────────────┘ └─────────────────┘      │
└──────────────────────────────────────────────────────────────────┘
\`\`\`

**Após abrir a Casa Harcourt:**

\`\`\`text
┌──────────────────────────────────────────────────────────────────┐
│ RELATÓRIO CONFIDENCIAL · CASA HARCOURT             [Brasão]        │
│ Casa investigadora: Goldfin                                       │
├──────────────────────────────────────────────────────────────────┤
│ [  RECURSOS  ]   [  EXÉRCITO  ]   [  POSSES  ]                    │
├──────────────────────────────────────────────────────────────────┤
│ RECURSOS DA CASA                                      3/7        │
│ [■■■□□□□]                                                         │
│ Defesa         35           Influência     Desconhecido           │
│ Terras         Desconhecido Lei            28                     │
│ Poder          Desconhecido População      Desconhecido           │
│ Riqueza        41                                                 │
│                                                                   │
│ Última confirmação: 2ª désdia de Hammer, 1522 CV                 │
└──────────────────────────────────────────────────────────────────┘
\`\`\`

Ao clicar na aba **Exército**:

\`\`\`text
┌──────────────────────────────────────────────────────────────────┐
│ EXÉRCITO — 4 UNIDADES CONHECIDAS                                  │
│ ───────────────────────────────────────────────────────────────── │
│ 🛡 Guarda de Harcourt        · Infantaria · Efetivo conhecido: 100│
│ 🏹 Arqueiros da Muralha      · Arqueiros  · Efetivo conhecido: 80 │
│ ⚔ Cavaleiros de Harcourt    · Cavalaria · Efetivo conhecido: 40  │
│ 🛡 Guarda do Portão          · Guarnição · Efetivo conhecido: 60  │
│                                                                   │
│ Estes efetivos podem estar desatualizados.                        │
│ O total REAL de unidades inimigas não é exibido.                 │
└──────────────────────────────────────────────────────────────────┘
\`\`\`

Ao clicar na aba **Posses**:

\`\`\`text
┌──────────────────────────────────────────────────────────────────┐
│ POSSES — 3 PROPRIEDADES CONHECIDAS                                │
│ ───────────────────────────────────────────────────────────────── │
│ ♜ Castelo de Harcourt       · Fortificação                       │
│ ♜ Torre de Vigia            · Construção militar                 │
│ ◇ Vinhedos do Conclave      · Economia                            │
│                                                                   │
│ Não revela construções não adquiridas, custos, bônus secretos     │
│ nem o total REAL de propriedades da Casa investigada.            │
└──────────────────────────────────────────────────────────────────┘
\`\`\`

**IMPORTANTE:** todos os nomes, números, unidades e posses do protótipo são
fictícios; não são dados reais de Harcourt.

### 5. Protótipo — envio de missão
\`\`\`text
 Confirmar início da missão
 Espião: Corvo Cinzento
 Casa-alvo: Harcourt
 Região: Dragon Coast

 OBJETIVO DA ESPIONAGEM: [ Recursos da Casa                ▾ ]
                          [ Exército                          ]
                          [ Posses                            ]

 Viagem estimada: ... désdias
 Investigação estimada: ... désdias
 [Cancelar]                          [Confirmar início]
\`\`\`

A seleção é obrigatória e gravada na operação antes da resolução. A confirmação
continua usando a rota e a data oficiais do banco. Não existe rolagem feita pelo
jogador para determinar segredos.

### 6. Protótipo — visão do Narrador
**Menu:** HUB Temporal → Dossiês de Espionagem

| Investigadora | Alvo | Recursos | Exército | Posses |
|---|---|---:|---:|---:|
| Goldfin | Harcourt | 3/7 | 4 | 6 |
| Goldfin | Phelles | 7/7 | 8 | 12 |
| Ashkar | Qazir | 5/7 | 3 | 2 |

Clicar na linha abre o relatório com três abas, histórico e controles
administrativos de conceder, revogar e revalidar descobertas. Os números
representam **itens conhecidos**, e não o inventário real das Casas.

### 7. Lotes de implementação
**Lote 1 — estrutura:** tabelas persistentes para dossiê, achados,
eventos e processamento por missão, com unicidade e RLS estrita.

**Lote 2 — envio:** escolha obrigatória da modalidade no diálogo de missão,
com contrato autenticado e registro no PostgreSQL.

**Lote 3 — graus/descobertas:** 3 + até 4; sem duplicação; revalidação;
registro transacional no momento da resolução do Narrador. Recursos de NPC
sem ficha operacional usam a planilha oficial homologada. Quando a fonte
está incompleta, o processamento fica \`waiting_catalog\` em vez de inventar
valores. Exército e Posses também ficam nesse estado até o lote 4.

**Lote 4 — conectores oficiais:** calcular Recursos de ficha operacional com
o mesmo motor de atributos do site; obter unidades e posses *adquiridas*
e corrigir pendências dos lotes 1–3.

**Lote 5 — dossiê do jogador:** cards, filtros, três abas, API/RPC autorizada,
sem exposição de dados privados.

**Lote 6 — narrador:** gerenciador abaixo do HUB Temporal, auditoria, filtros,
operações administrativas.

**Lote 7 — homologação/publicação:** testar migração Supabase, RLS,
concorrência, regresso da missão, dados históricos, CI e layout.

### 8. Critérios de aceite e limites atuais
- [x] Os três objetivos são definidos no código.
- [x] Diálogo solicita uma modalidade por missão.
- [x] RPC recebe e grava a modalidade com chave idempotente.
- [x] SQL mantém dossiê por par de Casas e descobertas sem duplicatas.
- [x] SQL suporta capacidade de 3–7 derivada da decisão do Narrador.
- [x] Migração aplicada no Supabase do projeto ativo, com RLS e gatilho conferidos.
- [x] Fontes oficiais de Exército e Posses integradas para fichas operacionais (lote 4).
- [x] Recursos de ficha operacional integrados usando `balances(state).total` (lote 4).
- [x] Interfaces de jogador e narrador integradas ao código da `main` (lotes 5–6).
- [ ] Publicação visual via Lovable validada em produção.
- [ ] Validação integral, publicação e testes reais (lote 7).

**Migração 0104 já aplicada antes da integração do frontend.**
A PR #247 foi incorporada à `main`. O CI específico de dossiês passou; a
validação global teve duas falhas preexistentes em testes de mapas/retratos,
que deverão ser tratadas separadamente. A publicação visual via Lovable
permanece dependente de sincronização e validação.


### 9. Resultado de execução — lotes 4 a 6
- **Código:** PR #248 integrada à branch principal, com UI do jogador
  e painel do Narrador. O menu do Narrador coloca Dossiês logo abaixo do HUB Temporal.
- **Banco:** migração 0105 instalada, com fonte de unidades não destruídas,
  posses ativas e domínios e recursos operacionais apurados pelo motor oficial.
- **Segurança:** cinco tabelas de inteligência com RLS; usuários autenticados
  não têm SELECT direto nos segredos e não podem consultar inventário real
  pela RPC de catálogo. A leitura por Casa devolve somente descobertas.
- **Narrador:** filtros de Casa investigadora, Casa-alvo e região; pode conceder,
  atualizar e revogar descobertas com justificativa auditada. Missões pendentes
  podem ser reprocessadas se a fonte oficial passar a existir.
- **Histórico:** valores registrados por missão não acompanham automaticamente
  alterações futuras na ficha do alvo.
- **Limitação real:** casas NPC sem inventário cadastrado não recebem exércitos
  nem posses inventados; missões aguardam fonte homologada.
- **Qualidade:** compilação TypeScript e build da execução isolada da espionagem
  aprovados. Validação visual/publicação completa pertence ao lote 7.
