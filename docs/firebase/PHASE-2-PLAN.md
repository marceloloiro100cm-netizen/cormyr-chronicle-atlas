# Fase 2: dados, login e arquivos no Firebase

Fase 1 (saída do Lovable) está em `docs/firebase/LEAVING-LOVABLE.md`. Esta fase
decide **onde ficam os dados** e migra por fatias, sem corte único.

## Onde estamos

- Dados pequenos: 148 tabelas, cerca de 5,2 mil linhas, 14 contas de login e 986
  imagens. Copiar dados não é o problema (já existe round-trip no emulador).
- O custo está na lógica: o banco tem 146 funções SQL, 36 triggers e 89 políticas
  RLS; o código usa 79 RPCs distintas e 52 tabelas em 150 arquivos.
- Já existe, só em emulador: arquivo bruto no Firestore, modelo tipado de Casas,
  jogadores e missivas, importação de Auth (BCRYPT), Hub Temporal e motor de
  comandos de missivas. Nada disso está ligado ao site.

## Mapa de acoplamento por módulo

Ordenado por peso (RPCs e tabelas usadas). "Auth" conta chamadas a `supabase.auth`.

| Módulo | Arquivos | Tabelas | RPCs | Observação |
| --- | --- | --- | --- | --- |
| `components/players` (missivas, registros, admin) | 10 | 17 | 22 | Núcleo do Conselho |
| `components/calendar` | 6 | 0 | 21 | Só RPCs (Hub Temporal) |
| `lib/newspaper` | 1 | 9 | 9 | Mais usos de Storage (13) |
| `lib/house` (fichas, livro-razão) | 5 | 13 | 6 | `noble_house_sheets` em 17 pontos |
| `lib/espionage` | 10 | 2 | 8 | Regras em RPC |
| `lib/battle` | 4 | 8 | 5 | Sessões e partidas ao vivo |
| `lib/drive-executor` | 1 | 10 | 3 | Fila e vínculos do Drive |
| `routes`, `lib/auth`, `integrations` | 10+ | 3 | 4 | 13 usos de Auth |

Tabelas mais usadas: `campaign_records` (19), `campaign_houses` (18),
`noble_house_sheets` (17), `drive_sync_bindings` (16), `campaign_players` e
`house_memberships` (15 cada). RPCs mais usadas: `is_campaign_admin` (43),
`campaign_access_active` (14), `save_campaign_record` e `in_campaign_house` (9).

## Decisão de arquitetura (precisa da sua escolha)

| | A. Firestore completo | B. Cloud SQL via Firebase SQL Connect | C. Auth, Storage e Hosting no Firebase; banco segue Postgres |
| --- | --- | --- | --- |
| O que muda | Reescrever as 146 funções SQL e as 89 políticas como serviços e regras do Firestore | Levar o schema e as funções para Cloud SQL (PostgreSQL) e chamar por SQL Connect | Só login e arquivos migram; o banco continua no Supabase |
| Lógica de jogo | Reescrita e retestada, com risco de divergência | Preservada | Preservada |
| Esforço | Maior (semanas) | Médio | Menor |
| Custo | Por uso, tende a ser baixo | Instância Cloud SQL com custo fixo mensal | Sem mudança no banco |
| Depende de preview | Não | Sim: SQL nativo do SQL Connect está em Preview, sem SLA | Não |
| Vantagem | Tudo no Firebase, tempo real | Tudo no Google, mantém SQL e transações | Entrega rápida e reversível |
| Risco | Alto | Médio | Baixo; ainda depende do Supabase |

Fatos verificados: o Firebase Data Connect foi renomeado para Firebase SQL Connect,
roda sobre Cloud SQL (PostgreSQL) e oferece SQL nativo, incluindo procedimentos e
funções, com o usuário autenticado disponível como parâmetro. O recurso de SQL
nativo está marcado como Preview. A compatibilidade do Supabase com tokens do
Firebase Auth (autenticação de terceiros) precisa ser confirmada na conta antes
de depender dela na opção C.

**Recomendação:** começar pela opção C e decidir entre A e B depois, com o site
já fora do Lovable e usando Firebase Auth e Storage. A fatia 0 e a fatia 1 abaixo
valem para qualquer opção.

## Fatias (em ordem)

**Fatia 0, login no Firebase Auth** (vale para A, B e C)
- Importar as 14 contas preservando UIDs e hashes BCRYPT (script existente
  `scripts/firebase/stage-auth-emulator.mjs`, hoje só em emulador).
- Substituir `supabase.auth.*` (cerca de 30 usos) por um adaptador único e o
  middleware `requireSupabaseAuth` por verificação de ID token do Firebase.
- Resolver as 2 contas sem perfil e o vínculo `custom:` (relink).
- Aceite: login por senha e Google de cada papel (Narrador, jogador, editor),
  recuperação de senha, e rollback para o login atual.

**Fatia 1, arquivos no Cloud Storage** (vale para A, B e C)
- Mover o bucket `campaign-images` (986 objetos) com URLs assinadas e as mesmas
  regras de leitura por Casa; 6 pontos de código usam `storage.from(...)`.
- Aceite: hashes conferidos, nenhuma imagem privada pública.

**Fatia 2 em diante** depende da opção escolhida:
- A: `campaign_houses`, `house_memberships` e `campaign_players`, depois missivas
  (já há motor no emulador), calendário, fichas e livro-razão, espionagem,
  batalha, jornal e Drive.
- B: provisionar Cloud SQL, restaurar o dump, adaptar as chamadas `.from()` e
  `.rpc()` aos operadores do SQL Connect, módulo a módulo, na mesma ordem.
- C: manter o banco; só validar autenticação de terceiros e a emissão de claims.

## Critérios de corte (herdados de `README.md`)

Reconciliação final sem perda, identidades preservadas, autorização por Casa com
testes de anônimo, membro, outra Casa, Narrador e editor, jogabilidade verificada
(missivas, calendário, combate, espionagem, jornal, fichas), IAM mínimo e
procedimento de rollback. Enquanto algum item estiver aberto, a origem continua
ligada.

## O que depende de você

1. Escolher A, B ou C.
2. Acesso ao console do Firebase e do Supabase (ou conceder papéis ao GitHub OIDC).
3. Confirmar se o login por Google deve continuar e em qual projeto OAuth.
