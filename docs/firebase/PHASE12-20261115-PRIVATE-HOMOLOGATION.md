# Fases 1 e 2 — execução privada do backup de 15/11/2026

**Escopo:** converter e preservar PostgreSQL em um arquivo Firestore bruto, projetar as coleções tipadas já implementadas e importar as contas com hashes BCRYPT, **apenas em homologação isolada**, mantendo `cormyr` em modo de manutenção.

## Fonte verificada

- ZIP privado no Google Cloud Storage: `gs://cormyr-migration-homolog-477785088395/backups/corte-lovable-2026-11-15/originais/bucket-database_export_15_11_26-files.zip`.
- SHA-256 do ZIP: `6c2919673a41b39043605e8460513ea0d15ca6c456e7a3d5b818a25417726a10`.
- O arquivo contém um único `.backup`, com formato `PGDMP` e 3.566.637 bytes, validado por CRC ZIP. **Isso não substitui a extração com pg_restore 17+ e a auditoria das tabelas.**

## Executar no Cloud Shell (modo privado, sem cloud writes)

```bash
set -euo pipefail
ROOT="$HOME/cormyr-chronicle-atlas"
git -C "$ROOT" fetch origin main
WORK="$(mktemp -d /tmp/cormyr-phase12-code-XXXXXXXX)"
rmdir "$WORK"
git -C "$ROOT" worktree add --detach "$WORK" FETCH_HEAD
bash "$WORK/scripts/firebase/phase12-15nov-operator.sh"
```

O comando:

1. Confere o SHA-256 do ZIP em GCS e extrai o backup em diretório privado (0700, arquivos 0600).
2. Usa PostgreSQL 17+ para normalizar todas as tabelas, sem executar SQL.
3. Valida manifesto, contagens, relacionamentos, missivas em quarentena e candidatos Auth, sem revelar valores.
4. Importa para o Firestore/Auth **Emulator** `demo-cormyr-migration`, com projeto e hosts de loopback obrigatórios, e testa a recuperação do arquivo.
5. Salva a exportação privada dos emuladores em GCS, com SHA-256 para conservação.

Se a auditoria não apresentar `readyForEmulatorStage:true`, a execução falha *antes* de qualquer importação. Todos os artefatos privados ficam fora do GitHub público.

## Homologação Cloud — somente em projeto Firebase separado

**Não utilizar `cormyr` como destino.** O importador exige identificador `cormyr-homolog-...` ou `cormyr-migration-...`, projeto existente, Firestore criado em **modo produção (deny all)**, Authentication habilitado e destino totalmente vazio. Use o projeto isolado que efetivamente tenha sido criado e autorizado; não invente um identificador.

```bash
# Executar somente depois de confirmar que a homologação isolada existe:
bash "$WORK/scripts/firebase/phase12-15nov-operator.sh" --cloud-project ID_EXATO_DA_HOMOLOGACAO
```

Esse modo, depois de validar os emuladores, implanta **somente as regras deny-all** da homologação, confere Application Default Credentials e então cria:

- `migrationPrivateSnapshots/<hash>`: arquivo bruto integral das tabelas `public.*`, com fragmentos e integridade por linha;
- `migrationDomainStage/<hash>`: documentos tipados de Casas, jogadores, perfis, missivas e quarentena, quando os conversores existentes validarem;
- `migrationPhase12/<hash>`: marcador `incomplete` enquanto executa e `complete` apenas após verificação de todos os UIDs importados em Firebase Authentication.

As contas importadas mantêm identificadores e hashes BCRYPT, sem criar senhas, claims, emails, convites ou autorizações novas. Provedores OAuth específicos, contas sem senha e dois perfis históricos pendentes exigem reconciliação. A homologação não deve ser oferecida a jogadores.

**Nunca** tentar repetir a importação no mesmo projeto após falha parcial; criar um novo destino isolado e investigar o anterior.

## Critérios de aceite e limites

- Os totais reais de 15/11 devem ser derivados do `preflight.json`, **não reutilizar os valores históricos do backup de 12/11**.
- Firestore/Auth devem ter o mesmo snapshot e contagens verificadas, mas o site em `atlas.cormyr.com.br` continua em manutenção; os serviços e regras de produção não mudam.
- O arquivo bruto ainda **não equivale** à reimplementação dos RPCs SQL, do calendário transacional, Jornal, espionagem ou batalha.
- O Firestore da homologação permanece **deny all** para clientes; regras por Casa e testes reais devem preceder a habilitação do app.
- O bucket privado mantém a exportação dos emuladores, o backup original e verificadores fora do GitHub.
- A exclusão permanente do Lovable e a reconciliação de mídias históricas não fazem parte deste lote.
