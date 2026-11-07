# Publicação do laboratório de batalha — 7 de novembro de 2026

**Origem:** PR #324, integrado à `main` no commit `fac7012551d9e906de62ab70003dd7750cdb9fb4`.

## Escopo

- Três escolhas de sistema na interface: Guerra dos Tronos RPG, Adaptado e D&D (o último continua identificado conforme a implementação efetiva).
- Modo Guerra dos Tronos RPG independente, com dados, ordens, Disciplina, fases, condições, cerco, manobras avançadas, tipos de tropas e testes de várias rodadas.
- Laboratório de simulação para o Narrador, com mapa quadrado, posicionamento e recuperação de sessão local no navegador.
- Importação **somente para leitura** das unidades das Casas: nenhuma simulação grava baixas, altera fichas oficiais, recursos, calendário ou contas.
- As regras digitais aproximadas e o grau de cobertura ainda são discriminados em `capitulo-10-cobertura-digital-90-2026-11-07.md`. Não declarar conformidade literal de 90% sem a revisão narrativa.

## Verificações para o lançamento

- PR #324: workflow Validate aprovado (testes, TypeScript, build e bancos).
- PR #324: Battle browser acceptance (synthetic) aprovado.
- Confirmar que Lovable recebeu o commit da branch `main` antes de clicar em Publicar / Update.
- Publicação explícita via Lovable; merge isolado não publica o front-end.
- Smoke test manual: abrir /jogadores, entrar como Narrador, acessar Módulo de batalha, iniciar simulação Game of Thrones, emitir uma ordem, avançar rodada, salvar e retomar.
- Ao testar, conferir também que o Adaptado permanece acessível e que o modo D&D não é representado como completo quando ainda não estiver.

## Contingência

Em caso de falha grave, reverter o commit de lançamento no GitHub e publicar novamente a versão estável pelo Lovable. Não restaurar banco de produção: este lote não requer migrações nem gravações de dados oficiais.
