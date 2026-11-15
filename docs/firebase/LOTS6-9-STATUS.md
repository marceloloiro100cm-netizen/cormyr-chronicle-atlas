# Lotes 6–9 — Pré-corte Firebase, entrega técnica de 15/11/2026

Esta entrega adiciona **contratos e verificações seguras** à base da migração. Os quatro lotes receberam trabalho de código, mas **não estão finalizados de ponta a ponta**. Toda aplicação real permanece em Supabase e o corte permanece proibido até reconciliação e homologação Cloud.

## Lote 6 — Adaptador de leitura (entrega implementada)

- `src/integrations/backend/firebase-read-adapter.ts` define 16 superfícies de leitura para os serviços já existentes: perfil, Casas, fichas, registros, personagens, agenda, calendário, missivas, jornal, espionagem, batalha, conteúdo do Narrador e Drive.
- A bancada `FirebaseDomainPreview` passou a usar esse adaptador único. Seleção de operação fora da lista, Casa inválida, período inválido e recurso desabilitado são rejeitados sem fallback Supabase.
- `firebase-read-adapter.test.ts` verifica todos os contratos e o bloqueio de escrita.
- **Não realizado:** ligar as telas reais de `/jogadores` ao Firebase Cloud, alterar login real ou habilitar os serviços de emulador em produção. Essa integração depende de importação segura de usuários, dados, backend HTTPS transacional e provas de permissão por Casa.

## Lote 7 — Inspeção de destino, antes de importar (entrega implementada)

- `scripts/firebase/lot7-cloud-destination-preflight.mjs` consulta apenas **contagem limitada de contas** e **quantidade de coleções Firestore** no projeto Firebase de homologação **isolado**.
- Recusa deliberadamente o projeto de produção `cormyr`, projetos genéricos, nomes inesperados e resultados inválidos; nenhum UID/e-mail/ID de coleção é impresso.
- `canPrepareDryRun` apenas indica ausência de contas e coleções vistas pelas APIs consultadas; **não autoriza importar** nem prova que buckets, bancos nomeados, usuários OAuth ou dados foram preservados.
- Exige `firebase-admin` no ambiente operacional, ADC autorizada a ler o projeto isolado e um ID explícito como `cormyr-homolog-sandbox123`. Não comitar contas de serviço/JSON.

Uso autorizado pelo operador em Cloud Shell isolado:

```bash
node scripts/firebase/lot7-cloud-destination-preflight.mjs --readonly --project cormyr-homolog-sandbox123
```

Esse comando **não foi executado contra a nuvem** nesta entrega porque não há acesso ao projeto isolado nem dados de origem atualizados nesta conexão. Antes de qualquer importação, ainda serão necessários o backup novo íntegro, reconciliação de Auth/Firestore, verificação de cinco buckets e a decisão de staging do proprietário.

## Lote 8 — Aceitação por perfis (entrega implementada)

- `scripts/firebase/lot8-http-role-acceptance.mjs` exige 12 resultados HTTP **observados** durante a integração real do emulador.
- O teste `lot5-role-security.integration.mjs` agora registra as respostas HTTP de narrador, jogador A, jogador B, editor, contas bloqueadas, anônimo e acessos revogados, e recusa saídas ausentes, permissivas ou duplicadas.
- O workflow `firebase-lot5-security-e2e.yml` também reage às mudanças da matriz do Lote 8.
- **Não realizado:** testes E2E de usuários reais migrados no Firebase Cloud, edição/publicação de missivas, jornal, espionagem e batalha pela interface final, e carga/performance Cloud. Os resultados do emulador não equivalem a essa evidência.

## Lote 9 — Portões e preparação de corte (entrega implementada)

- `scripts/firebase/lot9-cutover-gate.mjs` audita as regras de produção, a autenticação padrão Supabase e as configurações que **não devem** habilitar a ponte Firebase do emulador em App Hosting.
- Lista 12 requisitos externos: rotas SSR implantadas, origem e freeze, Auth e UIDs, Firestore, cinco buckets, testes por papel, frontend real, Drive, Scheduler sem duplicidade, rollback e aprovação do proprietário.
- O diagnóstico é **NO_GO** por desenho e `readyForCutover=false` mesmo que alguém preencha manualmente todos os requisitos como `true`. Ninguém deve utilizar esta saída para fazer deploy, migrar dados ou revogar credenciais.
- Workflow `firebase-lots-6-9-readiness.yml` executa testes sem segredos, sem Firestore Cloud, sem SQL e sem mudança do DNS.
- **Não realizado:** Cloud Scheduler real, corte DNS de backend, importação final, rollback Cloud e desligamento do Supabase.

## Dominio publicado e pendência aberta

Foi informado como configurado no Firebase App Hosting: **https://atlas.cormyr.com.br**. A verificação externa pelo GitHub Actions encontrou `/cormyr/index.html`, `/auth` e a mídia estática HTTP 200; `/api/public/translations` respondeu HTTP 400 JSON previsto, mas `/api/firebase-auth-verify` ainda respondeu **404**.

Ver [Issue #472](https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas/issues/472). Conferir o backend e o commit realmente publicados em App Hosting antes de habilitar qualquer migração de runtime.

## Invariantes de segurança

- Sem Lovable, sem alteração de DNS, credenciais, SQL, RLS, regras Cloud, jobs, objetos Storage, permissões ou contas reais.
- Nenhum `service_role` ou OAuth token em GitHub/Actions.
- `src/start.ts` continua com `attachSupabaseAuth`; Firestore/Storage de produção continuam `deny all`.
- Nem CI verde nem site acessível implicam corte autorizado.
- Percentual do projeto deve representar migração funcional comprovada, não a quantidade de scripts ou PRs.

**Progresso honesto:** etapas preparatórias executadas para os quatro lotes. **Lotes 6, 7, 8 e 9 não estão aprovados para produção** e permanecem com pendências externas acima.
