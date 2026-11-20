# Item 9, idades canônicas no Firebase

O ano oficial é lido do HUB operacional. A idade não é gravada ou somada no registro e o nascimento e a morte continuam imutáveis no acervo migrado.

- `get_house_character_ages`: respeita a autorização da Casa e exige coincidência entre a ficha, o vínculo da fonte e a visibilidade canônica do personagem. Não publica a identidade de pessoas de outras Casas.
- `get_character_age_dashboard`: só para Narrador; totais completos, prévia no ano escolhido, máximo de 2.000 registros e exportação existente na interface.
- `get_character_year_transitions`: só para Narrador; reúne os eventos importados e as transições publicadas no Firebase.
- `advance` do HUB: quando a data atravessa um ano, cria evento imutável `characterYearTransitions` na mesma transação que o calendário, identificado por versão e par de anos. Repetições de requestKey não duplicam eventos.
- Cadastro: lê `migrationCharacterStage` privado se estiver completo e consistente; se o estágio não existir, reconstrói do `migrationPrivateSnapshots` usando as linhas e hashes originalmente verificados. Nunca executa escrita no arquivo histórico.
- Nunca inventa idade de pessoa pendente, não nascida, com conflito, morte ou referência insuficiente.
- A funcionalidade de leitura requer `CORMYR_FIREBASE_CHARACTER_AGES_ENABLED=true`; a origem continua sujeita à validação do servidor. Caso dados não tenham sido exportados, a API responde indisponível, não uma idade falsa.

Inclui testes unitários de visibilidade, de falecimento e de transição de ano. Publicação exclusivamente GitHub + Firebase App Hosting, sem Vercel e sem Lovable.

## Correção da leitura de transições anuais

A listagem do Narrador deduplica o mesmo par de anos e versão que apareça
tanto no arquivo histórico quanto no livro operacional do Firebase.
O recibo operacional prevalece, evitando contagem dupla.
Para eventos operacionais exige o documento identificado pela fronteira
de anos e o vínculo explícito ao snapshot em leitura. Divergência bloqueia
a listagem em vez de incorporar evento de outra campanha.
Testes de regressão para colisão importada/operacional e vínculo adulterado.
Nenhum calendário ou registro histórico foi alterado.
