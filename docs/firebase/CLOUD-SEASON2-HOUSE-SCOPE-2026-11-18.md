# Proteção de vínculos de Casas — leitura e missivas Cloud

Data: 18/11/2026.

Esta alteração reforça a validação **por requisição**, em vez de aceitar
apenas o formato de um identificador contido no snapshot histórico.

Acesso de um jogador é concedido somente se:

- O Firebase ID token e a conta Auth forem válidos, habilitados e não revogados.
- O documento de acesso histórico estiver ativo, exigir nenhuma troca de senha
  e tiver o perfil `jogador` sem privilégio administrativo.
- Houver ao menos uma Casa e os conjuntos de membro e edição não tiverem
  duplicatas, formatos inválidos ou edição fora do escopo. O `playerId` segue
  opcional nos registros históricos, mas é validado quando fornecido.
- **Cada Casa de membro** tiver seu documento oficial de nome determinístico
  `sha256('house:' + id)`, com `sourceId` idêntico, `active: true` e
  `season: 2`. Casa ausente, inativa, de temporada anterior ou substituída
  não autoriza acesso.

A mesma função pura de verificação é compartilhada pelo serviço privado de
leitura e pelo serviço de missivas. Para envio, resposta e recibos, as Casas
são consultadas **dentro da transação**, antes de qualquer gravação. O
`status` da caixa aplica a mesma verificação. Os testes cobrem Casas
inativas, identidade trocada, duplicatas, dados incompletos e nenhuma escrita
após acesso negado.

O painel privado do Narrador também compara os vínculos com o catálogo real
de Casas ativas da temporada 2. Os vínculos antigos são identificados como
inconsistentes, sem exibí-los em logs públicos nem tentar modificá-los.

O Narrador não é bloqueado por não possuir Casa, e o Editor continua sem
acesso a fichas e missivas privadas. **Os estágios de migração permanecem
imutáveis**; não foram criados vínculos novos, restabelecidos acessos ou
alteradas as contas.

A verificação de escopo **não resolve** a falta de conteúdo público revisado,
o `SOURCE_GCS_HTTP_403` do bucket de origem, a reconciliação da rodada ou
a aprovação independente dos dois runtimes. A campanha permanece com
`releaseDecision=NO_GO` para gravações operacionais, até a aceitação real.
