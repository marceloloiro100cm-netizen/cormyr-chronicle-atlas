# Aceitação integrada dos domínios Firebase (somente emuladores)

Em 15/11/2026, adicionamos o workflow `Firebase cross-domain acceptance — isolated emulator` para executar **20 scripts de integração já existentes** em **cinco grupos paralelos**. Eles usam dados fictícios e os emuladores locais de Auth/Firestore, não os dados da campanha. Nenhum segredo, projeto Cloud real ou usuário de produção é necessário.

## Matriz de testes

| Grupo | Testes de integração | Itens do plano atendidos na bancada |
| --- | --- | --- |
| Casas | `noble-house-service`, `character-service`, `record-service`, `schedule-service` | 11, 14, 17 |
| Comunicações | `mail-command-service`, `letter-inbox-service`, `mail-unified-service`, `newspaper-service` | 6 (proteções), 12, 13 |
| Estratégia | `spy-agents-service`, `spy-missions-service`, `spy-intel-service`, `battle-service` | 15, 16 |
| Operações | `time-service`, `scheduled-jobs`, `drive-service`, `storage-access-service`, `storage-resolvers` | 14, 20, 21, 22 |
| Segurança | `lot5-role-security`, `private-gm-service`, `domain-bridge` | 9, 17, 23, 24 (homologação sintética) |

Cada teste deve passar integralmente. A falha de **um** serviço reprova o grupo e mantém sua entrega bloqueada. Os testes não montam conexões para `cormyr` ou outras bases Firebase Cloud: o runner só permite o projeto fixo `demo-cormyr-migration` e hosts de emulador em loopback, com o Auth Emulator ativo. As operações usam scripts fixos, nunca argumentos de shell arbitrários.

## Comandos de reprodução em ambiente local isolado

```bash
node --test scripts/firebase/full-domain-emulator-acceptance.test.mjs
npx firebase emulators:exec --only firestore,auth \
  --project demo-cormyr-migration \
  --config firebase/firebase-all.json \
  "node scripts/firebase/full-domain-emulator-acceptance.mjs communications"
```

Para os demais grupos, usar `houses`, `strategy`, `operations` ou `security`. É necessário ambiente local com Node.js 24, Java 21, `firebase-tools` e `firebase-admin`. Não usar esses comandos no projeto de dados real.

## Portões que este workflow NÃO resolve

- Item 6: correspondência de todas as missivas ambíguas reais (requer backup atualizado privado).
- Item 9: identidade e permissões **reais** após migrar para Firebase Auth Cloud.
- Itens 11–17: integração das telas reais de `/jogadores` e equivalência completa dos cálculos com o banco Supabase ativo.
- Item 18: ativação dos adaptadores Firebase no site final; segue propositalmente desativada.
- Item 19: migração de realtime do frontend para Firebase; não é simulada pelo runner.
- Item 20: reconciliação byte a byte de todos os cinco buckets e autorização de mídia em produção.
- Item 21: sincronização Google Drive com arquivos reais e escrita protegida contra conflitos.
- Item 22: criação de Cloud Scheduler real sem duplicação de jobs históricos.
- Itens 23–24: testes autenticados na nuvem com Narrador, Jogador A, Jogador B, Editor-chefe, anônimo e revogação de sessão.
- Item 25: performance e custos reais no Firebase Cloud, com limiares aprovados.
- Item 26: ensaio completo de rollback a partir de um backup atual na infraestrutura de homologação autorizada.

Mesmo com 20 testes verdes, **`readyForCutover=false`**. A liberação deve obedecer a `docs/firebase/CUTOVER-RUNBOOK.md`, `lot9-cutover-gate.mjs` e ao aceite explícito do proprietário. A origem Supabase permanece intacta.
