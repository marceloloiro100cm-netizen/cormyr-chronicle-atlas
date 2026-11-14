# Resíduo público (emulador)

Stager das oito tabelas públicas pequenas que nenhum outro stager consumia, segundo `audit-stager-coverage.mjs` (88 linhas no backup de 12/11): `spy_cormyr_mission_links`, `campaign_migration_backups`, `profiles`, `archive_source_review`, `noble_house_drive_exports`, `noble_house_source_links`, `noble_house_workbook_imports` e `spy_legacy_seed_archive`.

Roda só no Firestore Emulator (`demo-cormyr-migration`). Dados arquivísticos, sem serviço: `migrationResidualStage/<snapshot>` com regra que nega tudo. jsonb vira texto JSON. O dry-run imprime só contagens.

Reconciliação embutida: o grafo `spy_cormyr_mission_links` ativo precisa ser igual (como conjunto, sem direção) ao `LINKS` codificado em `spy-missions-core.mjs`; se divergir, o plano é bloqueado.

```
node scripts/firebase/stage-residual-emulator.mjs --normalized DIR
```

## O que fica de fora de propósito

Não são dados de domínio a migrar: `cron.*` (o job vira Cloud Scheduler, pendência do proprietário), tabelas de migração (`*.schema_migrations`, `drizzle`), `realtime.*` e `vault.*`, e a sessão do Auth (`auth.refresh_tokens`, `auth.sessions`, `auth.mfa_amr_claims`: os usuários entram de novo). `storage.objects` e `storage.buckets` seguem o fluxo de Storage (`STORAGE-EXPORT.md`).
