# Extensão final da fase B — Retomar batalhas salvas

Data: 2026-11-05.

## Objetivo
Completar a experiência do Narrador preservando a release já integrada (#263).
A API `checkBattlePersistence` e suas verificações dinâmicas de JWT, Narrador, acesso ativo, service_role e tabelas continuam **intocadas**.

## Funcionalidade
- Ao abrir um replay salvo e verificado pelo servidor, o Narrador pode clicar em **Retomar batalha · salvar nova cópia** se o estado for `active`.
- A simulação retoma exatamente o estado com SHA-256 verificado. O Narrador pode continuar comandando unidades, inclusive IA local determinística.
- **Salvar cópia da batalha** grava novo replay inteiro em uma nova sessão com sua própria cadeia de hashes. O registro original não é modificado.
- Batalhas concluídas permanecem em consulta/replay/exportação; não são reabertas para alterar o resultado.
- Se a capacidade de persistência estiver indisponível, a arena ainda oferece exportação JSON sem afetar dados oficiais.

## Confiança e segurança
- Nenhuma migração ou alteração nas tabelas SQL já instaladas em produção.
- Nenhuma gravação em fichas militares, recursos, missivas ou Hub Temporal.
- Sem token JWT real testado em navegador: verificar no pós-deploy. O CI testa o ciclo lógico exportar → reabrir → continuar → novo replay com hashes verificáveis.
- Em eventual problema, reverter apenas este commit ou definir o kill-switch da fase B no runtime/build. **Não fazer DROP das tabelas nem apagar sessões salvas.**

Referência: `docs/battle/release-persistence-production-2026-11-05.md`, issue #260.
