# Firebase Firestore — verificação privada do backup PostgreSQL

**Estado:** somente auditoria offline. Não importa dados, não publica regras nem
cria coleções Firebase. Usar com a saída normalizada de
`scripts/firebase/prepare-backup.sh`, guardada na pasta privada
`.firebase-migration/` que está no `.gitignore`.

## Execução

```bash
node scripts/firebase/audit-firestore-backup.mjs \
  .firebase-migration/inspecao-privada/normalized
```

O comando lê `manifest.json`, valida SHA-256 e formato de cada tabela, recusa
symlinks e caminhos externos à pasta, detecta IDs repetidos/nulos e linhas
potencialmente grandes para documentos Firestore. Também agrupa contagens por
área do jogo e alerta que campos de autenticação exigem migrador próprio.

**O relatório não divulga valores, e-mails, IDs, senhas ou texto das missivas.**
Nunca copiar dumps, manifestos privados, exportações ou resultados sensíveis
para um repositório público.

## Limitações e bloqueios

- O backup PostgreSQL tem tipos, constraints, foreign keys, RLS, views,
  triggers e RPCs. A saída de COPY preserva texto/null, não o tipo original.
  Portanto **não** enviar diretamente cada linha como documento Firestore.
- Firestore possui limite de tamanho por documento. O preflight usa estimativa
  conservadora de 900 KiB por linha JSON, mas tamanho real depende de
  conversão e overhead; a validação definitiva depende do modelo mapeado.
- IDs sem coluna `id` são sinalizados, não tratados como erro de parsing;
  algumas tabelas possuem chaves compostas e exigem definição própria.
- O prefixo `migration-staging/` do Storage não é caminho público,
  e usuários não podem receber acesso automático.
- Não migrar tabelas `auth.*`, `storage.*` ou vault via Firestore; elas
  requerem mecanismos próprios. Não copiar tokens de sessão.
- Casas, jogadores, missivas, calendário, espionagem, jornal e batalhas
  requerem migração de domínio com transações, regras de acesso e rollback.
- Manifesto `complete:false` das 779 imagens impede afirmar que o acervo
  não teve alterações após o backup.
- O banco PostgreSQL atual precisa ser comparado com o backup e reconciliado
  antes da importação. Logs de CI apenas usam dados sintéticos.

## Reconciliação com novo backup da origem (13/11/2026)

O pré-diagnóstico de Firebase Auth já identificou 14/14 candidatos, 13 hashes
BCRYPT, 1 conta sem senha com OAuth reconhecido e 1 identidade custom
adiada. Issues vazios não comprovam que o backup ainda reflita a origem.

Foi adicionado o comparador de snapshots privados
**scripts/firebase/compare-backup-snapshots.mjs**. Ele confronta dois diretórios
normalizados diferentes, valida SHA-256, contabiliza registros inseridos,
removidos e modificados por domínio, e sinaliza alterações de esquema.
Tabelas sem coluna id são comparadas por multiconjunto de linhas e não
permitem distinguir atualização de exclusão + inserção. O relatório
omite IDs, emails, senhas, identidades e conteúdo de missivas.

A primeira ação necessária é obter um NOVO backup autenticado do banco
PostgreSQL de origem. Não reutilizar o backup de 12/11 como se fosse atual.
No Cloud Shell, com a exportação recente disponível em arquivo privado:

~~~bash
cd ~/cormyr-chronicle-atlas
git fetch origin feat/firebase-firestore-data-preflight-20261112
git worktree add --detach /tmp/cormyr-firestore-delta-check FETCH_HEAD

# Substituir pelo caminho REAL de uma nova exportação, nunca reutilizar 12/11.
NEW_BACKUP="/CAMINHO/PRIVADO/backup-atual.backup"
NEW_DIR="$HOME/cormyr-chronicle-atlas/.firebase-migration/reconciliacao-atual"

bash /tmp/cormyr-firestore-delta-check/scripts/firebase/prepare-backup.sh \
  "$NEW_BACKUP" "$NEW_DIR"

node /tmp/cormyr-firestore-delta-check/scripts/firebase/compare-backup-snapshots.mjs \
  "$NORMALIZED" "$NEW_DIR/normalized"
~~~

O diretório de destino precisa ser novo. Não colocar dumps, manifestos,
contas ou missivas no GitHub público. O script não consulta nem modifica
a origem ou o Firebase, e não pode comprovar por si só que uma cópia
foi retirada do banco ativo: verificar procedência e horário da exportação.
A reconciliação final exige uma última exportação após suspender escritas,
validação das permissões e teste de login. O relatório permanece
**readyForImport: false** até essas condições serem cumpridas.
