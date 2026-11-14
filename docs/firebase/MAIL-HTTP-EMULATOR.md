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
Abra esse endereço no navegador para usar a interface de Missivas de teste.
`CORMYR_MAIL_PORT` permite outra porta local. O snapshot é configuração
servidora; nunca é selecionado pelo cliente. Não encaminhar esse serviço
por túnel público. Ele exige ambos os emuladores e projeto demo fixo.

## Contrato

Todas as chamadas usam `POST /api/firebase-mail/<ação>`, JSON e
`Authorization: Bearer <ID token do Auth Emulator>`. A única exceção é
`login`, que recebe e-mail e senha da conta de homologação, autentica no
Auth Emulator local e verifica o perfil da aplicação antes de devolver
um token. Não use tokens reais.
O serviço verifica revogação, conta habilitada, perfil e vínculos atuais.
Cookies, claims de administrador e seleção de Casa não concedem autoridade.

| Ação | Uso |
| --- | --- |
| `login` | Autenticar conta existente do Auth Emulator, sem criar conta |
| `session` | Papel, Casas remetentes autorizadas, destinatários e rodada atuais |
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

## Interface de homologação

`scripts/firebase/mail-web/` contém a tela local, servida na mesma origem
da API. Não carrega scripts de CDN, não usa Supabase nem importa módulos
Admin SDK no navegador. O servidor entrega somente três arquivos fixos;
não oferece navegação de diretórios ou leitura arbitrária de arquivos.

Fluxos disponíveis: login e saída, listagem por pasta/origem, busca e
paginação, abertura de conversa, recibo individual, composição para Casa
ou Narrador, rascunho, edição versionada, envio do rascunho e resposta.
O Narrador pode preparar o runtime e abrir/encerrar suas rodadas de teste.
O servidor fornece os controles e opções conforme o perfil atual; a
autorização continua sendo revalidada em cada operação.

Tokens ficam somente em memória, não em cookies/localStorage/sessionStorage.
Não há renovação automática: ao expirar, a sessão e o conteúdo visível são
limpos. A saída também limpa formulários e mensagens. Uma recusa de
autorização encerra a sessão. Os textos são renderizados por `textContent`,
com política CSP restrita à mesma origem, sem executar HTML da missiva.
Os envios reutilizam a chave quando o mesmo conteúdo é reenviado após
falha de conexão. A data é Harptos e nunca um campo gregoriano `type=date`.

É uma interface local independente para homologar os fluxos migrados.
Ainda **não substitui** `src/components/players/missivas-tab.tsx` ou o
login principal. Não há upload/renderização de anexos, painel de efeitos,
notas privadas, lixeira/restauração, seleção de resposta individual ou
edição de rascunhos de respostas nesta interface. As operações já presentes
na API permanecem disponíveis, mas não devem ser confundidas com paridade
completa da tela de produção.

## Validação

- Testes unitários da fronteira HTTP: origem, corpo, token, campos proibidos,
  erros opacos e proteção contra uso de Firebase Cloud.
- Caixa unificada no Firestore Emulator: leitura, envio, repetição idempotente,
  edição concorrente, publicação, resposta e perda de vínculo via handler.
- Servidor HTTP real com Auth + Firestore Emulator: login com usuário fictício,
  envio do Narrador, isolamento entre Casas, recibos, editor recusado,
  token inválido, vínculo revogado e conta desabilitada.
- Navegador Chromium: login de jogador, criação/edição/envio de rascunho,
  resposta entregue após avanço de rodada pelo Narrador, filtros, saída,
  recusa de editor, texto HTML não executado, ausência de requests externos
  e largura de tela de 390 px sem rolagem horizontal.
- CI existente `firebase-mail-unified.yml` executa os três níveis.

## Pendências para uso no site

Integrar a interface e o login ao aplicativo principal; migrar anexos e permissões Storage;
portar consequências nas Casas, representação do Narrador e Hub Temporal
canônico; reconciliar dados da origem; homologar e publicar somente depois.
As rodadas deste serviço ainda não avançam o Hub Temporal. Não declarar
o módulo inteiro migrado ou pronto para corte com base nesta API local.
