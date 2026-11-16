# Firebase Cloud — reconciliação agregada de Auth com perfis

## Objetivo

Conferir, usando a identidade **do operador no Cloud Shell**, os vínculos
das contas existentes no Firebase Authentication com os documentos
`migrationDomainStage/{snapshotId}/access` do **mesmo snapshot privado**.

Esta operação não ativa usuários, não modifica perfis nem concede acessos.
Mesmo que o resultado indique 100% dos vínculos, permanece
`releaseDecision=NO_GO` e `readyForCutover=false`; ainda são necessárias
reconciliação com a origem e aceitação real por perfis.

## Execução curta no Cloud Shell

Com a conta apropriada no projeto `cormyr`, execute:

```bash
set -euo pipefail
AUDIT="$(mktemp --suffix=.mjs)"
trap 'rm -f "$AUDIT"' EXIT
curl -fsSL --retry 2 \
  "https://raw.githubusercontent.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas/main/scripts/firebase/cloud-role-linkage-readonly.mjs" \
  -o "$AUDIT"
node "$AUDIT"
```

O script utiliza apenas Node.js, `gcloud auth print-access-token` e
`fetch` nativo, não faz `npm install` e não usa Supabase. O token
temporário permanece na memória do processo e não é gravado.

## Limites de segurança

- Consultas estritamente GET: listagem de metadados de **um único** snapshot,
  listagem de no máximo 1000 contas Auth e listagem de no máximo 1000
  documentos de perfil do snapshot.
- A chamada Identity Toolkit usa `X-Goog-User-Project: cormyr`. O Firestore
  conserva o cabeçalho padrão; nenhuma URL, projeto ou snapshot externo é
  fornecido por argumentos.
- A leitura de perfis aplica máscara somente aos campos `userId`, `profile`,
  `active`, `admin`, `requirePasswordChange`, `memberHouseIds` e
  `editHouseIds`; não lê conteúdo narrativo, cartas, finanças ou mídia.
- A saída apresenta apenas contagens por categoria. Não divulga hash de
  snapshot, UID, nomes, e-mails, IDs de Casas, token ou mensagens de erro.
- Páginas incompletas, UIDs inválidos/duplicados, snapshot inexistente ou
  respostas HTTP de erro não permitem afirmar que a reconciliação está
  completa.
- `structurallyEligibleProfiles` é só a contagem de perfis com campos
  compatíveis (papel, flags e associação básica). **Não** é autorização para
  login, não valida permissões reais por Casa nem provas de E2E.
- A conta OIDC de GitHub Actions permanece independente da conta Cloud Shell;
  este script não amplia permissões de nenhuma delas.

## Evidência anterior

Em 16/11/2026, um diagnóstico com cabeçalho de quota confirmou HTTP 200 no
Firebase Auth: **14 contas e 14 desativadas**, sem próxima página. O
`migrationPublicContentStage` e os runtimes de missivas/operações ainda
estavam ausentes, mantendo `NO_GO`. O novo diagnóstico verifica o próximo
bloqueio: vinculação dos 14 Auth UIDs à projeção de acesso efetivamente presente
no Firestore.

Testes sintéticos: `node --test scripts/firebase/cloud-role-linkage-readonly.test.mjs`.
