# Cormyr Chronicle Atlas — Dossiês de Espionagem
## Execução dos lotes 7, 8 e 9 — 04/11/2026

**Escopo:** homologação funcional, segurança dos dados e liberação controlada.
**Dependências:** migrações 0104 e 0105, interfaces do jogador/narrador,
sistema atual de agentes, HUB Temporal e critérios da versão 2.1 do relatório.

## Lote 7 — Homologação funcional e correções

A suíte geral revelou dois defeitos independentes das fichas de espionagem,
mas relevantes à usabilidade do módulo:

1. Um teste do mapa regional continha o texto literal `\n` fora de uma
   string. Isso causava erro de compilação, impedindo a execução dos
   demais testes daquele arquivo. Corrigido o arquivo de teste, sem
   deslocar as coordenadas das Casas nem alterar a rota.
2. O seletor de retrato tratava `occupied=true, assignedAgentId=null`
   como imagem livre quando `currentAgentId` também era nulo.
   O identificador nulo da reserva global é intencional para proteger
   a identidade de espiões de outras Casas. Corrigido o seletor para
   manter o retrato bloqueado sem revelar o nome do agente.

Foram adicionados testes para o painel de jogador com:
- Lista limitada aos dados retornados para a própria Casa.
- Contador 3/7, atributos desconhecidos e ausência de valores ocultos.
- Abas Exército/Posses sem divulgação do total real de registros.
- Tratamento de dossiê sem descobertas.
- Contratos SQL de isolamento, autorização e fonte oficial.

A suíte completa no GitHub e os testes autenticados entre duas contas
com Casas diferentes precisam de confirmação; não usar dados reais como
massa de teste.

## Lote 8 — Dados históricos, concorrência e segurança

**Migração:** `0106_spy_intelligence_refresh_previous_only.sql`.

A função administrativa de materialização considerava, no mesmo
processamento, uma descoberta recém-inserida como possível informação
anterior para revalidação. A nova versão exige que a informação
revalidada tenha sido descoberta em **outra operação**, e elimina
duplicatas da fonte antes de escolher o item a atualizar.

A correção foi aplicada ao banco ativo após execução de ensaio em
transação revertida; a definição instalada foi conferida.

### Auditoria de permissões — PostgreSQL do projeto ativo

| Verificação | Resultado observado |
|---|---|
| Visitante ler dossiês diretamente | Negado |
| Jogador ler dossiês/fichas de segredos diretamente | Negado |
| Jogador ler histórico de segredos diretamente | Negado |
| Jogador ler auditoria do Narrador diretamente | Negado |
| Visitante executar consulta de dossiês | Negado |
| Autenticado executar RPC de dossiês | Permitido; a RPC valida Casa/admin |
| Autenticado consultar catálogo bruto de segredos | Negado |
| Visitante executar mutação administrativa | Negado |
| RLS na auditoria do Narrador | Habilitada |
| Nova restrição de revalidação na função ativa | Confirmada |

A leitura autorizada é sempre composta por valores históricos
descobertos, não por consulta ao inventário inteiro da Casa-alvo.

## Lote 9 — Implantação e verificação

1. Validar testes de componente, banco, TypeScript e build no GitHub.
2. Integrar a PR correspondente em `main` apenas depois dos testes
   ou documentar abertamente eventuais impedimentos.
3. Confirmar sincronização do GitHub com Lovable e iniciar publicação.
4. Conferir o estado da publicação e o endereço do site.
5. Preservar quaisquer segredos e missões reais; não criar missões
   artificiais na base de campanha para testes.

### Critérios finais de aceite

- [x] Seleção de três objetivos de missão já existe.
- [x] Registro persistente e histórico sem duplicações por missão.
- [x] Refrescamento não reutiliza descobertas da mesma operação.
- [x] Retratos globalmente indisponíveis respeitam ocultação do agente.
- [x] Sem SELECT direto das tabelas de inteligência por jogadores.
- [x] Dossiês de jogador/narrador já estão conectados ao site.
- [ ] Resultado integral do pipeline de GitHub.
- [ ] Validação autenticada cruzada com casas distintas.
- [ ] Confirmação de distribuição da versão corrigida pelo Lovable.

**Observação:** nenhuma informação confidencial de jogadores foi exportada
para este relatório. Os valores de campanha permanecem exclusivamente
no banco e nas fichas oficiais.
