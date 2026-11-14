# Orca — Central multiagente de Cormyr

## Objetivo

Usar **Codex (OpenAI), Claude Code (Anthropic) e Antigravity (Google)** em
paralelo, cada um em seu **git worktree/branch**, com revisão por Pull Request.
O GitHub é a fonte oficial do código. **Não usar tokens ou editor do Lovable.**

A configuração do repositório fica em `orca.yaml`. O Orca é um aplicativo
desktop: instalação, autenticação e preferências globais precisam ser concluídas
no computador do operador. Estas instruções **não significam que as contas já
foram autenticadas nem que agentes estão executando**.

## 1. Instalar no Windows

1. Baixe o instalador **somente** de
   https://github.com/stablyai/orca/releases/latest/download/orca-windows-setup.exe
   (ou https://orca.dev/docs/install).
2. Instale **Git**, **Node.js 24 LTS** e **GitHub CLI** (`gh`).
3. Use um diretório de trabalho local fora de OneDrive, por exemplo
   `C:\\Projetos\\cormyr-chronicle-atlas`. No PowerShell:

   ```powershell
   git clone https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas.git C:\Projetos\cormyr-chronicle-atlas
   cd C:\Projetos\cormyr-chronicle-atlas
   gh auth login
   gh auth status
   git fetch origin
   git status --short --branch
   ```

4. Abra Orca → **Add Repo** → selecione o clone local.
5. Em **Settings → Repository**, defina base ref `origin/main` e confirme
   que o projeto está usando a configuração **orca.yaml** (não duplicar
   hooks locais com `Run both`).
6. Ao criar worktree, aceite o comando de setup **após revisar**:
   `npm ci --no-audit --no-fund`. Ele instala dependências locais
   pelo `package-lock.json` e aguarda a conclusão antes de iniciar o agente.
   Não executa deploy, SQL ou alteração de dados.

## 2. Conectar os três agentes

- **Codex:** instale pelo guia oficial https://github.com/openai/codex;
  autentique sua conta pelo `codex login` (ou login interativo equivalente).
  Confirme que o executável `codex` funciona no terminal.
- **Claude Code:** instale pelo guia https://code.claude.com/docs/en/setup
  e autentique com sua conta. Confirme `claude` no terminal.
- **Antigravity:** instale e autentique pelo canal oficial
  https://antigravity.google/ . No Orca, ative **Antigravity** entre os
  agentes instalados e utilize o fluxo de instalação/configuração que a
  versão local disponibilizar. Se estiver disponível no terminal,
  valide `agy` antes da primeira sessão.

Em **Settings → Agents → Installed agents**, habilite só os agentes usados
(Codex, Claude Code e Antigravity) e verifique as autenticações de cada um.

**CRÍTICO:** em **Settings → Agents → Agent Permissions** altere o padrão
de **Yolo** para **Manual** antes de iniciar os agentes. Nunca executar os
atalhos de bypass de sandbox/aprovações. No primeiro acesso, revisar as
permissões de pasta. Para o teste inicial, não fornecer credenciais de produção.

## 3. Criar três worktrees de teste

No Orca, clique **+** ao lado do repositório; use **Branch from:
`origin/main`** e crie três tarefas independentes:

| Worktree/branch sugerida | Agente | Teste inicial |
| --- | --- | --- |
| `orca/audit-codex` | Codex | Inspecionar arquitetura, sem alterar código |
| `orca/audit-claude` | Claude Code | Revisar UX e componentes, sem alterar código |
| `orca/audit-antigravity` | Antigravity | Verificar cobertura de testes, sem alterar código |

O botão **+** cria worktrees reais; não reutilize uma mesma pasta para dois
agentes. Em cada terminal valide `git status --short --branch`.
Depois, execute tarefas de código somente em branches distintas.

> Para a migração Firebase em andamento, comece da `main` para trabalho
> independente. Se uma tarefa depender explicitamente de código ainda em
> `chore/leave-lovable` ou outra branch, crie seu próprio worktree **a
> partir dessa branch** e explique a dependência no PR. Nunca avance ou
> reescreva a branch de outro agente.

## 4. Política de operações

1. **Um responsável por arquivo crítico:** evite dois agentes modificando
   simultaneamente `package.json`, lockfiles, `apphosting.yaml`,
   `AGENTS.md`, arquivos de autenticação ou migrações.
2. **Proibido modificar `main` diretamente.** Mudanças entram por PR;
   jamais fazer force push, rebase destrutivo ou merge automático.
3. **Sem credenciais de produção nas worktrees.** Não criar
   `.worktreeinclude` para `.env`, não compartilhar diretórios com
   segredos e não versionar configurações privadas.
4. **Dados protegidos:** não executar migrations, SQL, updates, exclusões,
   alterações de RLS, Firestore, Auth ou Storage reais sem autorização
   separada e plano de backup. Testes de integração devem usar emulador
   ou banco/projeto de homologação isolado.
5. **Migração Firebase preservada:** leia
   `docs/firebase/LEAVING-LOVABLE.md` e `docs/firebase/README.md`;
   não confundir migração da hospedagem com migração de dados.
6. **Validação:** cada PR registra arquivos afetados, comandos executados
   (`npm run test`, `npx tsc --noEmit`, `npm run build` quando cabíveis),
   resultados, riscos e alterações pendentes. Exigir **Validate** e
   **Build check** verdes, mais revisão independente.
7. **Deploy:** publicação no Firebase e configurações Cloud/segredos não
   fazem parte de um PR de código e exigem autorização explícita.

A revisão no PR é o ponto de integração. Se um agente altera backend e
outro altera frontend, combinar contratos antes de escrever as interfaces.
Se houver conflito no merge, designar **um** integrador e revalidar tudo.

## 5. Padrão de pedido para o Orca

```text
Projeto: Cormyr Chronicle Atlas.
Leia AGENTS.md e docs/orca/README.md. Trabalhe APENAS no worktree
e branch que lhe foram atribuídos. Não edite a main nem a branch de
outro agente. Liste os arquivos e contratos afetados antes de editar.
Não use Lovable/tokens Lovable, não exponha segredos e não execute
comandos contra produção. Se precisar alterar um arquivo compartilhado
com outro agente, pare e peça coordenação.
Antes de entregar, rode os testes pertinentes e gere uma proposta de PR
com escopo, resultados, riscos e eventuais dependências. Não dê merge.
```

## 6. Orquestração avançada (opcional)

O Orca oferece **Runs, Tasks e Workers** para supervisão de agentes.
A interface visual pode variar por versão; consulte
https://orca.dev/docs/cli/orchestration. A documentação atual descreve
a camada como experimental e orienta `orca orchestration run-create`,
`task-create` e `worker-start`; não utilizar o comando antigo
`orca orchestration run`.

Ative somente **depois** de validar worktrees, agentes e permissões.
Os workers precisam de `worker_done` e de revisão de PR; disparo não é
permissão para alteração de produção.

## 7. Verificações finais

- [ ] Orca instalado e aberto no Windows
- [ ] Clone local e GitHub CLI autenticados
- [ ] Codex autenticado e detectado
- [ ] Claude Code autenticado e detectado
- [ ] Antigravity autenticado e detectado
- [ ] Agent Permissions = **Manual**; sem argumentos perigosos customizados
- [ ] Base ref = `origin/main`
- [ ] `orca.yaml` disponível na revisão usada pelos worktrees
- [ ] Três worktrees diferentes iniciam e instalam dependências
- [ ] Nenhum `.env` de produção foi copiado/compartilhado
- [ ] Primeiro PR de teste passou nos checks
- [ ] Nenhuma alteração de produção ou merge foi feito

Documentação oficial: https://orca.dev/docs/model/worktrees e
https://orca.dev/docs/model/orca-yaml.
