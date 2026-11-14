# API de Missivas para homologação local

A API conecta os serviços de caixa unificada e comandos a um transporte HTTP
autenticado. É uma etapa de migração funcional, sem publicação ou mudança no
frontend atual. Os componentes de jogadores continuam no Supabase.

## Executar

Com as dependências isoladas dos testes instaladas, inicie os emuladores
Auth e Firestore usando `firebase/firebase-all.json`, projeto
`demo-cormyr-migration`. Prepare o snapshot privado pelo procedimento de
`UNIFIED-EMULATOR-STAGING.md`.

Em outro terminal, configure:

```bash
export FIRESTORE_EMULATOR_HOST=127.0.0.1:8080
export FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099
export CORMYR_MAIL_SNAPSHOT='<SHA-256 do snapshot preparado>'
node scripts/firebase/serve-mail-emulator.mjs
```

O servidor escuta exclusivamente em `http://127.0.0.1:8787`.
`CORMYR_MAIL_PORT` permite outra porta local. O snapshot é configuração
servidora; nunca é selecionado pelo cliente. Não encaminhar esse serviço
por túnel público. Ele exige ambos os emuladores e projeto demo fixo.

## Contrato

Todas as chamadas usam `POST /api/firebase-mail/<ação>`, JSON e
`Authorization: Bearer <ID token do Auth Emulator>`. Não use tokens reais.
O serviço verifica revogação, conta habilitada, perfil e vínculos atuais.
Cookies, claims de administrador e seleção de Casa não concedem autoridade.

| Ação | Uso |
| --- | --- |
| `list` | Caixa histórica + runtime; filtros, busca e cursor |
| `thread` | Carta e respostas visíveis |
| `read` | Recibo individual idempotente |
| `send`, `reply` | Escrita com chave de idempotência |
| `edit-draft`, `schedule-draft` | Alterar/programar com versão esperada |
| `trash` | Exclusão lógica ou restauração autorizada |
| `receipts` | Consultar recibos segundo as permissões do serviço |
| `note` | Nota privada autorizada do Narrador |
| `initialize`, `open-round`, `close-round` | Operações exclusivas do Narrador no runtime isolado |

Os campos de cada ação seguem os serviços documentados em
`MAIL-COMMANDS-EMULATOR.md` e `MAIL-UNIFIED-EMULATOR.md`, exceto `idToken`,
que vem exclusivamente do cabeçalho. Campos desconhecidos são recusados.
Resposta de sucesso: `{data: resultado, sourceMode: 'emulator-only'}`.

Erros retornam apenas um código estável, sem exceções ou conteúdo privado:
400 entrada inválida; 401 Bearer ausente/malformado; 403 acesso negado;
404 recurso indisponível ao solicitante; 405 método inválido;
409 conflito de versão/idempotência ou rodada fechada; 413 corpo acima de
256 KiB; 415 formato não suportado; 500 falha interna.

As respostas têm `Cache-Control: no-store`. Não há CORS aberto.
O servidor rejeita Host/Origin divergentes e o handler recusa parâmetros na
URL. As Rules permanecem deny-all para o runtime, sem acesso SDK cliente.

## Validação

- Testes unitários da fronteira HTTP: origem, corpo, token, campos proibidos,
  erros opacos e proteção contra uso de Firebase Cloud.
- Caixa unificada no Firestore Emulator: leitura, envio, repetição idempotente,
  edição concorrente, publicação, resposta e perda de vínculo via handler.
- Servidor HTTP real com Auth + Firestore Emulator: login com usuário fictício,
  envio do Narrador, isolamento entre Casas, recibos, editor recusado,
  token inválido, vínculo revogado e conta desabilitada.
- CI existente `firebase-mail-unified.yml` executa os três níveis.

## Pendências para uso no site

Conectar a interface e o login Firebase; migrar anexos e permissões Storage;
portar consequências nas Casas, representação do Narrador e Hub Temporal
canônico; reconciliar dados da origem; homologar e publicar somente depois.
As rodadas deste serviço ainda não avançam o Hub Temporal. Não declarar
o módulo inteiro migrado ou pronto para corte com base nesta API local.
