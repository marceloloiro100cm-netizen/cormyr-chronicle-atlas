# Cormyr Chronicle Atlas

Site da campanha de Cormyr, com acervo público e Conselho dos Jogadores da segunda temporada.

- Site: https://cormyr-chronicle-atlas.lovable.app
- Editor e publicação: https://lovable.dev/projects/bdc007de-2bdf-4e28-8df8-b09ce46f884c
- Branch principal: `main`.

## Estrutura

| Caminho | Responsabilidade |
| --- | --- |
| `public/cormyr/` | Acervo original em HTML, CSS e JavaScript |
| `public/cormyr/data.js` | Catálogo inicial: 11 regiões e 172 casas |
| `public/cormyr/regions/` | Textos integrais regionais, carregados ao abrir “Ler mais” |
| `public/cormyr/histories/` | 170 arquivos JSON de histórias; o total não equivale ao número de casas |
| `src/routes/` | Rotas TanStack Start, autenticação e endpoints |
| `src/components/players/` | Conselho: carregamento, fichas, registros, administração e missivas |
| `src/lib/house/` | Regras de recursos, compras, exércitos, corte e vassalos |
| `campaign_private_gm_content` (Supabase) | Eventos e aventuras do Narrador com RLS |
| `drizzle/migrations/` | Migrações SQL de esquema, sem dados privados de campanha |
| `src/test/` | Testes unitários, de componentes e de integração |

Stack: React 19, TypeScript, TanStack Start, Vite, Tailwind, Supabase/PostgreSQL e Drizzle. O build usa a configuração gerenciada da Lovable. A rota `/` encaminha ao acervo estático; a área autenticada fica em `/jogadores`.

## Desenvolvimento

Use Node.js 24 e Bun 1.3.3. O lockfile versionado é `bun.lock`; não crie um segundo lockfile com npm.

```sh
bun install --frozen-lockfile
bun run dev
```

Antes de enviar alterações:

```sh
node --test scripts/*.test.mjs
bun run test
bun run build
```

`bun run lint` executa ESLint e regras de formatação do projeto. O workflow inicial valida acervo, testes e build; lint ainda não é um bloqueio global, pois o código legado não foi reformatado integralmente.

## Atualizações pelo GitHub

1. Crie uma branch a partir da `main`.
2. Faça as alterações e abra um pull request.
3. Confira o workflow **Validate** e revise o resultado.
4. Integre na `main`, mantendo o histórico existente.
5. Confira a sincronização no editor Lovable e use **Publish changes** para atualizar o site publicado.

O workflow roda em pull requests, pushes para `main` e execução manual. Ele não publica, não aplica migrações e não recebe credenciais administrativas do banco. Para exigir aprovação dos checks antes do merge, configure uma regra de proteção da branch no GitHub.

A sincronização segue a branch ativa da integração Lovable. Não renomeie ou desconecte o repositório sem revisar essa integração. Não use force push nem reescreva commits já enviados sem plano coordenado de recuperação do Lovable. A remoção dos arquivos do estado atual **não remove automaticamente** segredos de commits antigos.

## Banco, credenciais e testes de integração

As variáveis de servidor e as credenciais do Drive permanecem no ambiente de hospedagem. Nunca exponha chaves administrativas no navegador ou no repositório.

Os testes de integração que exigem `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` e `SUPABASE_SERVICE_ROLE_KEY` são pulados quando essas variáveis estão ausentes. **Execute-os apenas em um banco descartável de testes com as migrações aplicadas**: alguns alteram rodadas e criam usuários. A aprovação do CI comum não certifica permissões do banco em produção.

Mudanças SQL exigem um procedimento próprio de aplicação e verificação. A presença de arquivos no GitHub não comprova que as migrações estão aplicadas.

## Acervo e desempenho

Textos regionais são preservados integralmente em JSON e carregados somente quando solicitados, com cache na sessão, mensagem de falha e opção de tentar novamente. O catálogo inicial permanece disponível para busca e navegação.

Os mapas originais e seus downloads são preservados. As imagens de mapas já usam carregamento adiado; compressão ou novas miniaturas podem ser feitas separadamente, com conferência visual da legibilidade.

Consulte `AGENTS.md` antes de alterar regras de acesso, sincronização, conteúdo privado ou gestão das casas.

## Segurança do repositório público

O código pode ser público; e-mails de acesso, credenciais, fichas privadas, missivas e segredos do Narrador não podem ser versionados. Os eventos do Narrador são obtidos da tabela `campaign_private_gm_content` sob RLS; as planilhas importadas das vassalas ficam em `campaign_private_vassal_workbooks` e são lidas por função autenticada. O arquivo `.env.example` só documenta nomes de variáveis: segredos reais devem estar configurados no ambiente de hospedagem.

A remoção de conteúdo da branch atual **não apaga histórico Git, forks, clones, caches ou PRs anteriores**. Material já exposto deve ser tratado como comprometido até a revisão do histórico e a mitigação das credenciais. O script `scripts/setup-admin.ts` nunca altera senha ou e-mail nem cria usuários.

### Aviso de conteúdo de fã
Cormyr Chronicle Atlas é um projeto de fã não oficial, sem endosso da Wizards of the Coast. Forgotten Realms e materiais relacionados pertencem a seus respectivos titulares. Materiais originais da campanha permanecem sujeitos aos direitos de seus autores. Este aviso não concede licença para reproduzir conteúdo de livros não abertos.
