# Vínculos pendentes: formulário de decisão do Narrador

**Data:** 17/11/2026. A auditoria protegida (execução #44163257476) encontrou,
entre as 14 contas do Firebase Auth: **4 acessos inativos**, **2 perfis sem
Casa** e **2 contas com troca de senha pendente**. Os grupos podem se
sobrepor. Só o Narrador pode decidir esses vínculos: o sistema nunca deduz
Casa por nome, e-mail ou posição na lista.

> **Importante:** o repositório é público. Preencha este formulário numa
> cópia privada (Google Drive, por exemplo), nunca no GitHub.

## Onde ver quem são

No Console do Firebase, projeto `cormyr`, Firestore:
`migrationDomainStage` > (único documento do snapshot) > `access`.
Cada documento tem o UID da conta. Filtre por:

- `active` igual a `false` (acessos inativos);
- `memberHouseIds` vazio com `profile` igual a `jogador` (perfis sem Casa);
- `requirePasswordChange` igual a `true` (troca de senha pendente).

O e-mail correspondente a cada UID aparece em Authentication > Usuários.

## Formulário (uma linha por conta)

| E-mail da conta | Perfil correto (jogador, editor ou narrador) | Casa(s) de que é membro | Casa(s) que pode editar | Ativar acesso? (sim/não) | Senha já trocada? (sim/não) |
|---|---|---|---|---|---|
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |
| | | | | | |

Regras que o sistema exige (senão a conta continua com acesso negado):

- **jogador:** pelo menos uma Casa de membro; as Casas que edita precisam
  estar entre as de membro; `admin` falso.
- **editor** (Editor-Chefe do Jornal): nenhuma Casa de membro; `admin` falso.
- **narrador:** `admin` verdadeiro.
- Para ler qualquer coisa: `active` verdadeiro e `requirePasswordChange` falso.

## Como aplicar depois de decidir

Para cada linha, editar o documento `access/<UID>` no Console do Firestore:

1. `profile`, `memberHouseIds`, `editHouseIds` e `admin` conforme o formulário;
2. `active` para `true` se a resposta foi "sim";
3. `requirePasswordChange` para `false` **somente depois** de o jogador
   trocar a senha em `/reset-password`.

**Lacuna conhecida:** a troca de senha pelo Firebase (`/reset-password`)
não altera `requirePasswordChange` sozinha. Por enquanto, o Narrador precisa
mudar esse campo à mão após confirmar com o jogador. Automatizar isso é um
item de código separado.

Depois de aplicar, rode de novo a auditoria protegida
(`firebase-cloud-operator-readiness`) para confirmar que os vínculos
incompletos chegaram a zero.
