# Item 8: representação de jogadores no Firebase

## Comportamento implementado

O Narrador seleciona um jogador ativo no menu **Acessar como jogador**.
A sessão é criada exclusivamente pelo servidor Firebase usando o token real
do Narrador, sem autenticar ou redefinir a senha do jogador. Cada sessão
possui um identificador aleatório, a identidade representada e uma validade
de 30 minutos contada a partir do início.

O comando de retorno encerra a sessão e registra a ação. Alterar de jogador
encerra auditavelmente a representação anterior antes de iniciar a nova.
Sessões expiradas ou com acesso revogado são rejeitadas na próxima requisição.

A leitura devolve somente as Casas, registros e missivas que o jogador
representado poderia acessar. A identidade real do Narrador nunca é
substituída na autenticação Firebase. O cache privado do cliente é limpo ao
entrar e ao sair da representação.

As ações operacionais disponíveis são edição de registros, envio de
missivas, rascunhos, respostas de missivas Firebase e baixa de missivas
Firebase. A autoria da mensagem continua vinculada ao jogador, e o UID
verdadeiro do Narrador é gravado em campos administrativos e auditorias
imutáveis. Os registros versionados mantêm o autor representado e o ator
administrativo no histórico de alterações.

## Barreiras obrigatórias antes da ativação

- A variável `CORMYR_FIREBASE_REPRESENTATION_ENABLED` permanece `false`
  no `apphosting.yaml`.
- A raiz privada `campaignCloudRuntime/<snapshot>` precisa ter os campos
  `representationReadApproved=true` e `representationWriteApproved=true`,
  além das aprovações gerais da fonte reconciliada.
- A edição de registros exige também `CORMYR_FIREBASE_RECORDS_ENABLED=true`,
  `recordsReadApproved=true` e `recordsWriteApproved=true`.
- As missivas exigem a liberação operacional independente de correio e
  o calendário oficial reconciliado.
- Todo acesso depende de contas Firebase ativas, senha regularizada e
  permissões atuais da Casa, reconsultadas no servidor.
- Os testes de homologação devem usar Narrador e jogadores reais, uma Casa
  autorizada, uma adversária, uma conta inativa e uma sessão expirada.
  Confirmar visualmente a ausência de dados da Casa adversária.

## Limites conservadores

A origem de cada missiva é a Casa escolhida no painel da representação.
O servidor confere que a Casa está entre as Casas editáveis da conta
representada, inclusive quando há múltiplas Casas autorizadas. Respostas
e baixas são admitidas apenas para missivas operacionais Firebase. A camada histórica importada continua
imutável; responder diretamente a uma conversa histórica importada ainda
exige a migração de tópicos e respostas legadas.

Não use troca de tokens, login como jogador, usuários de serviço ou
elevador de privilégios para contornar estas restrições. A aplicação deve
falhar sem escrita quando uma aprovação, vínculo ou versão estiver ausente.

## Testes

- `operational-representation.test.ts`: expiração, revogação, vínculos e
  identidade do Narrador.
- `operational-representation-bridge.test.ts`: isolamento entre Casas,
  leitura e autoria delegada.
- `cloud-mail-service.test.mjs`: remessas representadas, auditoria,
  idempotência, sessões inválidas e respostas operacionais.
- Pipelines existentes de build, testes de componentes e emulador Firebase.

Nenhum dos testes acima, isoladamente, declara a liberação de produção.
