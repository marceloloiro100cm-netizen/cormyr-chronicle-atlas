# Lote inicial — seletor de regras de batalha (07/11/2026)

## Decisão
Criar três opções no painel do Narrador, independentes do formato de malha:
1. **Game of Thrones** (objetivo futuro: aderência integral às regras de Guerra de *A Guerra dos Tronos RPG*).
2. **Adaptado** (motores atuais PTE-2.0, V3 e CRZ; continua executável).
3. **D&D** (objetivo futuro: combate simplificado com bônus de ataque, CA, PV, deslocamento e catálogo de monstros).

## Entrega deste lote
- Seleção por botões de rádio, com estado visível e navegação por teclado.
- Modo Adaptado selecionado por padrão: toda a preparação, simulações e ferramentas existentes continuam sem mudanças de mecânica.
- Game of Thrones e D&D são selecionáveis, porém explicitamente **não executáveis** até implementação e testes. Não há encaminhamento silencioso para o motor Adaptado.
- Nenhuma alteração de schema de batalhas/replays, persistência, credenciais, fichas, XP, perdas, missivas ou Hub Temporal.
- Batalhas já salvas continuam associadas às regras que as criaram; selecionar outro modo não as converte.

## Contratos para os próximos lotes
- **Game of Thrones:** motor próprio com ordem/Disciplina/Guerra, testes, formações, moral e tabelas de consequência/sobrevivência; validá-lo contra a edição do livro adotada.
- **D&D:** definir edição, origem/licenciamento dos blocos de estatísticas, modelo de monstro, CA, bônus de ataque, PV, deslocamento, ações, iniciativa, dados e dano. Importar somente fontes permitidas e validadas.
- **Adaptado:** manter compatibilidade com PTE-2.0/V3/CRZ e com a migração para quadrados desenvolvida no PR #322.
- Antes de liberar qualquer novo modo, revisar motor, serializers, replay, autorização e testes de regressão com dados fictícios.

## Critérios de entrega
- [x] IDs estáveis e separação de disponibilidade entre motores
- [x] Interface inicial acessível com três modos
- [x] Motor legado permanece disponível
- [x] Modos futuros não executam mecanismo incorreto
- [ ] Testes e build de CI aprovados no SHA final
- [ ] Homologação visual desktop/celular
- [ ] Aprovação para produção

Não é implantação em produção.
