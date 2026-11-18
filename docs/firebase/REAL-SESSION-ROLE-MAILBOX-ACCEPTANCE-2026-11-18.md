# Aceite autenticado por perfil e Casa — extensão de missivas

Esta melhoria complementa `runFirebaseRoleSelfAcceptance`, executado
**na sessão do próprio usuário**, com token Firebase válido no navegador.

O teste envia apenas chamadas de leitura ao backend oficial
`/api/firebase-cloud-read` e registra **status HTTP e booleanos**:

- **Jogador A ou B:** sessão Auth confirmada, ficha de sua Casa 200,
  ficha de outra Casa 403 e **caixa de missivas 200**.
- **Editor-chefe:** sua sessão confirmada, ficha privada 403, calendário
  reservado 403 e **caixa de missivas 403**.
- **Narrador:** sessão confirmada, acesso a duas Casas distintas 200 e
  **caixa de missivas 200**.
- **Anônimo:** sessão sem bearer recusada com HTTP 401.

A função não analisa corpos de respostas de Casas, missivas ou calendário;
apenas a resposta mínima da sessão é examinada para confirmar o papel
efetivamente autorizado pelo servidor. Resultado não inclui UID, token,
nomes, Casas ou conteúdo privado.

O navegador não pode provar sozinho a liberação de **todas** as contas.
Esse teste deve ser repetido com sessões de jogador A, jogador B, narrador
e editor, obtendo provas positivas e negativas independentes, e só
depois comparado ao inventário privado de perfis. Nenhuma prova
de escrita de missivas ou autorização de cutover é inferida.

Runtimes de cartas novas continuam inativos até a reconciliação;
uma caixa histórica autorizada pode retornar 200 sem ativá-los.
