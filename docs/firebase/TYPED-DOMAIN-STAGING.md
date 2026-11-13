# Modelo Firestore tipado — lote 1 (homologação local)

Este lote começa a conversão funcional do PostgreSQL para Firebase, sem alterar a aplicação ou publicar dados em nuvem. O backup preservado foi verificado no Cloud Shell: **98 tabelas, 3.455 registros públicos e 6 fragmentos íntegros**. Esta transformação cobre **apenas quatro domínios**; as demais tabelas continuam preservadas no arquivo bruto do emulador.

## Coleções no emulador

Sob `migrationDomainStage/<hash-do-snapshot>/`:

| Coleção | Origem | Campos de aplicação |
| --- | --- | --- |
| `houses` | `public.campaign_houses` | `sourceId, name, castle, crest, season, active` |
| `players` | `public.campaign_players` | `id, userId, name, active, requirePasswordChange, rosterHouseId` |
| `access` | `auth.users` + `public.user_roles` + `public.campaign_access_profiles` + `public.house_memberships` | `profile, admin, active, playerId, memberHouseIds, editHouseIds, attrHouseIds` |
| `letters` | `public.campaign_letters` | `sourceId, senderUid, senderPlayerId, recipientPlayerId, recipientHouseId, subject, content, createdAt` |

Apenas o UID da conta é utilizado como referência de autorização. **Não são copiados hashes de senha, emails, `auth.identities`, detalhes internos das Casas ou demais campos do PostgreSQL.** O arquivo bruto privado já preserva os dados que não entram nesta visão mínima.

Os tipos são convertidos em memória: booleanos PostgreSQL (`t/f`), temporada numérica e horário ISO. IDs das coleções de conteúdo usam hash determinístico, conservando os IDs de origem no campo específico para relacionamento. São preservados os vínculos reais de `house_memberships`; selecionar um brasão ou alterar `rosterHouseId` não concede autorização.

## Segurança nesta etapa

As regras de teste `firebase/firestore.domain.rules` e o arquivo `firebase/firebase-domain.json` são **exclusivos do emulador**. Não substituem `firebase/firestore.rules`, que permanece com negação total para o projeto real.

- Narrador ativo exige **perfil narrador e papel administrativo** na origem.
- Jogador exige perfil explícito ativo, ficha ativa e nenhum bloqueio de troca de senha.
- Editor não herda a Casa da ficha, nem recebe permissões de missivas.
- Contas sem perfil permanecem com `profile: null`, inativas e sem direitos; não são criados perfis automaticamente para as duas contas pendentes.
- Missivas: leitura apenas de documento individual permitido ao narrador, remetente jogador, destinatário jogador ou membro da Casa destinatária; `list`, inclusão, resposta e edição por SDK cliente permanecem negadas.
- Nenhuma gravação cliente em Casas, jogadores, acessos ou missivas. Enviar missivas e listagens privadas exigirão funções backend transacionais com autorização atual, **não implementadas ainda**.
- A visão de Casa é deliberadamente mínima, sem `details`. A visão de jogador e a de acesso são privadas.

Os testes com emulador real verificam acesso cruzado de Casas, editor com alegação falsa de administrador, ausência de perfil, leitura do próprio jogador, missivas enviadas/recebidas, negação de escrita e revogação de vínculo.

## Como executar sobre o backup local

Depois de integrar o PR ao GitHub, no Cloud Shell:

```bash
ROOT="$HOME/cormyr-chronicle-atlas"
git -C "$ROOT" fetch origin main
git -C "$ROOT" worktree add --detach /tmp/cormyr-domain-stage FETCH_HEAD
cd /tmp/cormyr-domain-stage

NORMALIZED="$ROOT/.firebase-migration/inspecao-12nov-E4pokAhB/normalized"
node scripts/firebase/stage-typed-domain-emulator.mjs --normalized "$NORMALIZED"
```

O resultado contém somente contagens e inconsistências, sem missivas ou IDs. Se `planValid: true`, é possível importar em emulador **isolado**:

```bash
npm install --no-save --package-lock=false firebase-admin@14.5.1 firebase-tools@15.35.0
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
npx firebase emulators:exec --only firestore \
  --project demo-cormyr-migration \
  --config firebase/firebase-domain.json \
  "node scripts/firebase/stage-typed-domain-emulator.mjs --normalized '$NORMALIZED' --execute-emulator"
```

Esse comando usa o modelo de homologação, não importa contas Auth nem altera Firestore, Storage ou regras da nuvem.

## Critérios para o próximo lote

1. Executar o novo `dry-run` no backup real; corrigir divergências de schema e relações, sem omitir linhas.
2. Verificar contagem de Casas, jogadores, vínculos e missivas contra o PostgreSQL normalizado.
3. Implementar modelos dos módulos calendário/Hub temporal, jornal, espionagem, batalhas e fichas.
4. Criar backend seguro para gravação e listagem de missivas e para alteração de permissões (sem depender de claims obsoletos).
5. Validar contas especiais, revogação em tempo real, isolamento por Casa e regras funcionais antes de liberar Firebase Authentication/Firestore em nuvem.
6. Realizar reconciliação final com a origem ativa e planejamento de corte/rollback; o site continua operando na origem.

**Não disponibilizar regras de homologação como regras de produção** nem fazer a integração por copiar estes documentos diretamente para coleções públicas.

## Auditoria real de 13/11: 15 referências não resolvidas

O usuário executou o dry-run tipado contra o backup privado já validado
e obteve **11 Casas**, **11 jogadores**, **14 contas**, **101 missivas
convertíveis**, **2 contas sem perfil** e **15 vínculos órfãos**.
A versão original não distinguia o tipo de referência inválida e
encerrava corretamente com `planValid:false`. Nenhuma gravação cloud.

Foi incluído `orphanLinksByType`, um **diagnóstico por categoria,
somente agregado**, separado em:

- referências administrativas ou de perfil sem conta no backup;
- jogador sem conta e referência de Casa do elenco não resolvida;
- associação sem ficha, Casa ou usuário;
- remetente de missiva sem conta de Auth;
- destinatário de missiva sem jogador ou Casa;
- formato de destinatário inválido.

O relatório também exibe `sourceRowCounts` para detectar eventual
diferença entre linhas da tabela e linhas convertidas. Ele **não revela
identificadores, nomes, assuntos, conteúdo de missivas ou hashes por
registro**. Nenhuma linha é apagada do backup original.

Não presumir que as 15 anomalias são missivas de usuários excluídos,
nem que os perfis faltantes devam receber acesso. A saída indicará
qual tratamento seguro é necessário: mapear a identidade original quando
possível, preservar correspondência histórica em quarentena sem
conceder permissões, ou diferenciar uma referência de exibição
não autorizativa de um vínculo de acesso obrigatório.

No Cloud Shell, após integrar a atualização ao GitHub:

```bash
ROOT="$HOME/cormyr-chronicle-atlas"
git -C "$ROOT" fetch origin main
node "$ROOT/scripts/firebase/stage-typed-domain-emulator.mjs" --normalized \
  "$ROOT/.firebase-migration/inspecao-12nov-E4pokAhB/normalized"
```

**Atenção:** se o checkout principal estiver desatualizado, executar
em um worktree limpo do commit baixado em vez de usar o caminho direto.
Manter `planValid:false` até resolver ou isolar com segurança as
referências; não usar `--execute-emulator` enquanto houver bloqueios.

## Lote 1.2 — Preservação das 15 missivas com destinatário indefinido

O diagnóstico final, executado sobre o backup privado, confirmou 15 casos
**exclusivamente** na categoria `letterRecipientShapeInvalid`. Os demais
vínculos estão íntegros:

- 116 linhas em `public.campaign_letters`;
- 101 correspondências com exatamente um destino (Casa ou jogador);
- 15 com **zero ou dois** campos de destinatário preenchidos;
- zero problemas de remetente, jogador, Casa, perfil, duplicação ou flags.

A auditoria por categoria anterior **não diferencia** os casos sem destinatário
dos casos com dois destinatários. O importador agora retorna `recipientShapes`,
com contagens anônimas `missingBoth` e `bothPresent`, sem revelar nomes,
IDs, assuntos ou conteúdos.

A coleção `lettersQuarantine` é separada de `letters`. Para cada registro
nessa coleção, preserva a linha SQL normalizada inteira (`columns` e
`rawValues`, strings/null, inclusive valores históricos), com ID de
documento determinístico. Não atribui destinatário nem reescreve conteúdo.

**Acesso à quarentena:** as regras do emulador têm uma cláusula explícita
`allow read, write: if false`, para todos os usuários, inclusive narrador,
editor e jogadores. Nenhuma carta em quarentena entra na coleção de missivas
endereçadas. A futura revisão deverá ser feita offline por administrador
autorizado, sem abrir uma rota pública de acesso.

A conversão só poderá prosseguir quando:
- `issues` for integralmente zero;
- `letterCoverage.complete` for `true`;
- `letterCoverage.source == letterCoverage.addressed + letterCoverage.quarantined`;
- todas as tabelas obrigatórias estiverem presentes;
- documentos couberem nos limites conservadores;
- `planValid:true` em teste privado.

O fato de `planValid:true` autorizar a cópia **somente ao Firestore Emulator**
não libera publicação, distribuição dessas cartas ou importação em nuvem.
`readyForCloudImport:false` permanece, e os dois usuários sem perfil não
recebem direitos automaticamente.

### Verificação no Cloud Shell

Depois do merge, execute o dry-run sem acesso cloud:

```bash
ROOT="$HOME/cormyr-chronicle-atlas"
git -C "$ROOT" fetch origin main
WORK="/tmp/cormyr-letters-audit-$(date +%s)-$$"
git -C "$ROOT" worktree add --detach "$WORK" FETCH_HEAD
node "$WORK/scripts/firebase/stage-typed-domain-emulator.mjs" \
  --normalized "$ROOT/.firebase-migration/inspecao-12nov-E4pokAhB/normalized"
```

Resultado esperado de reconciliação: **116 = 101 + 15**. Os valores de
`recipientShapes` devem somar 15, mas a distribuição exata ainda não é
conhecida até executar o novo dry-run no backup real. Não enviar conteúdo
ou IDs das missivas para o GitHub ou para logs públicos.
