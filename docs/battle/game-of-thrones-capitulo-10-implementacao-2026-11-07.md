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
| Desorganizar, debandar, destruir e retirar unidades do mapa | Implementação funcional inicial |
| Continuação de ataques e defesas na etapa de ordens permanentes | Implementação funcional inicial |
| Unidade oficial com stats, equipamentos e benefícios de posses, por snapshot somente leitura | Implementada com endpoint protegido de Narrador e escolha de Região, Casa, unidade e posição; somente fichas completas (não converte importação de NPC) |
| Terreno e modificadores de clima/visibilidade, deslocamento e obstáculos | Implementação inicial e editor de mapa quadrado (precisa conferir variantes e linha de visão) |
| Formações e ângulo frontal | Nove formações cadastradas; ordens e flanco opcional em laboratório; reações e restrições ainda incompletas |
| Tabela de sobreviventes (10-6) e Glória (10-5) | Prévia local determinística e sem mutação oficial; resolução narrativa ainda pendente |
| Passo 5 — catapulta, cospe-fogo, escorpião, manganela e trabuco | Catálogo, alcance, operadores engenheiros, limite de quatro equipamentos por unidade, custo de uma ordem para disparar, recarga alternada e rolagens incorporados à arena; munições especiais e dano estrutural pendentes |
| Fortificações do livro (pp. 227–228) | Tabela de Defesa +3/+4/+6/+8/+12, capacidade de ocupação, obras temporárias com seis horas e bônus de engenheiros, com defesa e sabotagem na engine |
| Passos 6 e 8: heróis individuais | Janelas de cinco rodadas, entrada/saída da unidade, bônus de Disciplina e +1D, sucessão de comando, testes Guerra para reorganizar/reanimar e risco de dano sem VA; combate individual do capítulo 9 ainda não integrado |
| Ordens avançadas | Ataque exploratório, fogo de supressão, preparação contra carga, emboscada, junção, sabotagem e **Empurrar** (+3 em comando, Luta × Atletismo passivo, 10 m por grau com bloqueios e terreno) incorporadas em protótipo auditável; demais manobras pendentes |
| Rendição e erros críticos de retirada | Rendição geral testa cada unidade ativa; falhas críticas de retirada e retirada agressiva geram consequências distintas |
| Seleção entre GOT, Adaptado e D&D | Implementada no painel do Narrador |

## Itens ainda não equivalentes ao livro (bloqueiam a alegação de 100%)

1. **Fases de heróis (6 e 8):** janelas de 5 rodadas e ações de guerra já integradas; ainda faltam resolução completa do **combate individual conforme capítulo 9**, ataques de personagens contra unidades, unidades contra heróis, integração das fichas oficiais dos personagens e comandos com heróis reais.
2. **Passo 5, armas de cerco:** implementação inicial inclui iniciativa, operadores, disparos/recarga e Defesa de fortificações ocupadas. Ainda faltam efeitos completos de munição incendiária, dano a estruturas/portões, especialidades de fortificações e personagens como alvos.
3. **Passos 1 a 3:** terreno, clima e visibilidade estão em versão inicial, mas ainda faltam todas as variantes da Tabela 10-3, efeitos de cobertura em construções, linha de visão, parley, posicionamento alternado e unidade escondida.
4. **Regras avançadas:** já há formações, flanco e rotinas iniciais de ataque exploratório, fogo de supressão, contra-carga, emboscada, junção e sabotagem; faltam ataque dividido, ataque relâmpago, atropelar, envolver, escalar muralhas, pinça, martelo e bigorna, terra arrasada e condições completas de reações/posicionamento.
5. **Passo 11:** tabelas de Glória e sobreviventes agora são prévias locais, sem gravação; faltam prisioneiros, consequências de recursos, ocupação e permanência, variações de cenário e revisão/aceite do Narrador.
6. **Controle preciso:** corrida e carga ainda usam deslocamento ortogonal e corredor simples, sem adjudicação completa de cobertura/obstáculos; reação de Prontidão ainda não dispara condicionalmente.
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

Ações disponíveis na arena: ataque, carga, defender, mover, prontidão, reagrupar, reanimar, reorganizar, retirada, retirada agressiva, rendição geral e, opcionalmente, formação, giro e reversão. A interface mostra dados, iniciativas, Disciplina e a condição da tropa. A roda de eventos é exclusivamente local e não salva em produção.

Próximas implementações devem priorizar: (a) combate individual do capítulo 9 nas janelas dos heróis; (b) completar munições especiais, fortificações destrutíveis e armas de cerco; (c) linha de visão, reações de prontidão e geometria completa de movimento; (d) manobras avançadas ainda pendentes; (e) exércitos de qualquer tamanho, NPCs com ficha oficial e comandantes/heróis reais; (f) persistência/replay e consequências narrativas com autorização explícita.
