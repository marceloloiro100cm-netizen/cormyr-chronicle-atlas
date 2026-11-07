# Guerra dos Tronos RPG — motor independente CCA / GOT-CH10-1

**Fonte primária:** *Guerra dos Tronos RPG*, edição brasileira, capítulos 2 (testes), 6 (unidades) e 10 (Guerra), do PDF pertencente à Biblioteca do usuário. Implementação de procedimentos numéricos e conceitos; não reprodução do texto integral do livro.

**PR de base:** #323, filtro de três modos. A mudança é isolada do modo Adaptado e da migração de quadrados do PR #322. Nenhuma alteração em banco, usuários, senhas, casas, atribuição de perdas oficiais ou resultados existentes.

## Cobertura testável — núcleo jogável

| Regra do livro | Estado no núcleo |
| --- | --- |
| Unidade coletiva e Saúde = Vigor × 3 | Implementada |
| Defesa = Agilidade + Atletismo + Percepção – penalidade de armadura | Implementada no adaptador oficial e tropas-modelo |
| Escala quadrada 10 m e rodadas de aproximadamente 1 minuto | Implementada |
| Teste de d6 por graduação, dados de bônus e de penalidade | Implementado (seed auditável) |
| Graus de sucesso por margem de 5, até quatro | Implementado |
| Falha crítica com margem de 5 | Implementada |
| Comandante dá ordens até Guerra; subcomandante 1 ordem, limitado a 1 por 2 unidades | Implementada na engine (UI inicial mostra comandantes principais) |
| Iniciativa Guerra + Estratégia por rodada | Implementada |
| Teste Guerra × Disciplina e repetição de comando (+3 sucessivamente) | Implementada |
| Unidades sem ordem inicial inativas; falha crítica distinta | Implementada |
| Ataque corpo a corpo e Pontaria por graus; VA subtraída uma vez | Implementada |
| Carga, movimento, corrida, defender, reagrupar, reorganizar, reanimar e retirada | Implementação funcional inicial, requer refino em casos de borda |
| Prontidão (p. 232) | Condição explícita (inimigo adjacente / unidade inimiga em debandada); reação preparada de ataque ou movimento, consumida quando ativada; persistência até o gatilho. Outros gatilhos narrativos ainda pendentes |
| Desorganizar, debandar, destruir e retirar unidades do mapa | Implementação funcional inicial |
| Continuação de ataques e defesas na etapa de ordens permanentes | Implementação funcional inicial |
| Unidade oficial com stats, equipamentos e benefícios de posses, por snapshot somente leitura | Implementada com endpoint protegido de Narrador e escolha de Região, Casa, unidade e posição; somente fichas completas (não converte importação de NPC) |
| Terreno e modificadores de clima/visibilidade, deslocamento e obstáculos | Implementação inicial e editor de mapa quadrado (precisa conferir variantes e linha de visão) |
| Formações e ângulo frontal | Nove formações cadastradas; ordens e flanco opcional em laboratório; reações e restrições ainda incompletas |
| Tabela de sobreviventes (10-6) e Glória (10-5) | Prévia local determinística e sem mutação oficial; resolução narrativa ainda pendente |
| Passo 5 — catapulta, cospe-fogo, escorpião, manganela e trabuco | Catálogo, alcance, operadores engenheiros, limite de quatro equipamentos por unidade, custo de uma ordem para disparar, recarga alternada e rolagens incorporados à arena; munições especiais e dano estrutural pendentes |
| Fortificações do livro (pp. 227–228) | Tabela de Defesa +3/+4/+6/+8/+12, capacidade de ocupação, obras temporárias com seis horas e bônus de engenheiros, com defesa e sabotagem na engine |
| Passos 6 e 8: heróis individuais | Janelas de cinco rodadas, entrada/saída da unidade, Disciplina e +1D, sucessão e recuperação de moral, dano sem VA, além de **núcleo parcial de combate pessoal do capítulo 9** com escala de 1 m, ações maiores/menores, ataque, carga, esquiva, movimento, recuperação, passar e rendição. Ataque indivíduo → unidade inteira (Defesa +20) e unidade → indivíduo (+2D) integrados; lacunas listadas abaixo |
| Iniciativa pessoal (cap. 9) | Modo opcional na arena: teste de Agilidade, Rapidez, desempate, ordem de atuação e alternância de ações em cada uma das cinco rodadas da janela. Ainda requer validação do sistema de atraso e de reações pessoais |
| Mitigação pessoal (cap. 9) | Escolha manual opcional após o golpe: ferimentos reduzem dano em Vigor cada (–1 no resultado); lesões cancelam o golpe (–1D, morte ao atingir Vigor). Soldados comuns não podem usar essas opções; Destino não integrado |
| Esquadrões de dez (cap. 10) | Destaque de 10 combatentes da tropa para escala de 1 m; quando os 10 são derrotados, consolida 1 perda de Saúde da unidade uma única vez, na conclusão da janela de heróis |
| Armas pessoais-modelo | Exemplos de armas da tabela 9-3, dano por habilidade, alcance Comprida e Perfurante reduzindo VA; treinamento, Cruel, montarias, recarga e propriedades restantes ainda incompletos |
| Ordens avançadas | Ataque exploratório, fogo de supressão, preparação contra carga, emboscada, junção, sabotagem e **Empurrar** (+3 em comando, Luta × Atletismo passivo, 10 m por grau com bloqueios e terreno) incorporadas em protótipo auditável; demais manobras pendentes |
| Rendição e erros críticos de retirada | Rendição geral testa cada unidade ativa; falhas críticas de retirada e retirada agressiva geram consequências distintas |
| Seleção entre GOT, Adaptado e D&D | Implementada no painel do Narrador |

## Itens ainda não equivalentes ao livro (bloqueiam a alegação de 100%)

1. **Fases de heróis (6 e 8):** núcleo numérico do **capítulo 9** agora inclui ataques entre personagens, distâncias de 1 m, ataque/carga/esquiva/recuperação, orçamento de uma ação maior ou duas menores, derrota e registro auditável. Ataques indivíduo → unidade inteira (+20 Defesa) e unidade → indivíduo (+2D) também estão disponíveis em laboratório. **Não está 100%**: iniciativa pessoal ainda não obrigatória, ação de Atrasar sem integração completa, ferimentos/lesões com escolha voluntária mas sem Destino, esquadrões de dez em versão inicial, efeitos completos das armas, reações e especialidades, cobertura detalhada, movimentação tática/linha de visão em escala 1 m, fichas oficiais pessoais e consequências de comandantes/heróis derrotados.
2. **Passo 5, armas de cerco:** implementação inicial inclui iniciativa, operadores, disparos/recarga e Defesa de fortificações ocupadas. Ainda faltam efeitos completos de munição incendiária, dano a estruturas/portões, especialidades de fortificações e personagens como alvos.
3. **Passos 1 a 3:** terreno, clima e visibilidade estão em versão inicial, mas ainda faltam todas as variantes da Tabela 10-3, efeitos de cobertura em construções, linha de visão, parley, posicionamento alternado e unidade escondida.
4. **Regras avançadas:** já há formações, flanco e rotinas iniciais de ataque exploratório, fogo de supressão, contra-carga, emboscada, junção e sabotagem; faltam ataque dividido, ataque relâmpago, atropelar, envolver, escalar muralhas, pinça, martelo e bigorna, terra arrasada e condições completas de reações/posicionamento.
5. **Passo 11:** tabelas de Glória e sobreviventes agora são prévias locais, sem gravação; faltam prisioneiros, consequências de recursos, ocupação e permanência, variações de cenário e revisão/aceite do Narrador.
6. **Controle preciso:** corrida e carga ainda usam deslocamento ortogonal e corredor simples, sem adjudicação completa de cobertura/obstáculos; gatilhos narrativos personalizados e interrupções em outras situações ainda precisam ser validados.
7. **Integração oficial na interface:** a seleção Região/Casa/unidade, captura de versão e cópia autenticada ao Narrador foram integradas em até quatro espaços. Faltam escala livre de unidades (sem esse limite do laboratório), associação de comandantes pessoais, equipamento variável não padronizado, bônus condicionais e validação de posicionamento/organização de forças.

## Diretrizes de correção

- **Nunca rotular este núcleo como reprodução integral do livro** antes de concluir todos os itens acima e validar contra cenários do livro.
- Não usar o motor PTE/CRZ como fallback do modo GOT.
- Guardar seed, dados, dificuldade, graus, dano e estado na trilha auditável local.
- Nenhuma baixa de simulação altera ficha de Casa nem consome recursos; consequência oficial exige ação e autorização separadas.
- Os perfis-modelo são dados fictícios para teste; não representam personagens históricos do livro.
- Para conflitos de interpretação entre livros/edições, conferir a edição brasileira do usuário.
- Novos replays sempre `rulesVersion=GOT-CH10-1`; não reescrever esquemas PTE.

## Comandos básicos para próxima revisão

Ações disponíveis na arena: ataque, carga, defender, mover, prontidão condicional, empurrar (avançada), reagrupar, reanimar, reorganizar, retirada, retirada agressiva, rendição geral e, opcionalmente, formação, giro e reversão. A interface mostra dados, iniciativas, Disciplina e a condição da tropa. A roda de eventos é exclusivamente local e não salva em produção.

Próximas implementações devem priorizar: (a) fechar a iniciativa e os subsistemas ainda ausentes do combate individual do capítulo 9 (incluindo Destino, iniciativa individual obrigatória, recuperação de ferimentos/lesões, especialidades e qualidades completas de equipamento); (b) completar munições especiais, fortificações destrutíveis e armas de cerco; (c) linha de visão, reações de prontidão e geometria completa de movimento; (d) manobras avançadas ainda pendentes; (e) exércitos de qualquer tamanho, NPCs com ficha oficial e comandantes/heróis reais; (f) persistência/replay e consequências narrativas com autorização explícita.

## Incremento — combate pessoal e tropas (continuação)

- Código: `src/lib/battle/got/personal-combat.ts` (metros individuais e economia de ação);
  integração em `heroes.ts`, `engine.ts` e `BattleGotGame.tsx`.
- Uma rodada de batalha = dez rodadas pessoais de seis segundos; cada janela de heróis
  dos passos 6 e 8 contempla cinco rodadas pessoais. No laboratório, o orçamento de
  cada personagem é controlado individualmente, e a iniciativa de Agilidade/Rapidez com alternância de microturnos está disponível
  mediante ativação explícita no laboratório, ainda sem ação Atrasar completa.
- Ataque pessoal usa Luta/Pontaria vs Defesa, multiplicação do dano por grau de
  sucesso e subtração de VA; derrota a Saúde 0 sem impor automaticamente morte.
  Movimento pessoal usa coordenadas de um metro; colisão e cobertura precisam refino.
- Atacar uma unidade inteira a partir do personagem usa +20 na Defesa da unidade;
  uma unidade atacando herói aplica +2 dados de teste no ataque conforme o capítulo 10.
- A resolução de indivíduos e a moral coletiva são prévias locais, sem acesso de gravação
  às fichas oficiais. Modelos de heróis ainda não são NPCs/PCs importados do livro.
- Testes: `battle-got-personal-combat.test.ts` e
  `battle-got-mixed-hero-unit.test.ts`. Validar CI no SHA do PR antes de merge.
- Pendências críticas para a equivalência 100%: recuperação e Destino para ferimentos/lesões,
  iniciativa individual obrigatória e Atrasar, armas e suas qualidades completas,
  aperfeiçoamento de esquadrões de 10, montarias, ataques divididos, esquiva/contra-ataque
  com temporização individual e julgamento dos efeitos de moral pela morte de líderes.

## Incremento — iniciativa pessoal, ferimentos e destacamentos de dez

- `personal-initiative.ts`: iniciativa por Agilidade e Rapidez com desempate e
  rodadas de ações intercaladas. A ativação permanece opcional para proteger os
  cenários de teste que usam ações livres de heróis e para permitir migração gradual.
- `personal-injuries.ts`: dano pendente opcional para decisão do defensor entre
  aceitar o golpe, aplicar ferimentos ou sofrer lesão. Ferimentos exigem Vigor
  disponível, e atingir o teto de lesões causa morte local; ainda não inclui
  o gasto/queima de Destino. Apenas personagens importantes podem mitigar.
- `squads.ts`: gera dez combatentes derivados da tropa em mapa de 1 m.
  Somente dez soldados totalmente derrotados causam a perda consolidada
  de 1 Saúde na unidade de 100, com proteção contra contagem duplicada.
  Isso não é uma simulação individual definitiva de todos os soldados da unidade.
- `personal-weapons.ts`: pequena amostra declarada de armas com dano por
  habilidade, alcance e Perfurante, aplicada a ataques pessoais e ataques
  de indivíduos contra tropas inteiras. Qualidade Cruel está anotada no catálogo,
  mas seu efeito de derrota ainda depende de Destino e resolução narrativa.
  Outras qualidades e treinamento especializado continuam pendentes.
- Novos testes em arquivos `battle-got-personal-initiative.test.ts`,
  `battle-got-personal-injuries.test.ts`, `battle-got-squads.test.ts` e
  `battle-got-personal-weapons.test.ts`.
- A implementação permanece **isolada e não aprovada para produção**.
  Revalidar no HEAD do PR #324 antes de qualquer mesclagem.

## Incremento — Destino, convalescença e iniciativa adiada

- **Destino (capítulo 5):** `personal-fate.ts` contabiliza pontos disponíveis,
  gastos (recarregáveis após marco narrativo) e queimados (permanentemente
  consumidos). Efeitos disponíveis no laboratório: gastar para +1B no próximo
  teste, gastar para compensar −1D no próximo teste; queimar para remover dano
  comum e ferimentos, escolher resultado de derrota ou evitar morte certa
  ficando fora da história. O destino padrão de heróis-modelo é apenas um
  valor de exemplo (dois pontos), sem conexão com personagens oficiais.
  Esquadrões comuns não recebem pontos. Outros efeitos do capítulo 5,
  como ação menor extra, modificação ambiental e alteração de testes de
  oponentes, exigem implementação adicional ou decisão do Narrador.
- **Recuperação (capítulo 9):** `personal-recovery.ts` testa Vigor diariamente
  para ferimentos (dificuldades 6, 9 e 12), ou semanalmente para lesões
  (9, 15 e 21), com agravamento em falha crítica. Uma Cura substitutiva requer
  um curandeiro que atenda durante pelo menos quatro horas; falhas de Cura
  não geram novas lesões/ferimentos. Uma ação explícita separada retira dano
  comum ao encerrar o combate, sem apagar ferimentos ou lesões.
  **Não** representa o avanço de um dia/semana no calendário da campanha:
  o laboratório apenas registra a resolução de um período passado.
- **Iniciativa atrasada:** `personal-initiative.ts` agora permite adiar a ação
  até depois dos outros turnos sem interrupção. Atrasar só é permitido uma
  vez na mesma rodada pessoal; o ordenamento de iniciativa é restaurado
  no começo da rodada seguinte. Reações de interrupção por teste oposto
  de Agilidade continuam fora do escopo atual.
- O ataque individual de herói contra unidade passou a respeitar a
  iniciativa pessoal e aplicar os bônus de Destino na próxima rolagem.
  Testes de comando de Guerra dos heróis também consomem tais modificadores.
- **Novos testes:** `battle-got-personal-fate.test.ts`,
  `battle-got-personal-recovery.test.ts`, `battle-got-personal-delay.test.ts`.
  Os resultados permanecem locais e auditáveis, sem qualquer gravação nas
  fichas oficiais ou alteração do motor Adaptado/D&D.
- **Ainda bloqueia o selo 100% fiel:** implementações restantes de
  gasto/queima de Destino, recuperação em cronologia real e escolha narrativa
  de consequências, esquiva e interrupções avançadas, efeitos de armas
  e armaduras, precisão geométrica, casos de liderança e cerco avançado.

## Incremento — equipamento, montaria e contra-ataque (7/11/2026)

- **Equipamento, capítulos 9, pp. 195–200:** ampliada a amostra do catálogo
  (`personal-weapons.ts`) com a **Besta pesada** e atributos de treinamento,
  recarga, Desajeitada, Lenta e Duas Mãos. Treinamento insuficiente consome
  dados de bônus e, se necessário, impõe dados de penalidade.
  Besta leve requer ação menor de recarga; besta pesada, ação maior.
  Arma Cruel que derrota personagem produz consequência fatal,
  respeitando a escolha de ferimentos/lesões antes do desfecho.
  Pontaria com arma de Longo Alcance sofre −1D por cada 100 m adicionais
  além do alcance efetivo; Curto Alcance usa incrementos de 10 m.
- **Montarias, capítulo 9, pp. 205–206:** `personal-mounts.ts` fornece modelo
  local de cavalo e suas estatísticas. Personagens podem montar, desmontar
  e controlar o animal; a montaria fornece seu Movimento, bônus de +1B
  em Luta contra adversário a pé e +2 ao dano básico da arma de Luta
  quando um animal de guerra não se moveu no turno. Armas Desajeitadas
  geram −2D sobre a montaria. Controlar montaria treinada e íntegra
  custa ação menor; não treinada ou ferida, ação maior.
  **Não está completo** o tratamento de montaria ferida/morta,
  queda, dano do cavalo, corrida montada e atropelamento.
- **Contra-Ataque, capítulo 9, p. 216:** uma ação maior arma reação
  pessoal, que pode atingir antes do ataque inimigo. A variação
  contra carga acrescenta +2 dano básico quando ocorrer uma carga.
  Uma vítima derrubada pela reação perde o ataque interrompido.
  O protótipo está disponível apenas com mitigação manual desligada
  e em trocas **herói contra herói**; ataque de unidade contra
  herói, interrupções com dano pendente e reação contra outras ações
  ainda exigem a máquina completa de estados.
- **Testes:** `battle-got-mounted-reload.test.ts` e
  `battle-got-personal-counterattack.test.ts`, além dos testes de
  regressão preexistentes. Todas as mudanças ficam restritas ao
  motor GOT, sem tocar fichas oficiais nem os motores Adaptado/D&D.
- **Status de equivalência:** as qualidades Adaptável, Poderosa,
  Frágil, Empalar, Enredar, Estilhaçadora, todas as recargas de
  equipamento, Contra Carga do pique e montarias complexas ainda
  não foram integralmente aplicadas. Não declarar fidelidade 100%.

## Incremento — montarias feridas, queda, atropelar e mitigação antecipada

- **Ferimentos e morte do cavalo**, `personal-mounts.ts`:
  qualquer acerto direto contra a montaria reduz sua Saúde no laboratório.
  Cavalo com Saúde reduzida exige ação maior para ser controlado.
  Cavalo morto desmonta seu ocupante. O personagem testa Lidar com
  Animais contra 12: sucesso salta até um espaço livre a 1 m;
  falha causa dano igual ao Atletismo da montaria ignorando VA,
  derruba o personagem e o deixa preso sob o corpo.
  A queda permite mitigação manual de dano voluntária quando ativada,
  antes da aplicação da perda de Saúde.
- **Escapar da montaria caída**, `personal-combat.ts`:
  ação maior de Agilidade ou Atletismo contra 9; se bem-sucedido,
  o cavaleiro continua caído, mas não está mais aprisionado.
  Levantar-se custa ação menor, ou maior quando VA da armadura >= 6.
  Enquanto preso, a Defesa pessoal sofre −5; oponência a pessoa caída
  acrescenta +1D em Luta.
- **Atropelar (ação maior)**: deslocamento do cavaleiro montado numa
  linha reta sobre quadrados de 1 m, teste de Lidar com Animais
  para cada alvo; montaria não treinada aumenta dificuldade em +6
  e cada alvo subsequente recebe +5 na Defesa em Combate. Sucesso causa
  o Atletismo da montaria multiplicado pelos graus de sucesso,
  menos a armadura do alvo. Ainda **bloqueado com mitigação manual
  simultânea**, até haver decisões sucessivas de múltiplos defensores.
- **Contra-ataque + mitigação manual**: o golpe de reação ocorre
  primeiro; caso gere dano pendente, o defensor decide ferimentos
  ou lesões antes de retomar a ação de ataque original. Se a reação
  derrubar o atacante, o golpe original é cancelado. O estado
  transitório `pendingPersonalCounterattack` só existe na batalha
  local e é consumido depois da decisão de dano.
- **Novos testes**: `battle-got-mount-falls-trample.test.ts` e
  ampliação de `battle-got-personal-counterattack.test.ts`.
  Não há migração de banco, publicação ou mudanças de ficha.
- **Ainda ausente**: sobrevivência da montaria com gasto de Destino,
  atropelamento com interrupções de unidades, ataques de montaria
  treinada independente, animais com estatísticas oficiais,
  riscos e coberturas de obstáculos mais complexos, interrupções
  de unidades e outras qualidades de armas. A equivalência 100%
  com o livro ainda não foi atingida.

## Incremento — posturas de combate e três qualidades adicionais (7/11/2026)

- **Mirar (capítulo 9, p. 217):** ação menor para preparar +1B no próximo
  ataque de Luta ou Pontaria. Não permite acumular bônus múltiplos;
  o bônus é consumido pelo teste.
- **Ataque Cauteloso (p. 215):** ação menor com −1D ao teste do
  ataque e Defesa em Combate +3 até começar o próximo turno do
  combatente; essa redução de dados não se acumula.
- **Ataque Imprudente (p. 215):** ação maior de Luta com +1D no
  teste e Defesa em Combate −5 até começar o próximo turno. Não é
  permitido com ataque de Pontaria. As posturas são processadas
  na mesma rolagem que pode disparar contra-ataques preparados.
- **Adaptável (p. 198):** espada bastarda modelo, com empunhadura
  opcional de duas mãos que eleva o dano básico em +1.
- **Poderosa (p. 200):** montante e machado longo podem investir até
  os dados de bônus de Força disponíveis do herói em dano básico
  adicional. Os dados são escolhidos pelo narrador antes da rolagem.
- **Contra Carga (p. 199):** pique apenas dispara em contra-ataque
  preparado contra carga. Essa preparação não é consumida ao ser
  alvo de ataque comum. Ataques diretos de pique são recusados.
- **Escalas integradas:** a seleção de empunhadura e os dados
  investidos afetam tanto ataques pessoais contra personagens
  quanto ataques de um personagem contra uma unidade inteira,
  preservando Defesa +20 da unidade do capítulo 10.
- **Testes adicionais:** `battle-got-personal-stances.test.ts` e
  `battle-got-personal-weapon-qualities.test.ts`.
- **Limites:** o modelo ainda não reproduz todas as qualidades
  da tabela 9-3; efeitos ambientais, montarias e reações em
  sequência com múltiplos alvos precisam de auditoria adicional.
  Não mesclar em produção sem CI e revisão de equivalência.

## Incremento — sequência de atropelamento e três novas qualidades (7/11/2026)

- O atropelamento do laboratório agora percorre a linha de 1 metro em
  **ordem de alvos**; se o defensor puder escolher ferimentos ou lesão,
  o golpe fica pendente e o percurso aguarda a decisão. Quando resolvido,
  a simulação retoma do **próximo metro**, sem repetir ataque, sem gastar
  outra ação maior e sem recalcular as rolagens anteriores.
- O percurso é uma máquina de estado explícita
  (`pendingPersonalTrample`): salva trajetória, índice seguinte,
  número de alvos já atingidos e características da montaria.
  Soldados comuns, que não podem aceitar ferimentos voluntários, têm
  dano aplicado no próprio passo; as decisões de heróis seguintes
  continuam surgindo na ordem correta.
- **Atordoante (cap. 9, p. 198):** uma arma com esta qualidade e
  dois ou mais graus pode trocar um grau de dano pela impossibilidade
  de a vítima executar uma ação maior no próximo turno. A escolha é
  explícita no laboratório. A restrição termina quando a vítima
  conclui seu turno com ações menores.
- **Estilhaçadora (cap. 9, p. 200):** com dois ou mais graus reduz
  primeiro o bônus defensivo da arma/escudo e depois o VA, até o
  valor da qualidade. É aplicada após o dano do golpe, sem retroagir
  sobre a absorção deste mesmo ataque. Também se aplica ao VA de
  unidades militares atingidas por um personagem.
- **Frágil (cap. 9, p. 200):** dois ou mais graus quebram a arma do
  atacante, ainda que a armadura absorva todo o dano. Ataques
  subsequentes com a mesma arma quebrada são bloqueados.
- Novos exemplos do catálogo-modelo: **Marreta**, **Ferramenta de
  Aldeão** e **Mangual com Cravos**, com dados da tabela 9-3.
- Novos testes: `battle-got-trample-manual-mitigation.test.ts`,
  `battle-got-personal-weapon-effects.test.ts` e
  `battle-got-weapon-effects-unit.test.ts`.
- **Limitação explícita:** atropelamento é uma mecânica experimental
  própria do laboratório, sujeita a validação do Narrador para
  equivalência do livro. Agarrar, Enredar, Empalar e efeitos de
  múltiplos equipamentos ainda não integram o catálogo completo;
  o dano do golpe contra montaria ainda não usa todas as qualidades
  da arma. Não modificar fichas oficiais nem publicar o PR sem revisão.

## Incremento — Agarrar, Enredar, Empalar e Ataque Dividido (7/11/2026)

- **Agarrar** (capítulo 9, p. 198): Punho de modelo pode segurar
  um oponente após sucesso de Luta também igualar/superar Atletismo
  passivo. Fonte e alvo ficam impedidos de se deslocar, o agarrado
  sofre −5 em Defesa e pode atacar somente com arma de Briga ou
  lâmina curta. Soltar é ação livre. Escapar exige ação menor e
  teste oposto de Luta. O estado é individual e auditável.
- **Enredar** (p. 200): Chicote e Rede são opções-modelo. Um acerto
  aplica estado de Enredado, reduz Movimento para 1 metro e impõe
  −5 nos testes pessoais. Libertação por ação maior com Atletismo
  ou Agilidade contra Dificuldade 9. Uma arma já prendendo
  outro alvo fica indisponível para novos ataques de Enredar.
  Rede não causa dano básico direto na simulação.
- **Empalar** (pp. 199–200): Lança de javali e pique-modelo recebem
  a qualidade. Com três ou mais graus, exige Atletismo (9).
  Sucesso deixa o alvo preso e impede novo ataque com a arma;
  falha desarma o atacante. O agressor pode remover a arma com
  ação menor, Dificuldade 3 + VA; graus adicionais causam dano.
  O empalado pode removê-la com ação maior e Atletismo (9),
  aceitando um ferimento (ou lesão quando atingir limite).
  A imobilização contra superfícies e a retirada por um aliado
  curandeiro ainda exigem regras e telas adicionais.
- **Ataque Dividido** (p. 205): ação maior exige dois ou mais alvos
  distintos em alcance pessoal, divisão exata dos dados de teste
  de Luta e alocação limitada de bônus. Armas Lentas são
  impedidas; armas Rápidas recebem +1B extra em cada teste.
  O estado `pendingPersonalSplit` permite interromper o
  primeiro ou segundo acerto para mitigação manual e retomar
  sem rolar duas vezes nem gastar outra ação.
- **Integração:** estados de controle e ataques divididos são
  combatidos em escala pessoal de 1 metro, dentro de janelas
  de 5 rodadas do capítulo 10. Soldados de esquadrões destacados
  (10 indivíduos) são alvos individuais; não se aplicam
  indevidamente estados de contenção à ficha da unidade inteira.
  Não altera unidades oficiais, Hub Temporal, Adaptado ou D&D.
- **Testes novos:** `battle-got-personal-control.test.ts` e
  `battle-got-personal-split.test.ts`.
- **Limites conhecidos:** sequência de duas armas e ataques
  combinados ainda não foi concluída. Empalar e agarrar em
  situações narrativas excepcionais, escolha de alvo com
  oponente contido já derrotado, mais ferramentas de
  contenção e interrupções de múltiplas ações requerem auditoria.
  Não declarar equivalência integral ao livro.

## Incremento — duas armas, ataque combinado e imobilização avançada (7/11/2026)

- **Ataque com Duas Armas (capítulo 9, p. 205):** uma ação maior combina
  uma arma principal de Luta com uma arma secundária Mão Inábil.
  No catálogo-modelo, a adaga aumenta em +1 o dano básico por
  grau de sucesso. A mesma adaga oferece +1 à Defesa se não for
  utilizada no ataque. Ao atacar com ambas, a Defesa da arma secundária
  é suspensa até o início do próximo turno. Armas principais de
  Duas Mãos não permitem a combinação.
- **Ataque Combinado (p. 205):** ação maior que distribui dados de Luta
  e bônus por dois ou mais alvos, adicionando o dano da Mão Inábil a
  cada golpe. Reutiliza a sequência `pendingPersonalSplit`, inclusive
  o modificador de dano da arma secundária, para que mitigação manual
  e contra-ataques não dupliquem golpes ou custos.
- **Imobilização de Agarrar (p. 206):** o agarrador pode gastar uma
  ação maior em teste oposto de Atletismo para imobilizar o oponente
  já agarrado. Turnos seguintes exigem outra ação maior para manter
  a imobilização; abandonar a manutenção remove o estado de
  indefeso, mas não libera automaticamente o Agarrar. A vítima só
  pode tentar escapar com uma ação maior e teste oposto de Luta.
  Alvo indefeso perde o componente de Agilidade da Defesa e
  concede +1D aos ataques contra si.
- **Imobilização de Empalar (p. 199–200):** ação maior, Atletismo
  contra Vigor passivo do alvo, para prender o inimigo empalado
  ao cenário. A retirada da arma também limpa a fixação ao cenário.
- **Cura de aliado (p. 200):** um aliado adjacente pode retirar a
  arma empalada com ação maior e teste de Cura (Dificuldade 12).
  Sucesso retira sem dano extra; falha ainda remove a arma,
  causando ao menos 1 ponto de dano e mais um para cada
  5 pontos de diferença. A decisão voluntária por ferimentos
  segue o fluxo do laboratório.
- **Compatibilidade:** foi criado equipamento de Mão Inábil
  apenas nos heróis-modelo; não se alteram fichas oficiais,
  atributos de Casa, estoque de itens, Hub Temporal ou os
  motores Adaptado e D&D. O teste de unidade contra herói
  leva em conta a Defesa da arma secundária.
- **Testes:** `battle-got-personal-dual-combined.test.ts` e
  `battle-got-personal-pin-heal.test.ts`.
- **Pendências:** armamentos secundários adicionais, efeitos
  avançados de Mão Inábil, condições contínuas em todos os
  tipos de ações, escolhas de múltiplos alvos simultâneos,
  automatização dos limites de mão/armadura e auditoria
  integral do livro. A branch permanece para revisão;
  nenhuma declaração de equivalência 100%.

## Incremento — auditoria de equipamentos e vínculos pessoais (7/11/2026)

**Auditoria de consistência** entre o capítulo 9 e o catálogo-modelo:
- Os qualificadores **Montada** e **Duas Mãos** agora aplicam −2D
  respectivamente ao combate a pé e a quem tiver apenas uma mão
  disponível, tanto em herói contra herói quanto herói contra
  unidade coletiva. A interface oferece esse segundo cenário como
  hipótese de teste local; não é atributo da ficha oficial.
- O catálogo foi ampliado com **Cajado, Martelo de Guerra, Broquel,
  Adaga de Mão Esquerda, Arakh, Lança de Guerra, Lança de Torneio,
  Besta Média e Besta Myrish**, com seus qualificadores da
  tabela 9-3. A **Lança de Guerra/Torneio** usa **Lidar com Animais**
  para o dano básico, em vez de Atletismo. A seleção da arma
  secundária é gerada a partir das opções Mão Inábil do catálogo.
- Não é permitido equipar uma arma secundária com arma principal
  de Duas Mãos ou com apenas uma mão disponível.
- **Contenções após derrota/rendição**: vínculos de Agarrar e
  Imobilizar são removidos dos dois personagens quando um dos
  envolvidos fica incapacitado ou se rende. A aplicação central
  do dano cobre ataques de herói, esquadrão e unidade. Redes e
  armas ainda empaladas permanecem fisicamente presas até uma
  ação específica de retirada, mesmo com o agressor derrotado.
- Personagens imobilizados não disparam contra-ataques
  previamente armados; aqueles que estão agarrados, empalados
  ou presos sob a montaria não conseguem burlar a contenção
  atacando diretamente uma unidade coletiva. A penalidade
  de −5 de Enredar também se aplica a esses testes.
- Testes novos: `battle-got-personal-link-integrity.test.ts` e
  `battle-got-personal-equipment-table.test.ts`, cobrindo
  derrota, rendição, reações, restrições de mão, catálogo,
  desempenho contra heróis e unidades.
- **Não indica completude da tabela**: continuam pendentes
  todos os perfis de armas, variações especiais de Escudos,
  ações de interação para apanhar uma arma perdida e
  revalidação narrativa de estados de rede e Empalar.
  Nenhum efeito foi publicado em produção.
