# Auditoria de cobertura da migração Cormyr → Firebase

## Por que existe

Um backup íntegro não implica que os módulos estejam funcionais.
A origem possui tabelas, funções, gatilhos, autorizações e integrações
que não são substituídos pela mera cópia de documentos para Firestore.

O script `scripts/firebase/audit-migration-coverage.mjs` lê o backup
privado já normalizado e conferido por SHA-256, mas **não mostra dados
dos usuários, textos das missivas, IDs individuais ou credenciais**.
Agrupa somente as contagens de tabelas e linhas por categoria.

Ele separa:
- origem `auth.*` preparada para importação em emulador Auth;
- entidades convertidas em modelo **tipado de somente leitura**:
  Casas, jogadores, perfis, vínculos, missivas e calendário;
- histórico do Hub Temporal isolado com acesso negado;
- tabelas públicas ainda não transformadas em modelos funcionais;
- demais esquemas fora da conversão de Firestore público.

Nenhuma dessas contagens representa porcentagem de migração
concluída. O status `readyForCutover` permanece **false**.

## Rodar no Cloud Shell

```bash
ROOT="$HOME/cormyr-chronicle-atlas"
git -C "$ROOT" fetch origin main
WORK="/tmp/cormyr-coverage-$(date +%s)-$$"
git -C "$ROOT" worktree add --detach "$WORK" FETCH_HEAD

NORMALIZED="$ROOT/.firebase-migration/inspecao-12nov-E4pokAhB/normalized"
node "$WORK/scripts/firebase/audit-migration-coverage.mjs" "$NORMALIZED"
```

Não requer conexão ao Firebase, dependências adicionais ou download
de outro backup. Não gravar a saída em um repositório público
se contiver observações não previstas no formato agregado.

## Passos que devem ser concluídos para desativar a origem

1. Reconciliar a origem ativa com o último backup. Até o corte,
   o conteúdo pode ter evoluído.
2. Completar identidade e autorização do sistema, inclusive
   provedores OAuth/SSO, duas contas sem perfil e todas as Casas.
3. Substituir operações SQL por serviços transacionais de backend:
   criação/entrega/edição de missivas, avanço do Hub Temporal,
   espionagem, combate e jornal.
4. Converter os demais dados para tipos de domínio com validação
   automática, sem perdas ou criação de privilégios implícitos.
5. Verificar arquivos e permissões de Storage, backups e links históricos.
6. Executar testes E2E com atores e dados de homologação isolados,
   incluindo jogador de outra Casa, editor, narrador e anônimo.
7. Confirmar igualdade de registros, hashes, referências, tesouro,
   unidades, semanas, calendário, calendário privado e eventos.
8. Planejar freeze, delta, DNS, deploy, rollback e desativação
   apenas após homologação satisfatória.

Não instalar ou publicar esse sistema via Lovable. A hospedagem ficou
suspensa a pedido do proprietário.
