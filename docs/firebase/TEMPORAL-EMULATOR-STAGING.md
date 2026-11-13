# Cormyr — conversão do Hub Temporal para Firestore Emulator (lote 2)

## Fontes verificadas

O calendário oficial é a tabela `public.campaign_calendar`, criada
em `drizzle/migrations/0038_harptos_calendar.sql` e atualizada pelas
operações transacionais de
`drizzle/migrations/0060_hub_temporal_atomic_publication.sql`.
Datas são de **Harptos**, não datas gregorianas.

Este lote converte a projeção corrente para:
`migrationTemporalStage/<snapshot>/calendar/current` com
`year`, `month` (0–11), `day` (1–30), `festival`,
`dateKey` (ex.: `1522-01-01` ou `1524-F-shieldmeet`),
`tenday`, `version`, `lastRound` e `autoAdvance`.

O componente de preservação também arquiva **integralmente**, com
SHA-256 e fragmentação determinística para valores grandes, os
documentos destas tabelas em `migrationTemporalStage/<snapshot>/tables`:

- `campaign_calendar`
- `campaign_calendar_audit`
- `campaign_time_operations`
- `campaign_temporal_consumers`
- `campaign_temporal_deliveries`
- `campaign_temporal_delivery_resolutions`
- `campaign_temporal_effect_checkpoints`

A importação é bloqueada se uma dessas sete tabelas estiver ausente,
houver mais de um calendário, um registro quebrado, uma data inválida,
duplicação de ID ou erro de integridade. A presença de tabelas sem
linhas é válida.

## Acesso e integridade

Os registros operacionais e auditorias contêm detalhes privados de
ações administrativas; são **deny-all** nas regras do emulador,
inclusive para narrador, editor, visitante e jogador. A única projeção
legível pelo cliente é `calendar/current`, para narrador autenticado
ou jogador ativo com perfil explícito, sem exigir acesso aos detalhes
internos. Editor e contas sem perfil não podem consultar a projeção.

Todas as gravações cliente são negadas, inclusive ao narrador.
**Não implementamos neste lote** o motor transacional de avanço,
efeitos sobre construções/idades, publicação, resolução de outbox ou
mecanismo de idempotência de ações no Firebase; somente preservação
e modelo de leitura. A migração efetiva desses processos exige
substituir as funções SQL com testes funcionais reais.

`firebase/firestore.rules` de produção não é alterado;
as regras adicionais estão em
`firebase/firestore.domain.rules`, usadas apenas com
`firebase/firebase-domain.json` no emulador.

## Verificar com o backup privado

Após integrar o PR, rode no Cloud Shell:

```bash
ROOT="$HOME/cormyr-chronicle-atlas"
git -C "$ROOT" fetch origin main
WORK="/tmp/cormyr-temporal-$(date +%s)-$$"
git -C "$ROOT" worktree add --detach "$WORK" FETCH_HEAD
NORMALIZED="$ROOT/.firebase-migration/inspecao-12nov-E4pokAhB/normalized"

node "$WORK/scripts/firebase/stage-temporal-emulator.mjs" \
  --normalized "$NORMALIZED"
```

Se `planValid:true`, uma cópia privada pode ser feita no emulador:

```bash
cd "$WORK"
npm install --no-save --package-lock=false firebase-tools@15.35.0 firebase-admin@14.5.1
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
npx firebase emulators:exec --only firestore \
  --project demo-cormyr-migration \
  --config firebase/firebase-domain.json \
  "node scripts/firebase/stage-temporal-emulator.mjs --normalized '$NORMALIZED' --execute-emulator"
```

Não ligar esse servidor ao domínio da campanha. O emulador não
é um backend de produção. A origem Supabase/Lovable permanece intacta.
A publicação foi voluntariamente suspensa.

## Faltam para finalizar

- Executar a carga real neste emulador e reconciliar o calendário.
- Implementar operações temporais idempotentes no backend Firebase e
  os consumidores de mudanças de mês/ano (idades, propriedades,
  unidades, treinamentos, espionagem e eventos).
- Migrar jornal, espionagem, guerra, fichas, API de missivas e demais
  entidades com autorização equivalente.
- Validar Auth dos 14 usuários, provedores e duas contas sem perfil,
  sem criar privilégio por inferência.
- Preparar e testar uma instância Firebase de homologação hospedada,
  sem expor os dados de produção.
- Fazer exportação incremental final, corte controlado e rollback.
