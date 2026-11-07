# Auditoria pós-lote — mapas quadrados, emblemas e regras militares
Data: 7 de novembro de 2026
Branch: `feat/battle-unified-square-tokens-got-dnd-20261107`
PR: #326, dependente do PR #325. Nenhuma publicação de produção foi realizada por este lote.

## Objetivo e arquitetura
A escolha entre Game of Thrones, Adaptado e D&D altera o **motor de regras**,
não o formato de célula: todos os novos mapas agora partem de quadrados.
A migração PTE/V3/CRZ incorpora as alterações já preparadas no PR #322.
Replays históricos em hexágonos permanecem legíveis; a importação de replay
não altera seu conteúdo, embora a interface de novas partidas não ofereça
criação hexagonal.

A versão GOT conserva o seu motor `GOT-CH10-1` e quadrados de 10 m.
Adaptado conserva PTE e V3; D&D recebe acesso independente ao motor
**CRZ-5E simplificado**, sem usar o motor PTE por engano. A adoção de
célula quadrada não significa que as escalas de metros, pés e ordens sejam iguais.

## 1 — Tokens das unidades
- As 17 imagens originais continuam em `/assets/military-units/`, sem gerar
  novas versões ou alterar a heráldica das Casas.
- Fichas e listas militares: removido `object-fit:cover` e zoom `scale(1.25)`
  que cortavam símbolos. Exibição `contain` com enquadramento responsivo.
- PTE/V3: emblema SVG no centro do token com `preserveAspectRatio=xMidYMid meet`.
- GOT: mesmos emblemas na preparação, tabuleiro e fichas táticas.
- D&D/CRZ-5E: os quatro exemplos da campanha recebem símbolos militares
  por classe. Criaturas sem mapeamento mantêm iniciais e **não ganham brasão fictício**.
- Cores e contornos dos dois exércitos continuam distintos.

## 2 — Mapa compartilhado
- PTE/V3 e CRZ usam geometria de quadrados da migração 322 (inclusive
  caminhos, vizinhos, linha de visão, bloqueios de diagonal e testes).
- GOT já operava em quadrados, agora admite 11×9, 15×11 e 12×7 no
  laboratório. O original 12×7 permanece por compatibilidade de testes.
- Novo formato JSON `cormyr-square-map` v1: nome, dimensões e 99/165
  células, terrenos *plain / forest / hill / rock*.
- Importação/exportação pelo editor PTE, tela de preparação GOT e treino
  D&D/CRZ. As zonas iniciais de implantação são recalculadas por motor;
  escudos, Defesa, cobertura, movimentação e recursos não são copiados.
- Somente terreno GOT reversível exporta automaticamente (planície, mata
  densa, colina, muralha). Terrenos especiais ou com efeitos próprios
  exigem conversão manual; nenhuma água ou fortificação é silenciosamente
  reinterpretada.
- Nenhum mapa/campanha real foi sobrescrito ou migrado em banco.

## 3 — Game of Thrones: capítulo 10
- Validação de unidade: Atributos numéricos e dados finitos/inteiros,
  Saúde máxima = Vigor×3, Saúde atual, Defesa, VA, Disciplina e dano.
  Valores oficialmente importados continuam declarados; o laboratório
  não inventa uma nova fórmula para Defesa, pois equipamentos e posses
  podem alterá-la.
- Equipamento: os nove pacotes já catalogados são exibidos/validados;
  interface detalha seu uso, com cálculo de movimento e Defesa próprios.
- Cerco: até quatro máquinas por engenheiro, seleção de salva conjunta
  limitada à Guerra do comandante, alcance e recarga calculados por funções
  determinísticas; defesa e integridade das fortificações ficam visíveis.
  **PV e VA estruturais permanecem parâmetros digitais, não tabela
  oficial do livro.**
- Heróis: controle de até duas ações menores, exibição de atributos e
  efeitos; mantém as duas janelas de cinco rodadas.
- Esquadrões: até dez grupos de dez por unidade de cem, com posições
  pessoais exclusivas em 10×10m. Só dez derrotados em um grupo contabilizam
  uma perda de Saúde coletiva, uma única vez por grupo.
- Glória, sobrevivência, ferimentos, prisioneiros e Terra Arrasada
  continuam prévias isoladas sem lançamentos em Casas.

## Cobertura atualizada — estimativa ponderada de engenharia
Denominador: sistema de Guerra do capítulo 10 e interfaces diretas; não inclui
todo combate pessoal do capítulo 9 nem a economia geral da Casa.

| Bloco | Peso | Estimativa anterior | Estimativa após lote |
|---|---:|---:|---:|
| Unidades, Saúde, Defesa, atributos e dados | 12 | 95% | 97% |
| Comando, Disciplina e ordens | 14 | 90% | 90% |
| Fases e iniciativa | 9 | 90% | 90% |
| Terreno, clima, cobertura, movimentação | 11 | 75% | 86% |
| Formações e manobras avançadas | 17 | 82% | 84% |
| Cerco, fortificações e equipamentos | 17 | 80% | 85% |
| Heróis e esquadrões | 8 | 80% | 85% |
| Sobreviventes, Glória e consequências | 8 | 73% | 79% |
| Jogabilidade, visual e testes | 4 | 70% | 90% |
| **Total ponderado** | **100** | **82,93%** | **87,25% (~87%)** |

**Advertência:** o novo 87,25% é uma estimativa revisada do trabalho de
engenharia, não uma mensuração automática nem auditoria certificada das
regras 1:1 do livro. Os pesos/percentuais não são testes de conformidade.
Não se pode afirmar 100% de fidelidade em qualquer modo neste estágio.

## Pendências para 100% literal
1. Matriz página a página para cada opção do capítulo 10, com exemplos
   oficiais do livro transformados em vetores de testes.
2. Tratamento completo de exceções de cerco/fortificação, fogo e
   adjudicações que dependem do Narrador.
3. Integração de heróis sem atalhos digitais nas interações complexas;
   separar claramente o submotor de combate pessoal do capítulo 9.
4. Revisão de progressão, Glória, ocupação e resgate com um Narrador,
   distinguindo consequência provisória de aplicação oficial.
5. Sessão autenticada real, replays duráveis e testes visual/móvel com
   mapas complexos e exércitos grandes.
6. D&D é deliberadamente um **simplificado 5e**, não uma implementação
   integral da 5e; Adaptado é propositalmente não literal ao livro.

## Gate de liberação
Exigir GitHub Actions Validate (unitários, TypeScript, build, banco) e
Battle browser acceptance (synthetic) **verdes no SHA final**,
além do aceite de UX real, antes de integrar o PR #326 ao PR #325
e depois avaliar integração à `main`. O merge não publica
automaticamente o Lovable em produção.
