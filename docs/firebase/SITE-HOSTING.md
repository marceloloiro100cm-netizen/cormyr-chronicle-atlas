# Cormyr — migração da aplicação para Firebase Hosting + Cloud Run

**Estado: implementação de build/infraestrutura para homologação, sem deploy.**
A transferência de 779 objetos do manifesto `campaign-images` para o prefixo
privado `migration-staging/campaign-images/` no bucket
`gs://cormyr.firebasestorage.app` foi confirmada pelo proprietário no Cloud Shell.
A contagem correta do destino foi 779. O manifesto ainda indica
`complete: false`; isso NÃO comprova reconciliação final com a origem.

## Por que não é só um upload estático?

A aplicação utiliza TanStack Start (SSR, funções de servidor e rotas protegidas).
A configuração atual `vite.config.ts` vem de
`@lovable.dev/vite-tanstack-config` com plugin MCP do editor. O app também
continua autenticando e acessando tabelas/RPCs via Supabase/Lovable.
Nenhuma dessas dependências é removida automaticamente pelo upload das imagens.

### Arquitetura de homologação

1. `vite.firebase.config.ts`: build **isolado** com plugins nativos
   TanStack Start, Nitro Node, React, Tailwind e aliases TS.
   Não carrega `@lovable.dev/vite-tanstack-config` nem o plugin MCP.
2. `Dockerfile.firebase`: imagem Node 24 com saída SSR `.output/`, sem
   chaves ou backups dentro do contexto, PORT=8080, HOST=0.0.0.0.
3. `firebase.hosting-homolog.json`: configuração de Hosting com arquivos
   públicos Nitro e roteamento SSR para serviço `cormyr-web-homolog`
   na região `us-central1`.
4. CI `firebase-site-runtime.yml`: compila e testa apenas localmente no
   GitHub Actions. **Não** tem segredos, acesso ao Firebase ou ação de deploy.

## Teste de build (sem infraestrutura, sem Lovable)

No repositório em Cloud Shell ou ambiente Node/Bun configurado:

```bash
bun install --frozen-lockfile
NITRO_PRESET=node_server bunx vite build --config vite.firebase.config.ts
node scripts/firebase/verify-node-build.mjs
```

O último teste inicia o Nitro localmente, solicita `/`, exige resposta HTML,
encerra o processo e não escreve no Firebase. Passar nesse teste **não** valida
login, missivas, RLS, RPCs, batalha, jornal ou persistência.

### Implantação futura (não executar antes do aceite)

A etapa Cloud Run exige projeto de homologação separado ou ambiente comprovadamente
isolado, APIs de Cloud Run e Cloud Build, orçamento, políticas de IAM, runtime
sem privilégios administrativos e segredos via Secret Manager, nunca no GitHub.
Publicar apenas após aprovação dos testes e da política de dados.

O arquivo `firebase.hosting-homolog.json` é **apenas modelo de homologação**:
não utilizar `firebase deploy --project cormyr` com ele sem garantir que o
projeto `cormyr` está isolado da produção e que o serviço correto existe.
O projeto `cormyr` ainda não foi classificado formalmente como produção ou teste.

Como o site atual depende do Supabase, implantar o contêiner por si só não é
migração de backend. Antes de liberar aos jogadores:

- Implementar Firebase Auth preservando UIDs e senhas **somente se o formato
  exportado for suportado**, sem importar refresh tokens/sessões.
- Migrar tabelas/RPCs por domínio com validação de transações, consultas,
  Firestore Security Rules e ACLs de arquivo; aplicar autorização por Casa
  no servidor para impedir vazamento entre jogadores.
- Reconciliar o PostgreSQL da origem com o backup de 12/11 e um delta final:
  casas, personagens, missivas, calendário, espionagem, jornal, batalhas,
  estados históricos, tesouros e imagens.
- Testar SSR, login, logout, revogação e ações concorrentes em homologação;
  publicar novo domínio somente após aceite e plano de reversão.
- Verificar custos Cloud Run/Hosting, limites de banco, compatibilidade de
  regiões e tráfego. Não presumir que haverá custo zero.

Fontes técnicas:
- https://tanstack.com/start/latest/docs/framework/react/guide/hosting
- https://firebase.google.com/docs/hosting/cloud-run
- https://docs.cloud.google.com/run/docs/container-contract
