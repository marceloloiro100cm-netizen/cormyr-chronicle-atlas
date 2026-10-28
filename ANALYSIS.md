# Cormyr Chronicle Atlas - Análise do Projeto

## 1. Visão Geral
**Cormyr Chronicle Atlas** é uma aplicação web focada em uma campanha (provavelmente de RPG de mesa) centrada em Cormyr, com um arquivo (acervo) público de informações narrativas e uma área privada/autenticada para a segunda temporada (Conselho dos Jogadores).

O projeto adota uma abordagem híbrida:
* O acervo original estático é preservado integralmente na pasta `public/cormyr/`.
* A nova extensão autenticada e as APIs residem na estrutura do `TanStack Start` (`src/routes/`).
* A aplicação foi construída com o framework `TanStack Start`, que fornece renderização do lado do servidor (SSR) e roteamento seguro e tipado.

## 2. Stack Tecnológico
- **Core:** React 19, TypeScript
- **Framework de Roteamento/Fullstack:** TanStack Start, TanStack Router
- **Estilização:** Tailwind CSS (via Vite plugin), Tw-animate-css, class-variance-authority, clsx, tailwind-merge
- **Componentes:** Radix UI (abrangente utilização de primitives) e Lucide React (ícones)
- **Banco de Dados & Auth:** Supabase, PostgreSQL
- **ORM:** Drizzle ORM (com Drizzle Kit para migrações)
- **Construção e Ferramentas:** Vite, Bun (Node.js 24)
- **Testes:** Vitest, React Testing Library, JSDom
- **Outras Dependências Importantes:**
  - `react-hook-form` e `zod` para formulários e validação.
  - `jspdf` e `xlsx` para geração de relatórios exportáveis.
  - `@lovable.dev/cloud-auth-js` e `@lovable.dev/mcp-js` sugerindo integração de autenticação e ferramentas externas providas pela Lovable.

## 3. Arquitetura e Estrutura de Diretórios
- **`public/cormyr/`**: Acervo legado em HTML/JS/CSS original (sem ser rescrito, garantindo fidelidade). Contém textos descritivos das regiões e JSONs com a história de 170 casas.
- **`src/routes/`**: Implementação das rotas TanStack Start. Inclui:
  - Redirecionamento da raiz `/` para o acervo estático.
  - Rotas autenticadas sob `/jogadores`, onde reside o hub da casa.
  - Endpoints de API.
- **`src/components/players/`**: Interface do usuário para a área do Conselho, incluindo gestão da casa (hub), missivas, fichas, administração.
- **`src/lib/house/`**: Lógica core de regras de jogo e de negócio. Gerencia: recursos, posses, tropas, cortes, vassalos. Regras puras com validações e integrações.
- **`src/server/gm-content.json`**: Informações exclusivas do Narrador (eventos, aventuras). Fora de acesso público.
- **`drizzle/`**: Configurações de esquema e 35 migrações versionadas do SQL.
- **`src/test/`**: Bastante focado em testes. Os testes cobrem desde regras puras do motor do jogo (ex: militar, recursos) até testes com fluxo completo de interação e componentes de UI usando `.tsx`.

## 4. Regras e Restrições Críticas (`AGENTS.md`)
- **Imutabilidade e Fidelidade**:
  - Evitar force push ou reescrever histórico (quebra o editor da Lovable).
  - O site original e seus arquivos permanecem intocados; as extensões rodam paralelamente.
- **Segurança e Privilégios**:
  - Dados sensíveis e permissões são validados usando RLS (Row Level Security) e RPCs no banco de dados, nunca apenas via UI.
  - O modelo garante que visualizar e agir como um personagem de uma casa nunca vaze o acesso total (ex: cargos na corte são amarrados aos IDs sem duplicar dados).
- **Google Drive e Sincronização**:
  - Há uma sincronização detalhada e unidirecional (em alguns pontos bidirecional para arquivamento) do Google Drive. Hashes provisórios não podem autorizar sobrescritas de arquivos; ETags reais são mandatórios.
  - Operações que sobrescrevam arquivos requerem intervenção do administrador, validando o contexto.
- **Gestão do Jogo:**
  - Sistema contábil restrito com auditoria em `ledger` com snapshots privados para evitar mudanças silenciosas.
  - Missivas e rodadas de jogo têm entrega restrita transactionally às semanas ativas. Mensagens não entregues ficam isoladas e privadas.

## 5. Status do Roadmap
**Concluído Recentemente (Outubro/2024):**
- Extensa refatoração do Hub das Casas, implementando regras de recursos, ficha com evolução, corte, exportação de PDFs e comparador entre origens de dados.
- Lógica completa de missivas V3: criação de painéis focados por resposta e leitura, suporte para filtros, lixeiras e envio entre jogadores ou narradores, bem como proteção e restrição à rodada atual do jogo.
- Sincronizações diversas com o Drive. Integração com IA (MCP para ChatGPT) para as funções de Narrador.

**Pendências Imediatas/Futuras:**
- Finalizar a automação de efeitos de Prosperidade e regras mais complexas da evolução, criação de unidades mistas de exército, montarias e mecânicas de cerco que atualmente possuem implementação apenas parcial.
- Realizar conciliação externa e representação das casas de forma integral (já foi construída a infra, mas falta uso e validação real da gravação massiva de dados no Drive/exportação).
- O módulo de validação concorrencial em ambiente isolado.
- Validar se o Conselho está funcional na conta do Narrador real e organizar as 170 galerias via processo assíncrono.
- Verificar a execução automática das pastas técnicas reais (ainda não acionadas).

## Resumo e Próximos Passos
O projeto atingiu um nível enorme de cobertura de testes (mais de 200 testes rodando consistentemente) e maturidade em sua camada técnica de isolamento de estado (jogo vs plataforma web).

O código demanda atenção para os módulos pendentes de gestão militar avançada, conclusão das automações que alteram dados complexos, ou, possivelmente, alguma correção pontual de bug caso a UI reporte novas issues.
