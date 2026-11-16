# Homologação de acesso por perfil no Firebase Cloud

O portal `/firebase-access` ganhou uma verificação de segurança
**sob demanda**, executada dentro do navegador da conta autenticada.
Ela usa somente `POST /api/firebase-cloud-read` existente com Firebase
ID token do próprio usuário e não grava tokens em GitHub, logs,
Firestore ou cookies.

## Casos de aceite

| Ator logado | Provas esperadas |
| --- | --- |
| Anônimo (simulado pela própria requisição sem token) | HTTP 401 |
| Jogador da Casa A | `session` com perfil correto; sua Casa HTTP 200; Casa B HTTP 403 |
| Jogador da Casa B | `session` com perfil correto; sua Casa HTTP 200; Casa A HTTP 403 |
| Narrador | `session` com perfil Narrador; duas Casas distintas HTTP 200 |
| Editor do jornal | `session` com perfil Editor; ficha de Casa HTTP 403 e calendário reservado HTTP 403 |

A prova usa apenas **status HTTP**, não coleta fichas, saldos,
identidades ou conteúdos privados de outras Casas. A interface informa
resultado limitado à **conta atual** e ao momento do teste. A opção
só aparece depois da autenticação Firebase.

Um resultado positivo de um único usuário **não** autoriza cutover;
é necessário executar sucessivamente com as quatro contas e registrar
evidências sem tokens, e-mails ou nomes privados no GitHub. Se o
Firebase Cloud estiver desativado, sem estágio real, com IAM negado ou
com lista de Casas insuficiente, a verificação falha fechada.

## Status e limites desta etapa

O novo teste está implementado e coberto por casos sintéticos
(Narrador, Editor, Jogador A, Jogador B, vazamento entre Casas, 503 e
conta incompleta). A integração **não tem as senhas/tokens das contas
reais** e não ativa os usuários: ainda não há comprovação E2E real
com quatro atores.

Condições antes de disponibilizar aos jogadores:
- Validar a autenticação Firebase real e cada conta habilitada;
- reconciliar o catálogo e as permissões de Casa no Cloud;
- obter HTTP 200 da auditoria Firestore de identidade read-only ou
  acesso auditável equivalente e resolver o erro Auth 400;
- executar cada cenário real e obter os bloqueios esperados;
- validar a revisão em tráfego e os dados/arquivos migrados;
- decidir manualmente o GO somente após **todos** esses itens.

`readyForPlayers=false`, `readyForCutover=false` e issue #513.
