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
| Unidade oficial com stats, equipamentos e benefícios de posses, por snapshot somente leitura | Adaptador puro implementado, interface de importação ainda não conectada |
| Seleção entre GOT, Adaptado e D&D | Implementada no painel do Narrador |

## Itens ainda não equivalentes ao livro (bloqueiam a alegação de 100%)

1. **Fases de heróis (6 e 8):** ações individuais, associação à tropa, dano de heróis, rendição e substituição de comando.
2. **Passo 5, armas de cerco:** disparos por iniciativa, operadores engenheiros, munições, paredes/portões, dano a fortificações.
3. **Passos 1 a 3:** terreno completo (Tabela 10-3), visibilidade, clima, parley, posicionamento alternado, unidade escondida.
4. **Regras avançadas:** todas as ordens avançadas, falange, coluna, cunha, parede de escudos, quadrado, tartaruga, turba, xadrez, ângulo frontal/flanco e retaguarda.
5. **Passo 11:** Glória, prisioneiros, consequência narrativa de recursos, invasão e permanência na terra, tabela de sobreviventes ligada ao estado da engine (a Casa já possui `survivorResult`, mas a arena ainda não a invoca).
6. **Controle preciso:** corrida e carga ainda usam deslocamento ortogonal e corredor simples, sem adjudicação completa de cobertura/obstáculos; reação de Prontidão ainda não dispara condicionalmente.
7. **Integração oficial na interface:** importar/selecionar exércitos de Casas pelo adaptador `snapshotOfficialWarUnit`, registrar versão, escolher comandante pessoal e revisar bônus condicionais.

## Diretrizes de correção

- **Nunca rotular este núcleo como reprodução integral do livro** antes de concluir todos os itens acima e validar contra cenários do livro.
- Não usar o motor PTE/CRZ como fallback do modo GOT.
- Guardar seed, dados, dificuldade, graus, dano e estado na trilha auditável local.
- Nenhuma baixa de simulação altera ficha de Casa nem consome recursos; consequência oficial exige ação e autorização separadas.
- Os perfis-modelo são dados fictícios para teste; não representam personagens históricos do livro.
- Para conflitos de interpretação entre livros/edições, conferir a edição brasileira do usuário.
- Novos replays sempre `rulesVersion=GOT-CH10-1`; não reescrever esquemas PTE.

## Comandos básicos para próxima revisão

Ações disponíveis na arena: ataque, carga, defender, mover, prontidão, reagrupar, reanimar, reorganizar, retirada e retirada agressiva. A interface mostra dados, iniciativas, Disciplina e a condição da tropa. A roda de eventos é exclusivamente local e não salva em produção.

Próximas implementações devem priorizar: (a) precisão de geometrias e prontidão; (b) unidades oficiais em jogo; (c) formação/flanqueamento; (d) heróis; (e) cerco; (f) pós-batalha.
