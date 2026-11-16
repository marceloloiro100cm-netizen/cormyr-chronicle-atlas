# Firebase — panorama da reconciliação de Casas para o Narrador

O módulo `FirebaseHouseReconciliationOverview` em `/firebase-access` oferece, exclusivamente no perfil Narrador, uma conferência **por páginas** das Casas já disponibilizadas pelo catálogo privado da sessão Firebase. A cada clique em “Verificar esta página”, são consultadas no máximo **8 Casas**, em grupos de **2 solicitações simultâneas**.

## Escopo e segurança

- Usa o endpoint existente `POST /api/firebase-house-reconciliation-audit` (PR #538) para cada Casa. **Não cria endpoint novo** e não amplia o acesso: cada consulta verifica token Firebase, revogação, papel de Narrador e condições da Casa novamente no servidor.
- Respeita a flag já existente `CORMYR_FIREBASE_CLOUD_RECONCILIATION_AUDIT_ENABLED`, **desligada por padrão**. Se desligada ou se houver erro de autenticação, IAM ou Firestore, a Casa aparece como **“Consulta indisponível: pendência não verificada”**.
- As páginas não são consultadas automaticamente: o Narrador precisa iniciar cada leitura. Botões de navegação são desabilitados durante uma consulta. Desmontar a tela invalida resultados de chamadas pendentes.
- A página separa contagens de **consultadas**, **indisponíveis** e **sem resultado conclusivo**. Essas contagens **são da página selecionada**: não representam auditoria total das Casas nem porcentagem de migração.
- Os resultados resumidos não retornam saldos privados, hashes, UID, dados brutos ou logs. Somente nome da Casa já autorizado, versão histórica e operacional, e motivo de pendência. A opção “Abrir ficha” utiliza a consulta individual já existente.
- Mesmo com documento e compras conferidos, o painel apresenta **“migração ainda não liberada”**. Não lê nem altera regras, runtime, dados reais, Auth, IAM, flags, armazenamento ou estágio de migração; não cria/provisiona seed nem compra construções.

## Tratamento de inconsistências

Quando falta a ficha operacional e a prévia da seed é válida, o painel registra “Seed ausente; prévia disponível para revisão administrativa”, **sem gravar o rascunho**. Erros individuais não impedem a apresentação segura das outras Casas e nunca são convertidos em sucesso. A API do Narrador permanece responsável pela avaliação real do estado.

## Dependências para liberação real

- [Issue #513](https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas/issues/513): leitura IAM do Firestore continua 403; problema de consulta do Firebase Auth retorna 400 e não deve ser atribuído automaticamente a IAM.
- Revisar snapshots reais, contas desabilitadas, regras e testes de segregação entre Narrador, Jogador da Casa A e Jogador da Casa B antes de ativar flags.
- `readyForCutover=false` continua; resultados de páginas **não** são evidência suficiente para cutover.

## Verificações automatizadas

`FirebaseHouseReconciliationOverview.test.tsx` cobre a ausência de consultas automáticas, limite de 8 Casas e no máximo 2 simultâneas, paginação, erro de uma Casa sem contaminação das demais, rejeição de uma resposta da Casa errada, falta de aprovação global e navegação para a ficha individual.
