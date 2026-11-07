# Cormyr — auditoria da cobertura digital do Capítulo 10 (7/11/2026)

## Meta e escopo

Meta do Narrador: cobertura funcional equivalente a aproximadamente 90% da
**guerra entre exércitos** de *Guerra dos Tronos RPG*, edição brasileira,
**Capítulo 10 — Guerra**. Combate pessoal do Capítulo 9 e economia integral
de Casas não fazem parte do denominador desta matriz, exceto interfaces
obrigatórias entre unidades e heróis.

Esta matriz é uma **estimativa de engenharia, não certificação**. Ter código
compilável e testes unitários não prova correspondência integral às tabelas
do livro. Os pesos são explicitados para impedir percentuais arbitrários.

## Matriz de cobertura ponderada (estimativa, sujeita a auditoria humana)

| Bloco Cap. 10 | Peso | Estimativa de implementação | Evidência do motor | Pendência que impede equivalência integral |
| --- | ---: | ---: | --- | --- |
| Unidade de 100, Saúde, Defesa, atributos, dados e graus | 12 | 95% | `engine.ts`, `models.ts`, `official-adapter.ts` | Todas as combinações de equipamento e NPC |
| Comandantes, subcomandantes, Disciplina e ordens | 14 | 90% | `engine.ts`, testes de comando | Sem comandante e sucessão em todos os cenários |
| Fases da batalha, iniciativa e ordens permanentes | 9 | 90% | `engine.ts`, `personal-initiative.ts` | Sequenciamento de interrupções raras |
| Campo, obstáculos, clima, cobertura e deslocamento | 11 | 75% | `terrain.ts`, `line-of-sight.ts` | Geometria/visibilidade oficial não exaustiva |
| Formações e todas as manobras avançadas | 17 | 82% | `formations.ts`, `advanced-orders.ts` | Interação simultânea de 3+ unidades, flanco e reações |
| Cerco, fortificações e equipamentos especiais | 17 | 80% | `siege.ts`, `siege-fire.ts`, `fortifications.ts`, `field-equipment.ts` | Alvos civis, fogo propagado, aríetes/torres destruíveis, recursos |
| Heróis e esquadrões integrados à guerra | 8 | 80% | `heroes.ts`, `squads.ts`, `personal-combat.ts` | Entrada/saída e liderança em todos os resultados possíveis |
| Sobreviventes, Glória, recursos, terras e prisioneiros | 8 | 73% | `aftermath.ts`, `aftermath-resources.ts` | Prisioneiros civis, validade dos domínios, decisão do Narrador |
| Jogabilidade digital, UX e testes de aceitação | 4 | 70% | `BattleGotGame.tsx`, testes sintéticos | Exércitos de tamanho livre, replay persistido, E2E multi-turno |
| **Total ponderado provisional** | **100** | **~83%** | **Núcleo jogável em laboratório** | **Não equivale a 90% certificado** |

Cálculo: soma de `peso × estimativa / 100`. A estimativa acima
indica **cobertura funcional aproximada**, e não demonstra por si só
fidelidade semântica 1:1 ao livro. O motor tem uma boa base para
uma partida digital com intervenção do Narrador; os próximos passos
são qualitativos, não apenas adicionar botões.

## Funcionalidades deste avanço

1. Ordens avançadas de unidades disponíveis no mesmo PR:
   Ataque Dividido, Ataque Relâmpago, Atropelar, Envolver,
   Pinça, Martelo & Bigorna, Escalar Muralhas e Terra Arrasada
   em modalidade de simulação — conferir caso a caso as precondições
   de cada manobra e sua resolução simultânea.
2. **Fase de cerco** ampliada: tiro contra unidade, herói ou
   fortificação, artilharia com munição especial e recarga;
   efeitos de incêndio persistente em rodadas de batalha;
   possibilidade de alastramento ao fugir/debandar.
3. **Integridade estrutural configurável** e brecha em fortificações:
   pontos de estrutura e VA são uma **adaptação de jogo digital**,
   não estatísticas canônicas de todas as construções no livro.
4. **Equipamento especial** por unidade: aríetes, aríete coberto,
   mantelos, tartarugas, torre de cerco, escadas e munições de uso
   único. Restrições de Movimento, Defesa, ordenação e
   ataque são avaliadas no motor.
5. **Fogo selvagem transportado**: risco de 1 em 6 ao sofrer dano,
   consumo dos potes, dano e fogo persistente em unidade atingida.
6. **Consequências pós-batalha**: projeções determinísticas de
   Lei, População, Riqueza, Terras, Defesa e prisioneiros, com
   cenário de ocupação configurado pelo Narrador; **nenhuma
   gravação em fichas oficiais ou recursos reais da Casa**.
7. **Linha de visão opcional** com traçado de quadrados
   `supercover` para muralhas e montanhas. É aproximação
   geométrica digital explicitamente desligada por padrão,
   pois o livro não define esse algoritmo.

## Aceite para aproximação aceitável de 90%

Para elevar a classificação sem mascarar lacunas, exigir:

- Teste de campanha completo, pelo Narrador, com ao menos
  cinco situações diferentes de batalha campal e cerco;
- Comparação de resultados de dados, Danos, Disciplina,
  formações, flanqueamento, cobertura e manobras com o livro;
- Auditoria de fogo selvagem, equipamento especial,
  danos estruturais e transições de rodadas simultâneas;
- Testes end-to-end para heróis, tropa, comandante morto,
  emboscadas, retirada e anexação de território;
- **Todas** as verificações CI verdes no SHA final do PR,
  sem regressão dos modos Adaptado/D&D;
- Registro dos desvios que são **adaptações digitais**,
  com aceitação explícita do Narrador.

Se essas condições não forem cumpridas, o número não deve
ser apresentado como conformidade certificada.

## Proteção de produção

PR #324 é rascunho e não deve ser mesclado/publicado até
revisão. Todos os perfis-modelo, recursos e perdas permanecem
locais à batalha. A simulação não altera o Hub Temporal,
senhas, contas, atributos, bens ou unidades das Casas.
