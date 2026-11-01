# Inspeção pré-publicação do Hub Temporal (somente leitura)

Nenhum código, DDL/DML, publicação ou restauração foi executado.

## (a) Backup completo do banco — INDISPONÍVEL para mim
- Não tenho ferramenta que gere ou baixe um backup completo. Dump do banco por SQL não é permitido.
- Única cópia completa: **exportação feita por você** em More → Database → Manage → Settings → Export data → Database → Export.
- Ela inclui o banco inteiro (public, auth com hashes de senha, roles, RLS, funções).
- Ela NÃO inclui: arquivos do storage (anexos/imagens), segredos, configurações de login e chaves de API. Os arquivos saem à parte em More → Storage.
- Limites: até 15 GB, 1 exportação a cada 24 h, backend precisa estar ativo.
- Os backups diários (~14 dias, sem recuperação a um instante exato) não são visíveis para mim.

## (b) Restaurar em projeto separado — INDISPONÍVEL para mim
- A tela de Backups só restaura o mesmo projeto, por cima dos dados atuais.
- Restaurar a exportação num projeto fisicamente separado exige você importá-la num projeto de banco de sua propriedade, fora deste. Não tenho acesso nem ferramenta para isso.

## (c) Comprovar teste de restauração — INDISPONÍVEL para mim
- Sem (b), não posso produzir evidência técnica verificável (contagens, hashes, login de teste) a partir de uma restauração.
- Posso apenas consultar este banco, sem alterá-lo, para gerar contagens de referência (casas, missivas, respostas, jogadores, anexos) que você compararia no projeto restaurado.

## (d) Sincronizar a branch audit/hub-temporal-lote-37-aceite-final — INDISPONÍVEL
- A sincronização Git acompanha apenas UMA branch (a configurada no projeto). Commits em outras branches nunca chegam aqui.
- Não consigo conectar repositório, ver o status da conexão nem trocar a branch; isso é feito por você em Project settings → Git (seletor de branch), ou fazendo merge dessa branch na branch sincronizada no GitHub.
- Não verifiquei se este projeto está ligado a esse repositório.

## Próximo passo possível (se aprovado)
Somente consultas de leitura para gerar as contagens de referência do item (c).
