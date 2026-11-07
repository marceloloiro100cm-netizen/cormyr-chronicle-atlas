# Cormyr — lote P1: Terreno, consequências e experiência de combate
Data: 7/11/2026 · Motor: `GOT-CH10-1` · PR de implementação: #325

## Objetivo
Ampliar a simulação da Guerra entre Exércitos do Capítulo 10 sem confundir um
recurso digital com uma regra literal do livro. Apenas dados sintéticos ou
snapshots de leitura são utilizados. Nenhuma perda altera Casas, Hub Temporal,
senha, posse, unidade militar ou recurso real.

## 1. Terreno, clima, cobertura e movimento
- `terrainCoverBonus`: cobertura do terreno protege de tiros mesmo quando a
  unidade não escolheu a ordem Defender; no corpo a corpo requer Defender.
  O valor vem do catálogo de terreno, sem somar bônus duas vezes.
- `visibilityPenalty`: chuva forte reduz a visibilidade efetiva a penumbra;
  neve forte continua utilizando o efeito de escuridão da simulação.
- `movementSlow`: chuva forte em córregos/charcos/colinas e neve leve em
  terrenos acidentados adicionam custo limitado a duas unidades. **Esta
  combinação de clima + terreno é uma convenção de jogo digital**, não
  reprodução textual das tabelas. O Narrador pode iniciar com clima aberto.
- `terrainMoveCost` e `previewWarMovement`: a prévia utiliza o mesmo algoritmo
  de busca e o mesmo orçamento aplicado à ordem `move`; retorna validade,
  percurso, distância percorrida, custo em metros e justificativa. Não consome
  dados ou ordens nem modifica o combate.
- Linha de visão rigorosa continua **opcional**, com aproximação geométrica
  `supercover`, sem afirmar equivalência completa ao livro.
- A própria ordem Mover, quando destinada ao quadrado de origem, é registrada
  sem deslocar nem revelar automaticamente uma tropa escondida.

## 2. Sobreviventes, Glória e consequências
- `previewWarAftermath` continua usando `survivorResult` e a Tabela 10-6
  existente. Agora apresenta o treinamento antes/depois, destruição proposta
  quando o resultado fica abaixo de Verde, e graduações excedentes após Elite.
- Resumo independente para atacante/defensor: estado final em campo, tropas
  rendidas/debandadas/destruídas, progressão/regressão e destruição sugerida.
- `gloryBreakdown` explicita vitória, bônus por inferioridade numérica e
  concessão ao lado derrotado; total reproduz o cálculo de Glória do motor.
- O resultado de recursos ainda requer cenário declarado pelo Narrador.
  Terra Arrasada sem proprietário não gera perdas atribuídas; ocupação de
  domínio inferior a três meses é sinalizada como projeção não consolidada.
- Toda evolução de tropas continua **proposta**. O Narrador precisa aprovar
  consequências oficiais em um fluxo separado, não incluído neste lote.

## 3. Interface, jogabilidade e testes
- Controle para ampliar o mapa na largura disponível, com painel de ordens
  disposto abaixo em vez de ficar espremido ao lado.
- Rota de Mover realçada no tabuleiro, painel de inspeção do quadrado (terreno,
  custo com clima, defesa de cobertura e penalidade de visibilidade), mensagem
  de destino inválido antes de comprometer uma ordem.
- Cores de terreno diferenciadas por água, florestas, colinas/montanhas,
  preservando as cores das unidades e informações em texto.
- Painel pós-batalha com resumo por lado, decomposição da Glória, treinamento
  projetado e avisos de aprovação; filtro por exército.
- Histórico de ordens filtrável (tudo, atacante, defensor, apenas rolagens),
  exibindo até 30 eventos. Registro completo permanece no salvamento local.
- Testes de regressão em `battle-got-terrain-aftermath-ui-lote2.test.tsx`
  cobrem clima, cobertura, rota determinística, dados de pós-guerra,
  controle de mapa expandido e recuperação de resultado finalizado.

## Critérios finais de aceite
1. Unitários, TypeScript e build aprovados no SHA final do PR.
2. Teste sintético de navegador aprovado e sessão narrador verificada.
3. Cenários manuais: mata/colina, chuva/neve, embarcações, muralhas, emboscadas,
   grandes exércitos, diferentes resultados de sobreviventes e ocupação.
4. Reconciliação no livro dos modificadores de cada terreno e clima para
   classificar qualquer aproximação digital que permaneça.
5. Nenhuma alteração de `main`/produção até o lote ser aprovado e revisado.

**Cobertura:** a matriz anterior estimava aproximadamente 83%; este lote
expande funcionalidade e teste, mas ainda não autoriza declarar 90% ou
correspondência 1:1 com o livro.
