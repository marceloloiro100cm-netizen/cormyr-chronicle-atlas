# Diagnóstico seguro de vínculos — 17/11/2026

Os 14 usuários do Firebase Auth estão habilitados, mas o histórico privado conserva 4 acessos de campanha inativos, 2 perfis sem associação e 2 contas que exigem redefinição de senha. Esses grupos podem se sobrepor; não é correto atribuir automaticamente Casas ou alterar papéis sem prova de identidade.

O auditor protegido passa a consultar a análise read-only existente de Auth -> access -> houses, sob a identidade temporária OIDC já aprovada. A saída é **somente agregada** e lista motivos fixos de falha (perfil ausente, acesso inativo, senha pendente, Casa ausente, escopo de edição incorreto e referências a Casas não ativas). IDs, nomes de Casas, UIDs, e-mails e dados privados nunca são incluídos.

Essa inspeção **não ativa acesso, não restaura perfis, não atribui Casas e não altera Firestore/Auth**. Mesmo que todas as contas pareçam estruturalmente elegíveis, as provas independentes de controle de acesso, conteúdo público, delta de origem, calendário e E2E autenticado continuam necessárias para liberar a campanha.

A auditoria em [#44163257476](https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas/actions/runs/44163257476) confirmou os dois runtimes pending e quatro vínculos incompletos. O novo código adiciona a categorização sem expor nomes de jogadores em logs do repositório público.