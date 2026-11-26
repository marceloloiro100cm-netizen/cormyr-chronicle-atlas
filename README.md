# Cormyr Chronicle Atlas

Site oficial da campanha de RPG **Cormyr (Forgotten Realms)**, reunindo o acervo público do reino ([atlas.cormyr.com.br](https://atlas.cormyr.com.br/cormyr/index.html)), o jornal **A Folha Sem Selo** (`/jornal`) e o **Conselho dos Jogadores** (`/auth` → `/firebase-access`).

- **Site em produção:** https://atlas.cormyr.com.br/cormyr/index.html
- **Hospedagem e backend:** Firebase App Hosting ([`apphosting.yaml`](apphosting.yaml)), Firebase Auth (E-mail/Senha + Login com Google), Cloud Firestore e Cloud Storage.
- **Branch principal:** `main` (deploy automático via Firebase App Hosting).

---

## Arquitetura e Estrutura de Pastas

| Caminho | Responsabilidade |
| --- | --- |
| `public/cormyr/` | Acervo público estático (HTML, CSS, JS, 11 regiões, 172 casas, calendário de Harptos e trilha sonora) |
| `public/spy-portraits/`, `public/maps/`, `public/assets/`, `public/battle/`, `public/newspaper/` | Mídias otimizadas do Conselho, unidades militares, mapas e gravuras |
| `src/routes/` | Rotas TanStack Start (`/auth`, `/firebase-access`, `/jornal`, `/reset-password`) e APIs server-side (`/api/firebase-*`, `/api/public/*`) |
| `src/lib/firebase/admin.server.ts` | Singleton compartilhado do Firebase Admin SDK (Auth, Firestore e Storage) |
| `src/lib/firebase-workspace/` | Adaptador operacional do Conselho no Firestore (cache de tabelas imutáveis, overlays filtrados, registros e economia) |
| `src/lib/` | Motores puros de regras de jogo (Casas Nobres, Prosperidade, Missivas, Hub Temporal, Espionagem, Jornal, Batalha) |
| `src/components/` | Interface do Conselho (Jogadores, Narrador e Editor-Chefe), com code-splitting por aba |
| `firebase/` | Regras de produção (`firestore.rules`, `storage.rules` — deny-all para Client SDK), `firestore.indexes.json` e configuração de emuladores |
| `scripts/firebase/` | Serviços Firebase server-side e testes unitários de contrato |
| `docs/` | Documentação viva de operação, deploy e Login com Google (veja [`docs/README.md`](docs/README.md)) |
| `drizzle/` | Migrações SQL históricas usadas pela suíte de regressão de contratos do CI |
| `.github/workflows/` | Workflows essenciais de CI (`validate.yml`, `build-check.yml`) e monitoramento operacional |

**Stack:** React 19, TypeScript, TanStack Start + Nitro (`node-server`), Vite, Tailwind CSS, Firebase Admin SDK, Firebase Auth Web SDK (lazy-loaded para Login com Google) e Vitest.

---

## Desenvolvimento Local

Requisitos: **Node.js 22+** e **Bun 1.3.3** (usado no CI).

```bash
# Instalar dependências (lockfile versionado: bun.lock + package-lock.json)
bun install --frozen-lockfile

# Servidor de desenvolvimento
bun run dev
```

### Validação antes de abrir PR

```bash
# Build de produção (gera src/routeTree.gen.ts)
bun run build

# Verificação de tipos
bunx tsc --noEmit

# Gate de privacidade do repositório público
node scripts/verify-public-repo.mjs

# Testes unitários (scripts + Vitest)
node --test scripts/*.test.mjs
node --test scripts/firebase/*.test.mjs
bun run test
```

---

## Publicação e Operação no Firebase

1. Crie uma branch a partir da `main` e abra um Pull Request.
2. Aguarde o workflow **Validate** ficar verde antes do merge.
3. Ao fazer merge na `main`, o **Firebase App Hosting** compila (`npm run build`) e sobe a nova revisão automaticamente a partir de [`apphosting.yaml`](apphosting.yaml).
4. **Login com Google:** veja o passo a passo completo do Firebase Console e da vinculação self-service em [`docs/firebase/GOOGLE-LOGIN-2026-11-20.md`](docs/firebase/GOOGLE-LOGIN-2026-11-20.md).

> **Histórico de migração (2024–2026):** logs antigos de lotes, workflows descartáveis de migração e documentos do período Lovable/Supabase foram preservados integralmente na tag Git `archive/pre-cleanup-2026-11-26`.

---

## Segurança do Repositório Público

Este repositório é **público**. Nunca commite:
- Segredos, chaves JSON de conta de serviço ou arquivos `.env` reais (use segredos do App Hosting via `firebase apphosting:secrets:set`).
- E-mails privados de jogadores, senhas, missivas, fichas privadas ou material reservado do Narrador.
- Consulte [`AGENTS.md`](AGENTS.md) antes de alterar regras de acesso, Hub Temporal, economia das Casas ou o Jornal.

### Aviso de Conteúdo de Fã
Cormyr Chronicle Atlas é um projeto de fã não oficial, sem endosso da Wizards of the Coast. *Forgotten Realms* e materiais relacionados pertencem a seus respectivos titulares.
