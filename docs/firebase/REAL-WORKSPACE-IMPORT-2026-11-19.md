# Cormyr — acervo real importado e próximos controles (19/11/2026)

A execução protegida [#44504476744](https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas/actions/runs/44504476744)
concluiu com sucesso: **42 tabelas e 1.725 registros históricos** importados no
namespace privado `campaignWorkspaceImports`. Essa confirmação é do importador,
não da integração operacional.

Alguns totais confirmados no log: 118 cartas, 113 respostas, 81 recibos de leitura,
75 registros, 88 versões de registros, 12 agentes, 10 operações de espionagem,
2 edições do jornal e 355 revisões editoriais. As revisões não devem ser
apagadas nem confundidas com edições duplicadas sem reconciliação.

## Serviços adicionados

- `inspectWorkspaceImport`: inspeção privada, só Narrador, de totais e
  metadados de importação; não traz conteúdo, nem prova atuação do site.
- `inspectWorkspaceLinks`: contador privado de referências entre Casas,
  registros, correio, redação e espionagem; identifica relações órfãs
  sem imprimir identificadores ou conteúdo.
- `listOriginalMail`: consulta server-only que lê as tabelas importadas
  e aplica o contrato original `mailPage/mailTrashPage`, após validar
  token Firebase e vínculos atuais de Casa. Não confere poderes com base
  apenas nos dados históricos.
- A execução protegida de auditoria de vínculos usa somente leitura e
  exige a aprovação do ambiente GitHub `firebase-auth-test-activation`.

## Limites de aceite

1. As interfaces legadas `PlayersArea`/Redação ainda utilizam
   `src/lib/visual-preview`; o novo backend **não** substitui automaticamente
   o mock. Não afirmar que a tela original já salva ou lê os dados novos.
2. O importador não sobrescreveu dados operacionais existentes. Aprovar
   e executar verificações por perfil antes de substituir leitores/gravadores.
3. Importação da origem não prova reconciliação de deltas posteriores,
   permissões ao vivo, anexos de Storage, alterações de rodada ou auditoria de ações.
4. Editor-chefe não pode ler missivas. Cada jogador só pode ler o
   conjunto permitido pelo servidor, mesmo que o arquivo tenha associações
   históricas mais amplas.
5. A importação do jornal preserva revisões históricas sem torná-las
   automaticamente publicações independentes.

## Resultado da auditoria Cloud executada

A primeira auditoria protegida [#44510616229](https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas/actions/runs/44510616229)
verificou as 42 tabelas e confirmou **zero referências órfãs**. A execução foi
marcada para revisão porque o verificador consultava o campo inexistente
`spy_operations.agent_id`, em vez do campo correto `spy_operations.asset_id`.
Todas as 10 operações importadas usavam o nome correto. Corrigido o contrato
de auditoria, sem alterar nenhum registro do Firebase. O verificador também
expectava `spy_regional_connections`, nome não presente no catálogo SQL,
nas migrações ou nas 42 tabelas importadas; essa expectativa espúria foi removida.
Ainda é necessário executar novamente a auditoria protegida para comprovar
zero campos faltantes com a versão corrigida. O resultado de uma auditoria
anterior não autoriza a liberação de alterações de dados.
