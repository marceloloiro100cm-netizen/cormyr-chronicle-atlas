# Lote 3 — dados reais: reconciliação pré-importação

## Estado em 14/11/2026

Implementada uma auditoria **100% offline e somente leitura** dos backups PostgreSQL normalizados. Nenhum login real ou dado Cloud é importado por esta entrega. O Supabase do Lovable Cloud continua sendo a origem, enquanto os usuários e todos os módulos dependentes não tiverem equivalência comprovada no Firebase.

A conexão Supabase disponível na conversa não enumerou projetos acessíveis. O repositório GitHub não contém os backups privados nem oferece credenciais para o Firebase Cloud. **Sem acesso comprovado à origem atual, último backup, projeto de homologação e permissões temporárias, não há autorização técnica para uma importação Cloud.**

## O que foi construído

`scripts/firebase/lot3-reconcile-backups.mjs` carrega dois backups *já* extraídos por `prepare-backup.sh`, verifica seus manifests e SHA-256 usando o carregador original `loadVerifiedPrivateTables` e calcula:

- tabelas e linhas antes/depois, por domínio;
- inclusões, exclusões e mudanças, verificando a correspondência por chave `id` quando disponível ou por multiconjunto integral de linhas para tabelas sem `id`;
- tabelas removidas ou criadas, derivações de esquema e chaves repetidas;
- a cobertura por stager, com bloqueio se dados de aplicação não forem modelados;
- a integridade do plano unificado de Auth + Firestore Emulator (sem executá-lo).

Os resultados são **somente contagens e nomes de tabelas**; não exibir UIDs, e-mails, credenciais, textos de missivas, IDs individuais nem hashes por linha. A ferramenta não lê segredos, não altera Postgres, não grava no Firestore nem usa endpoints remotos.

## Execução com backups privados no Cloud Shell

Usar um diretório local protegido (`umask 077` e permissões restritas) e duas exportações da **mesma origem**: um baseline íntegro e uma exportação nova. Para extrair o segundo dump:

```bash
set -euo pipefail
umask 077
ROOT="$HOME/cormyr-chronicle-atlas"
git -C "$ROOT" fetch origin main
WORK="$(mktemp -d /tmp/cormyr-lot3-XXXXXXXX)"
git -C "$ROOT" worktree add --detach "$WORK" FETCH_HEAD
mkdir -p "$ROOT/.firebase-migration"
bash "$WORK/scripts/firebase/prepare-backup.sh" \
  "/CAMINHO/PRIVADO/novo-backup.backup" \
  "$ROOT/.firebase-migration/inspecao-nova"
BASE="$ROOT/.firebase-migration/inspecao-12nov-E4pokAhB/normalized"
CANDIDATE="$ROOT/.firebase-migration/inspecao-nova/normalized"
node "$WORK/scripts/firebase/lot3-reconcile-backups.mjs" \
  --baseline "$BASE" --candidate "$CANDIDATE"
```

O script encerra com erro se houver perda de tabelas/linhas, mudanças de esquema incompatíveis, IDs duplicados, dados de aplicação não cobertos ou problemas de pré-conversão para o emulador. Pode detectar **delta entre backups**, mas não comprova que a origem viva está congelada. Uma exclusão pode ser legítima; ainda assim precisa de revisão explícita.

**Não publique logs de origem**, nem armazene arquivos normalizados em PR, issues, Actions, Storage público ou repositório.

## Critérios obrigatórios antes de importar os dados verdadeiros

1. Acesso autorizado ao banco original, de preferência somente leitura, e nova exportação após cada rodada de desenvolvimento. Reconciliar mudanças posteriores ao snapshot histórico.
2. Restaurar e validar os binários dos buckets, não apenas `storage.objects`; Storage permanece no Lote 4.
3. Destino Firebase de homologação isolado (preferencialmente projeto dedicado) com autenticação por credenciais temporárias e proteção para recusar qualquer conta existente no Auth e documentos em coleções-alvo.
4. Avaliar UIDs, senhas, OAuth Google, identidade personalizada e duas contas sem perfil. Nunca conceder privilégios via `roster_house_id` ou claims do cliente.
5. Rodar conversores **de todos os domínios** com fixture sintética e depois com backup privado, verificar contagens/hashes e quarentena sem liberar cartas ambíguas.
6. Implementar importadores Firestore/Auth de **homologação Cloud** em operações condicionais, sem tocar em `main`/produção como destino de dados, e provar que falham antes da primeira gravação se o destino já contiver identidade ou dados.
7. Testar as regras Firestore/Storage, módulos, papéis, perfis e rollback. Depois emitir novo backup de freeze, refazer a reconciliação, importar o snapshot final e verificar o estado de destino.

## O que NÃO foi feito

- Nenhuma importação de contas, tabelas ou objetos reais no Firebase Cloud.
- Nenhuma alteração no SQL/RLS, autenticação da origem, senhas ou dados.
- Nenhum corte de DNS, desligamento do Supabase, alteração no Firebase Auth de produção ou publicação de regras.
- Nenhuma alegação de Lote 3 concluído ou percentual integralmente conquistado.

A documentação `CUTOVER-RUNBOOK.md` continua sendo a ordem oficial do corte seguro. `readyForCutover=false` até homologação integral, inclusive o Lote 2 pendente.
