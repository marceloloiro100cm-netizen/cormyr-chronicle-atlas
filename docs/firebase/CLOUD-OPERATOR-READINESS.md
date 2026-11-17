# Auditoria protegida da nuvem (lote de 17/11/2026)

## Implementação
O fluxo **Firebase Cloud — protected operator migration audit (read-only)** combina a inspeção de etapas e runtime com o pré-teste de todas as 14 contas do Firebase Auth. Trata-se de uma leitura de infraestrutura privada, não de importação de dados nem ativação de contas.

O contrato sintético é executado automaticamente no GitHub em cada alteração deste script ou workflow. O exame real da nuvem só pode ser iniciado manualmente pela branch main e exige revisão do ambiente protegido **firebase-auth-test-activation**. Usa a service account administrativa dedicada por OIDC temporário, sem chaves persistentes e sem ampliar a conta leitora.

A rotina Auth chama exclusivamente **preview** e usa uma fachada que recusa chamadas updateUser/getUser, mesmo se outro caminho de código tentar editar um usuário. Os resultados contêm apenas contagens, indicadores e códigos de erro pré-definidos. Não mostram UID, e-mails, hashes de snapshots, nomes de Casas ou mensagens privadas do Google.

## Evidências históricas, não estado comprovado hoje
- O login OIDC da operadora administrativa funcionou no workflow #2; o preflight antigo falhou sem código discriminado.
- O workflow de somente leitura com cormyr-gh-reader falhou ao listar Auth (auth_inventory_permission_denied). Isso **não demonstra** que a identidade administrativa tenha a mesma falta de permissão.
- No inventário de 16/11 havia 14 contas Auth desabilitadas; snapshots públicos auxiliares e runtimes faltavam. Esses dados não foram reconciliados nesta alteração.
- A verificação de acesso público encontra serviços HTTP 503; isso confirma fechamento e não disponibilidade para jogadores.

## Saída e próxima porta
Verificar no summary do novo workflow as contagens Auth, as seis etapas principais, as quatro auxiliares, os dois runtimes e a categoria de falha, se houver. Falha de leitura ou inventário incompleto mantém NO_GO. A validação não gera novos documentos nem altera habilitação de login.

Mesmo com 14/14 e todos os estágios completos, continuar exigindo backup/delta atualizado, Storage conferido e testes reais de Narrador, Jogador de Casa A, Jogador de Casa B, Editor e anônimo, com isolamento entre Casas. Nunca substituir os requisitos por um simples workflow verde.
