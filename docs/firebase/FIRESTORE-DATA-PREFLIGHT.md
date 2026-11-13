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
