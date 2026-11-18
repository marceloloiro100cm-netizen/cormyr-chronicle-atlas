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

## Conferência direta pelo Narrador no Atlas

Na área `/firebase-access`, o Narrador autenticado possui o painel
**Acessos pendentes — consulta privada**. Ao clicar em **Conferir cadastros
no Firebase**, o servidor:

1. Verifica o token e o perfil de Narrador/admin no Firebase;
2. Confere o inventário fechado das 14 contas;
3. Busca somente os cadastros com problemas, incluindo e-mail e UID para
   identificar a conta corretamente;
4. Expõe os vínculos atuais ao Narrador exclusivamente nessa sessão,
   sem logar ou armazenar as identidades no navegador.

**A consulta não modifica nenhuma conta nem libera acesso.** O editor,
os jogadores e usuários anônimos recebem acesso negado.

## Como aprovar os próximos ajustes

Preencha a tabela acima **fora do repositório público** e confirme com
cada titular seu perfil e sua Casa. Conserve essa decisão em ambiente privado.
Duas contas ainda podem requerer redefinição de senha em `/reset-password`.

**Não edite diretamente** os documentos da coleção
`migrationDomainStage/{snapshot}/access`: eles fazem parte do snapshot
histórico de migração e devem permanecer imutáveis. A correção efetiva exige
que o runtime passe a consultar uma fonte operacional de acesso com escrita
protegida, reconciliação de origem e aprovação administrativa específica.
Até essa fonte estar implantada, uma decisão de formulário **não** libera
o usuário; alterar apenas o Firebase Auth também não concede permissões
de campanha.

A alteração de `requirePasswordChange` só pode ser efetuada após prova
confiável de troca de senha pelo titular. Não deduza essa prova de um login
ou de uma confirmação verbal sem verificar a operação.

Após uma correção operacional aprovada, execute novamente a auditoria
protegida `firebase-cloud-operator-readiness`; verifique cada vínculo e
não libere gravação de missivas ou calendário sem os testes autenticados
entre Casas.
