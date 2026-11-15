# Lote 5 — Segurança, aceitação por perfil e homologação

## Escopo executado nesta etapa

Esta entrega testa em ambiente **isolado e sintético** o modelo de segurança do Cormyr, não as contas reais e nem o aplicativo hospedado. Nenhum registro da campanha é acessado, importado ou modificado. Não concede permissão Cloud ou altera as regras Firestore/Storage em produção.

### Matriz de segurança por identidade

| Operação | Narrador | Jogador A | Jogador B | Editor | Anônimo/sem perfil | Usuário suspenso ou com troca de senha |
| --- | --- | --- | --- | --- | --- | --- |
| Ficha da Casa A | permitido | permitido | negado | negado | negado | negado |
| Ficha da Casa B | permitido | negado | permitido | negado | negado | negado |
| Missiva entregue para A | permitido | permitido | negado | negado | negado | negado |
| Edição publicada do jornal | permitido | permitido | permitido | permitido | negado | negado |
| Rascunho do jornal | permitido | negado | negado | permitido | negado | negado |
| Registro privado da Casa A | permitido | permitido | negado | negado | negado | negado |
| Quarentena de missivas ambíguas | negado | negado | negado | negado | negado | negado |
| Escrita direta nas coleções pelo navegador | negado | negado | negado | negado | negado | negado |
| Banco de batalha, espionagem, Drive, correio e notas do Narrador via SDK cliente | negado | negado | negado | negado | negado | negado |

O teste `lot5-role-security.integration.mjs` cria dados fictícios no **Firestore Emulator real**, carrega `firebase/firestore.domain.rules` e usa clientes com claims deliberadamente falsificados, comprovando que apenas a associação autorizada consultada no Firestore determina os direitos. Valida leitura e escrita, isolamento entre Casas, cartas excluídas, drafts editoriais, registros e dados restritos, além da revogação imediata na chamada seguinte. Exercita também a rota HTTP de domínio e o serviço de fichas via identidade simulada. Não utiliza uma autenticação de usuário real em Firebase Cloud.

### Correção aplicada

`hasScope(snapshot)` passou a exigir, para **todos os perfis**, `userId` igual ao UID autenticado, `active=true` e `requirePasswordChange=false`. Antes, o Narrador e o editor não precisavam concluir a troca de senha para acessar parte das coleções de homologação. Essa correção é **somente nas regras do emulador** e está coberta por testes de regressão.

### Preflight de produção

`lot5-safety-preflight.mjs` verifica, somente lendo o próprio repositório, que:

- Firestore e Storage de produção permanecem `deny all`;
- `src/start.ts` ainda usa o backend Supabase, até a aprovação do corte;
- `apphosting.yaml` não liga a ponte do Firebase Emulator nem publica o painel experimental;
- não há segredo com valor literal nos campos sensíveis da configuração.

Esta verificação devolve `safeToMergeCode`, que **não é** sinônimo de `readyForCutover`. Os resultados relativos a identidade Cloud, Firestore Cloud, cinco buckets, Cloud Scheduler, Drive real e rollback permanecem explicitamente `false` até haver evidência de operações reais autorizadas. `cloudWrites=0`.

### Critérios do Lote 5 que ainda NÃO foram cumpridos

1. Homologação **contra o Firebase Cloud real** (projeto isolado) com contas migradas e papéis Narrador, jogadores e editor, via interface real; a rota `/firebase-homolog` ainda é uma bancada local emuladora.
2. Integração das telas reais à nova camada Firebase: no momento `src/start.ts` mantém `attachSupabaseAuth` e os adaptadores de módulos do Lote 2 não substituíram o backend ativo.
3. Conclusão do Lote 3: importar e reconciliar todas as contas e dados, cuidando de identidades OAuth e missivas em quarentena.
4. Conclusão do Lote 4: cinco buckets com checksum origem/destino e autorização efetiva por Casa; Google Drive bidirecional; rotinas Cloud Scheduler; proteção contra repetição dos jobs antigos.
5. Ensaio de performance e carga **no backend Cloud**, com métricas de latência e custo; os testes de emulador só validam semântica e acesso.
6. Ensaio e documentação de rollback com cutover controlado, reconciliação das escritas e plano para reiniciar Supabase sem perda.

**Conclusão:** testes de segurança no emulador e proteção contra promoção prematura avançam; **Lote 5 ainda não está completo**, `readyForCutover=false`. Não contabilizar automaticamente seus 8 pontos percentuais.
