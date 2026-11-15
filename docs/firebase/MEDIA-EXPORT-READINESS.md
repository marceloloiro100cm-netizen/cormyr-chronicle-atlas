# Lote 4 — bloqueio de exportações parciais de mídia

**Estado auditado em 15/11/2026:** controle implementado e testado offline; **nenhuma importação de mídia** autorizada no Firebase Cloud. A aplicação permanece com Supabase como fonte dos dados.

## Auditoria do manifesto histórico

O manifesto `campaign-images.manifest.json` previamente fornecido contém **779 entradas**, com metadados estruturais e SHA-256 de 64 caracteres válidos, mas declara `complete: false`. Portanto **não é uma exportação final**. Os outros quatro manifestos completos não estavam disponíveis nesta inspeção. Isso não prova que esses quatro buckets estejam vazios ou que seus arquivos estejam ausentes na origem; significa apenas que este lote não tem evidência suficiente para aprová-los.

Uma cópia histórica de **986 objetos** foi relatada no prefixo GCS de homologação `migration-staging/campaign-images/` (ver `STORAGE-SCOPED-ACCESS-HOMOLOGATION.md`). As contagens de 779 e 986 vêm de inventários distintos e **não devem ser subtraídas nem consideradas erro confirmado** sem reconciliar nomes, datas de exportação, gerações e hashes dentro do ambiente privado.

## Novo controle de integridade de manifestos

`scripts/firebase/audit-media-export-manifests.mjs` exige exatamente os cinco manifestos do exportador do site:

- `campaign-images.manifest.json`
- `campaign-newspapers.manifest.json`
- `campaign-newspaper-staff.manifest.json`
- `campaign-newspaper-commissions.manifest.json`
- `campaign-newspaper-engravings.manifest.json`

Cada um deve corresponder ao seu bucket, usar `version: 1`, conter uma lista consistente de arquivos e declarar `complete: true`. O controle rejeita paths duplicados, traversal, identificadores vazios, tamanhos inválidos, SHA-256 malformado, links simbólicos e JSON inválido. Buckets vazios podem ter `files: []` **apenas quando** declarados completos pelo exportador.

O relatório contém só nomes fixos de bucket, contagens, somatórios e códigos de problemas. **Nunca** contém caminhos reais de arquivos, IDs, hashes ou nomes de usuários. Uma falha retorna saída não zero.

### Execução offline

Depois de exportar os cinco buckets para uma pasta privada, preservando as pastas de arquivos e seus manifestos:

```bash
umask 077
node scripts/firebase/audit-media-export-manifests.mjs --directory /CAMINHO/PRIVADO/manifestos
```

Esse diretório precisa conter os cinco arquivos `<bucket>.manifest.json`. O script não faz uploads, não lê os binários, não usa credenciais e não altera PostgreSQL, Supabase, Storage ou Firebase. O workflow `Firebase media exports — five-bucket offline manifest gate` testa somente fixtures sintéticas, nunca leva arquivos privados ao repositório público.

## O que ainda precisa ser comprovado

1. Exportar novamente **todos os cinco buckets** do sistema ativo, sem edições simultâneas e com `complete: true` em todos.
2. Verificar **os bytes de cada arquivo** contra o SHA-256 declarado, e não apenas a forma do campo no JSON.
3. Comparar o inventário ativo da origem com o destino, por nome, versão, tamanho, geração e hash; validar URLs e permissões por Casa, Jornal e narrador.
4. Atualizar o backup PostgreSQL, reconciliar novas mídias e manter rollback verificável. O snapshot de 12/11 é histórico.
5. Autorizar a importação somente após um destino isolado e testes de acesso; a existência desses manifestos **não** autoriza Cloud import.

**Invariantes:** `bytesVerified=false`, `sourceLiveReconciled=false`, `destinationFilesVerified=false`, `readyForCloudImport=false`, `readyForCutover=false` e `cloudWrites=0` no controle offline. O Firebase App Hosting continua publicado sem cutover de Auth/Firestore.
