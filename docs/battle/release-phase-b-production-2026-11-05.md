# Release de persistência — Módulo de Batalha V2 (fase B)

Data: 2026-11-05. Autorização do usuário: liberar o módulo em produção.

## Estado confirmado antes do release
- Produção: cluster PostgreSQL `7692131729119822239`, tabelas `battle_sim_sessions`, `battle_sim_events` e `battle_sim_scenarios` presentes, sem registros táticos.
- Estruturas, constraints, SQL das duas RPCs e RLS **idênticos à homologação independente**.
- Permissões: `anon` sem leitura; `authenticated` só SELECT condicionado a `campaign_access_active()` e `is_campaign_admin()`; `service_role` exclusiva em gravação, com validação do narrador antes e depois da consulta.
- **Canário transacional em produção aprovado**, usando papel Narrador existente sem criar usuário: gravação sintética, idempotência, SELECT do Narrador, negação a não-Narrador e `ROLLBACK`; todas as tabelas continuaram vazias.
- CI anterior: corrida de duas conexões, RLS, rollback e `pg_dump/pg_restore` em PostgreSQL 16 descartável aprovados. Não se trata de backup de produção.
- Não há escrituras de baixas em fichas oficiais; os snapshots são somente leitura.

## Funcionalidade liberada
- Acesso Narrador → Módulo de batalha → Batalhas salvas; listagem, leitura, replay SHA-256 e retomada de batalha ativa.
- Uma batalha retomada é alterada **localmente**; `Salvar cópia da batalha` cria um novo snapshot com replay integral. O registro original é imutável. Não há substituição silenciosa nem sincronização de conflitos.
- `VITE_ENABLE_BATTLE_PERSISTENCE` e `ENABLE_BATTLE_PERSISTENCE` passam a assumir habilitado quando ausentes. Kill-switch explícito `false` desabilita interface (no próximo build) e servidor, respectivamente.
- Todos os endpoints ainda exigem token válido, papel atual de Narrador, estado de acesso ativo e verificações de replay/cópia oficial no servidor.
- SQL da batalha **não é reaplicado**, pois já existe e foi comparado à homologação.

## Limites e contingência
- A homologação da **UI autenticada com JWT real** não foi concluída por falta de créditos do Lovable; portanto o aceite operacional no navegador deve ser conferido após o deploy. Esse risco residual não está coberto pelos testes SQL.
- O ledger Drizzle difere entre produção (40) e a cópia de homologação (0). Como a migração SQL já está instalada e separada, **não alterar o ledger**.
- Reversão: deploy de revert do commit de release ou configuração de `ENABLE_BATTLE_PERSISTENCE=false` (servidor) e `VITE_ENABLE_BATTLE_PERSISTENCE=false` (build), sem remover dados táticos gravados.
- Ao encontrar falha, usar o kill-switch; **não apagar** batalhas persistidas. Acompanhar issue #260 até verificar JWT real e uso em produção.
