# Lote 2 — integração do aplicativo com serviços Firebase (etapa 1)

## Estado real

Esta etapa adiciona uma ponte de módulos e um painel de leitura **somente em homologação local**. Não substitui a experiência dos jogadores na rota `/jogadores` e não autoriza o corte do Supabase. Os serviços originais de `scripts/firebase/` recusam Firebase Cloud por desenho; preservar essa barreira é obrigatório até implementação, importação, permissões e ensaio de produção completos.

A aplicação existente ainda usa `attachSupabaseAuth` no `src/start.ts` e as consultas Supabase nas telas. A nova bancada fica dentro de `/firebase-homolog` **depois** de autenticação Firebase, em modo de desenvolvimento com o projeto `demo-cormyr-migration`. Não há chave secreta no navegador.

## Componentes desta etapa

- `scripts/firebase/domain-http-handler.mjs`: API JSON estrita com lista fechada de ações de 15 domínios (acesso, Casas, fichas, registros, personagens, agenda, Hub Temporal, caixa de missivas, comandos, jornal, agentes/missões/inteligência, batalha, Narrador e Drive). Os serviços mantêm suas verificações de autorização; identidade Firebase é reválida a cada chamada.
- `scripts/firebase/house-view-service.mjs`: leitura autenticada da ficha da Casa da qual a identidade é membro, ou do Narrador. Editor nunca recebe acesso à ficha privada. Não confundir `roster_house_id` com associação autorizada.
- `scripts/firebase/serve-domain-emulator.mjs`: serviço HTTP apenas em `127.0.0.1`, sem TLS público e sem importação na aplicação de produção. O ID do snapshot é configuração do processo, não do usuário.
- `src/integrations/backend/firebase-domain-proxy.server.ts`: servidor TanStack só encaminha para a porta local fixa se o backend for explicitamente `demo-cormyr-migration`, os dois emuladores forem loopback, o ambiente for de desenvolvimento e a trava estiver habilitada. Nunca aceita URL do cliente, cookies nem fallback Supabase.
- `src/integrations/backend/firebase-domain-client.ts`: cliente autenticado com ID token Firebase, sem reutilizar sessão Supabase.
- `src/components/firebase/FirebaseDomainPreview.tsx`: painel para verificar resultados de leitura sem gravar dados, respeitando papéis e Casas. Ações de escrita só podem ser exercitadas pela API no emulador, após validação explícita, não aparecem na bancada.

Nenhum dado da campanha é alterado por este PR.

## Como testar localmente (somente dados fictícios)

Use uma cópia isolada/temporária do repositório e um snapshot já criado pelo stager sobre dados fictícios. Nunca exponha as portas dos emuladores à rede. Tenha `firebase-admin` disponível apenas no ambiente de teste, sem editar lockfiles públicos.

Configure os dois emuladores e o app local:

| Variável | Valor para homologação local |
| --- | --- |
| `FIRESTORE_EMULATOR_HOST` | `127.0.0.1:8080` |
| `FIREBASE_AUTH_EMULATOR_HOST` | `127.0.0.1:9099` |
| `FIREBASE_PROJECT_ID` | `demo-cormyr-migration` |
| `CORMYR_DOMAIN_SNAPSHOT` | SHA-256 de 64 caracteres do estágio completo |
| `CORMYR_DOMAIN_PORT` | `8788` |
| `FIREBASE_DOMAIN_HOMOLOGATION_ENABLED` | `true` |
| `FIREBASE_AUTH_HOMOLOGATION_ENABLED` | `true` |
| `VITE_FIREBASE_AUTH_HOMOLOGATION` | `true` |
| `VITE_FIREBASE_DOMAIN_HOMOLOGATION` | `true` |
| `VITE_FIREBASE_PROJECT_ID` | `demo-cormyr-migration` |
| `VITE_FIREBASE_API_KEY` | `demo-key` |
| `VITE_FIREBASE_AUTH_EMULATOR_HOST` | `127.0.0.1:9099` |

Inicialize o Auth e Firestore Emulator, execute as etapas de staging no mesmo snapshot, execute `node scripts/firebase/serve-domain-emulator.mjs`, depois `npm run dev`. Abra `/firebase-homolog` e entre com uma identidade fictícia do Auth Emulator.

- Narrador: consegue ler somente áreas que o serviço permite; algumas operações dependem de estágio e estado ativos.
- Jogador da Casa A: ficha A permitida; ficha B bloqueada; missivas recebidas somente com endereçamento autorizado.
- Editor: pode consultar edições do jornal conforme regras, mas não obtém acesso à ficha privada de outras Casas e não pode enviar missivas.
- Conta desativada, token inválido, snapshot incompleto, emulador desligado e servidor em modo produção: bloqueados.

## Testes que este lote ainda não substitui

A ponte **não** significa que todos os módulos do site tenham sido migrados. Ainda é necessário, por módulo:

1. Implementar o adaptador funcional na tela real, preservando contrato e layout (escrita, anexos, paginação, tempo e efeitos).
2. Ensaiar as chamadas reais no Firebase Emulator, com matrizes de autorização para os cinco papéis e comparações de resultado com o Supabase original.
3. Testar as versões Cloud com regras e importação de dados de homologação, credenciais restritas e rollback; os serviços atuais recusam Cloud.
4. Concluir Storage, autorização de arquivos, sincronização real do Drive, realtime, ações de batalha que precisam de `engine` e consequências transacionais.
5. Só promover cada adaptador ao ambiente principal após CI, E2E e aceite. Não altere `src/start.ts` nem use Firebase como padrão neste estágio.

`readyForCutover` permanece `false`. O Lote 2 está **em andamento**, não concluído.
