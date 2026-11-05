# Cormyr Chronicle Atlas — Dossiês de Espionagem
## Execução dos lotes 16 a 18 · 04/11/2026

### Lote 16 — Navegação e organização dos relatórios

As coleções de dossiês da Casa investigadora e do Narrador passam a usar
uma função pura compartilhada para busca, filtro e ordenação, sem depender
de consultas ao inventário secreto de outras Casas.

- Pesquisa de Casa-alvo sem distinguir maiúsculas e acentos.
- Filtros por região e completude de Recursos da Casa (0–6/7 ou 7/7).
- Ordenação pela última atualização ou pelo nome da Casa-alvo.
- Paginação de **12 dossiês por página para o jogador** e
  **30 linhas por página para o Narrador**.
- Indicadores de quantidade, controles Anterior/Próxima e retorno seguro à
  primeira página quando o filtro ou a ordem muda.
- A navegação exibe o detalhe apenas de um dossiê presente na página atual.
- O sistema não revela o total real de unidades militares ou posses do alvo.

### Lote 17 — Triagem das missões pendentes do Narrador

O relatório administrativo oferece uma fila mais legível de missões que
aguardam fonte oficial, sem alterar a adjudicação de missões já concluídas.

- Nomes das Casas investigadora e alvo obtidos dos dossiês autorizados do
  Narrador; se não existir correspondência, os identificadores oficiais são
  exibidos sem adivinhar nomes.
- Modalidade, data registrada no HUB Temporal e capacidade máxima de
  descobertas são mostradas em cada linha.
- Filtro por objetivo da investigação, indicador de quantidade e opção
  de reprocessar individualmente.
- Estado de carregamento distinto de fila vazia.
- Em erro de autorização/consulta, a lista sensível é ocultada e aparece
  uma tentativa explícita de reconexão.
- Nenhuma missão será reprocessada automaticamente e nenhuma ficha de
  jogador será modificada sem a ação do Narrador.

### Lote 18 — Testes e revisão de publicação

Incluídos testes automatizados para:
- Normalização de busca, filtragem por região e por Casa investigadora.
- Completude dos sete recursos sem inventar totais de Exército e Posses.
- Ordenação determinística e paginação sem mutar os dados originais.
- Resolução correta de nomes da fila pelo par investigador/alvo.
- Navegação e troca de filtros na interface do jogador.

**Segurança e persistência:** as RPCs de leitura, os snapshots históricos,
a auditoria do Narrador, a RLS e a proteção de segredos revogados
permanecem inalteradas. O lote não requer migração do PostgreSQL e
não cria registros fictícios de espionagem.

### Aceite e limitações
- [x] Alterações e testes adicionados à branch.
- [ ] Workflow GitHub Validate completo.
- [ ] Pull request integrada à main.
- [ ] Sincronização de commit Lovable verificada.
- [ ] Publicação da versão nova confirmada pelo provedor.
- [ ] Testes reais cruzados de duas contas com Casas diferentes; precisam de
  sessões autorizadas e não devem acessar dados de jogadores reais como fixture.
