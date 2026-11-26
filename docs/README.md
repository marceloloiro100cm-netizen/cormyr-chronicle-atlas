# Documentação — Cormyr Chronicle Atlas

Índice da documentação viva mantida no repositório. Logs históricos de lotes da migração Lovable/Supabase → Firebase (2024–2026) foram preservados na tag Git `archive/pre-cleanup-2026-11-26`.

## Guias Principais

- **Login com Google e Vinculação de Contas:** [`firebase/GOOGLE-LOGIN-2026-11-20.md`](firebase/GOOGLE-LOGIN-2026-11-20.md)
- **Ativação de leitura e runtime Firebase:** [`firebase/ATIVAR-PILOTO-LEITURA.md`](firebase/ATIVAR-PILOTO-LEITURA.md)
- **Runbook de Cutover / Operação:** [`firebase/CUTOVER-RUNBOOK.md`](firebase/CUTOVER-RUNBOOK.md)
- **Saída do Lovable para Firebase App Hosting:** [`firebase/LEAVING-LOVABLE.md`](firebase/LEAVING-LOVABLE.md)
- **Política de Workflows no GitHub Actions:** [`firebase/REVISAO-WORKFLOWS-2026-11-17.md`](firebase/REVISAO-WORKFLOWS-2026-11-17.md)

## Auditorias de Regras de Jogo

- **Posses das Casas Nobres:** [`house-possessions-audit-2026-10-29.md`](house-possessions-audit-2026-10-29.md)
- **Ativos Militares:** [`military-assets-audit-2026-10-31.md`](military-assets-audit-2026-10-31.md)

## Fixtures SQL de Regressão (CI)

- `docs/battle/sql/` — esquema e testes de contrato do módulo de batalha executados em PostgreSQL descartável no CI (`battle-database`).
- `docs/security/sql/` — contratos de fronteira pública/privada verificados pela suíte de testes de homologação.
