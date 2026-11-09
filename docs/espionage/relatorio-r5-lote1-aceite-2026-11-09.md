# Cormyr · R5 · Lote 1 — Execução e aceite técnico

**Data:** 09/11/2026  
**Base:** branch R4 (PR #354), ainda não integrada à produção.  
**Meta:** priorizar o funcionamento real: criar espião → enviar missão → avanço de désdia → homologar → registrar XP/ocorrência → atualizar dossiê.  
**Política:** sem mutar dados reais de produção, sem antecipar percentuais de usabilidade e sem publicar sem CI e aceite em contas reais.

## Implementações

1. **Corrigido o teste R4 que quebrou a suíte geral.** O teste legado exigia que o input fosse uma sequência literal `required autoFocus minLength` e falhava porque o bloqueio obrigatório `disabled={busy}` foi acrescentado. Agora verifica que os campos são obrigatórios e ficam bloqueados em solicitação ativa.
2. **Cronograma do HUB publicado atualiza o módulo sem esperar 30 segundos.** O mapa de invalidação da data oficial passa a contemplar gestão de agentes, estratégia, Central do Narrador, dossiês e probabilidades. Sem novas alterações de dados ou relógios paralelos.
3. **Confirmação de criação reforçada:** resultado da transação deve bater retrato e conjunto exato de melhorias solicitadas, não somente o tamanho da lista. A checagem ocorre no navegador e no servidor.
4. **Resolução reforçada:** contrato de outcome é estrito (sucesso, fracasso, fuga, captura, morte); campos de rolagem/alterações permanecem bloqueados durante a requisição, preservando chave idempotente.
5. **Retry do julgamento:** se uma chave já aplicada retorna o comprovante sem outcome, a interface explica que a resolução anterior foi confirmada, sem relatar nova rolagem/sucesso.
6. **Testes adicionais:** suíte R5 para validação de comprovantes, autorização, todos os resultados, prêmio pendente/ausente, chaves de invalidação e bloqueios de formulário. Inclusa no gate de CI de espionagem.

## Aceite com PostgreSQL REAL em homologação isolada

Arquivo: `scripts/espionage-r5-lot1-rollback-acceptance.sql`.

**Executado e aprovado no banco de homologação isolado.** A consulta aplicou o arquivo diretamente numa transação `BEGIN ... ROLLBACK` com usuário e reivindicações JWT *sintéticas de laboratório*; não foi usado login real, e nenhum objeto permaneceu no banco. A própria transação recusa executar se o ambiente tiver usuários, calendário ou espiões, para impedir acidentes em produção.

Cenários exercitados pelas funções SQL reais:

- Criar agente Verde com retrato único e melhoria de Documentos falsificados.
- Debitar 1 Riqueza e criar exatamente um lançamento no livro-caixa, de forma atômica.
- Repetir mesma chave de criação sem duplicar agente, retrato, melhoria ou compra.
- Enviar missão de **Recursos** com viagem inter-regional de 1 désdia, confirmar chegada via trigger do HUB e liberação para revisão após a investigação.
- Homologar sucesso com dificuldade calculada no banco, sem alterar manualmente o resultado.
- Materializar descobertas de Recursos, **Exército** e **Posses**, com 3 sucessos e 1 promoção automática a Treinada.
- Repetir a chave do último julgamento e a finalização do dossiê, sem nova decisão ou prêmio.
- Homologar fracasso sem conceder XP ou inteligência.
- Homologar descoberta em região com Lei alta e proteção, resultando em morte do agente; verificar ocorrência registrada.
- Conferir datas de Harptos incluindo Midwinter e Shieldmeet.
- Repetir as funções de criação, envio, resolução e finalização de inteligência sem JWT: todas as 4 foram recusadas.
- Conferir o estado **após ROLLBACK**: 0 usuários, 0 agentes, 0 operações, 0 decisões, 0 descobertas e 0 calendários persistentes na homologação isolada.

A execução não simulou dois usuários *autenticados pelo Supabase*. Isso exige provisionar uma homologação com dados e credenciais de teste autorizados, o que não se deve suprir com identidades falsas no ambiente real.

## Gate e status

**Concluído:** correções de código, integração SQL transacional, regressão por missão e bloqueio de acessos anônimos.  
**Pendente:** CI geral e específico na revisão final da PR; depois, execução autenticada real jogador/narrador em homologação e avaliação visual.  
**Produção:** não alterada por este lote.

**Não declarar prontidão ≥90%** enquanto o roteiro com login real não for aprovado. Lote 2 e Lote 3 permanecem fora deste escopo.
