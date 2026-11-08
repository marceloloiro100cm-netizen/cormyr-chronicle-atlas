# Cormyr — simulação de batalhas para jogadores (preparação sem liberação)

Data: 8 de novembro de 2026. **Não habilitar o menu dos jogadores nem publicar essa preparação em produção.**

## Produto
O jogador poderá escolher um dos três sistemas no mesmo painel Batalha: Game of Thrones, Adaptado (V3 com casas-modelo) e D&D simplificado. Cada partida roda localmente sem modificar fichas, exércitos, recursos, baixas, calendário, missivas ou decisões do Narrador.

- Game of Thrones: usa somente tropas-modelo; a leitura de unidades oficiais do Narrador é ocultada e ignorada na montagem do jogo. O salvamento da simulação é local e usa chave separada da do Narrador.
- Adaptado: reutiliza `BattleV3Game` com exércitos fictícios já disponíveis no fluxo antigo.
- D&D: utiliza o motor existente `BattleCrzLab` com `playerSandbox`, 16 perfis de unidades e cinco monstros originais fictícios. Não carrega o catálogo privado de 300 fichas, nem ajustes e fichas pessoais do Narrador. Oculta e bloqueia salvar/retomar no banco privado, importar replay e os controles de administração de tropas e vitória. A partida tem d20 e movimentação, com implantação automática.
- Não há multiplayer real nesta mudança. O adversário pode ser a IA local ou participante no mesmo dispositivo, conforme as opções de cada motor.

## Gates e isolamento
1. `BATTLE_PLAYERS_ENABLED=false` **permanece inalterado**; a rota do jogador continua sem menu Batalha. O código não é usado em produção por jogadores enquanto o Narrador não autorizar.
2. Nenhuma política SQL ou RLS do bestiário é afrouxada e nenhum novo endpoint privilegiado é introduzido.
3. Os testes verificam separação de dados privados e chave de salvamento GOT, modo D&D sem cargas administrativas e disponibilidade das três opções.
4. Release futura, separada e sujeita a aceite real: autenticação de jogador com vínculo ativo, ausência de leitura das tabelas privadas, jogo completo nos três sistemas, regressão do Narrador, banco, TypeScript e build.
5. Antes de abrir acesso, considerar se os cinco monstros autorais de teste são suficientes ou se haverá catálogo distinto e licenciado para jogadores.

**Escopo explícito desta entrega:** implementar e deixar pronto para revisão, sem ativar o acesso ao público.
