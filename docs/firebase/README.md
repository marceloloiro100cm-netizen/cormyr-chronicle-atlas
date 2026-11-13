# Migração Cormyr para Firebase — lote 1

Status: preparação implementada, sem migração de dados ou alteração de produção.
Origem: main em 12/11/2026. Não utilizar tokens ou geração Lovable.

## Evidência do código

`source-inventory.json` é reproduzível com `node scripts/firebase-inventory.mjs`.
Encontrados 89 arquivos SQL, 61 candidatos a tabelas, 144 nomes de funções SQL
(distintos, sem distinguir overloads) e 104 arquivos de aplicação acoplados.
São declarações históricas, não objetos comprovadamente ativos no banco.
O estudo de 21 tabelas/8 RPCs é insuficiente como lista de exportação.
Inventariar também Hub Temporal, espionagem, calendário, permissões, jornal e batalhas.
Não versionar conteúdo do banco, usuários, missivas, hashes de senha ou notas GM.

## Ferramentas deste lote

- `node scripts/firebase-inventory.mjs`: inventário estático, somente leitura, sem credenciais.
- `node scripts/firebase-backup-manifest.mjs /caminho/backup`: hashes SHA-256 de todos os arquivos locais, sem modificar originais. Salvar saída FORA da pasta de entrada. Rodar apenas sobre backup imutável; arquivo mudando durante leitura não constitui evidência válida.
- `node --test scripts/firebase-*.test.mjs`: regressões das ferramentas.
- `firebase/firebase.json`: configuração isolada dos emuladores, sem projeto real ou deploy.
- Firestore/Storage negam todo acesso de clientes inicialmente. Não são regras finais; Admin SDK continua sujeito a IAM, não a Security Rules.

Após instalar Firebase CLI em ambiente autenticado:
`firebase emulators:start --project demo-cormyr-migration --config firebase/firebase.json`
Esse comando ainda não foi executado neste lote. Não publicar regras de bloqueio em projeto existente.

## Correções necessárias ao estudo

1. Imagens privadas permanecem privadas. Não gerar download tokens permanentes ou URLs públicas para missivas, respostas e registros. Manter referências estáveis e verificar leitura em servidor; somente acervo público pode usar cache público.
2. Claims não bastam para revogação imediata. Preservar checagem autoritativa de usuário, representação e associação; seleção de Casa não concede acesso.
3. Usuários: preservar UID e importar hashes apenas depois de verificar algoritmo e disponibilidade no export real. BCRYPT é suportado pelo Firebase, mas preservação de senhas ainda não foi demonstrada neste projeto.
4. Contagens do PDF são referências antigas. Export atual deve incluir catálogo SQL real, dados, Auth, políticas, triggers, funções, grants e TODOS os binários Storage, inclusive históricos.
5. Não prometer custo zero. SSR, builds, saída de dados e região precisam de medição e orçamento; alertas de orçamento não bloqueiam gasto.
6. TanStack Start usa servidor. Candidato de hospedagem: Firebase Hosting + Cloud Run, a validar com build Nitro independente. Upload do diretório estático sozinho não migra o sistema autenticado.
7. Há dois adaptadores Drive dependentes do proxy Lovable. Acesso direto exige identidade Google com permissão nas pastas; conta de serviço não herda acesso do usuário. Preservar IDs, ETags, leases e outbox.

## Ordem de execução e critérios

1. Conectar Firebase, identificar projeto homologação e projeto produção, confirmar região e faturamento. Configurar orçamento e CI com identidade federada, sem chaves no repositório.
2. Obter backup privado atualizado e binários; comparar lista/contagem com origem. Gerar manifesto, verificar hashes e realizar restauração de teste. Não desligar origem nesta etapa.
3. Implementar build independente de Lovable, runtime Cloud Run e adaptadores Firebase isolados. Testar SSR, arquivo estático e rotas protegidas em homologação.
4. Migrar Auth e autorização, depois casas/fichas, missivas e mídias, Hub Temporal/espionagem, jornal/batalha e Drive. Migradores idempotentes com dry-run, checkpoint e validação; detectar documentos acima do limite Firestore, não truncar JSON.
5. Cobrir emuladores com matriz de acessos: anônimo, jogador, outra Casa, narrador e editor. Preservar editor sem envio de missivas e simulações sem impacto nas Casas reais. Testar revogação, entrega por rodada, operações concorrentes e repetidas.
6. Reconciliar IDs, contagens, versões, conteúdo, hashes, tesouro, ledger, estado temporal e anexos. Executar fluxos reais em homologação.
7. Preparar freeze de escrita, export delta e rollback. Trocar domínio somente após aceite de reconciliação. Encerrar Lovable após estabilidade e cópia recuperável; nenhuma escrita dupla sem protocolo de reconciliação.

## Pendências externas

Firebase ainda não conectado nesta execução. Não foi criado projeto, ativado faturamento,
exportado banco de produção, executado emulador ou publicado site. O backup citado no
histórico não foi fornecido nesta execução; o anexo atual é o estudo PDF.

Referências técnicas:
- https://firebase.google.com/docs/hosting/cloud-run
- https://firebase.google.com/docs/auth/admin/import-users

## Aplicativo cadastrado em 12/11/2026

O proprietário cadastrou o aplicativo Web Cormyr Chronicle Atlas no projeto
`cormyr` (número `477785088395`) e forneceu a configuração pública do SDK.
Ela está em `src/integrations/firebase/public-config.ts`, ainda sem inicialização
ou troca do backend ativo. Analytics não foi inicializado. O bucket informado
na configuração não comprova provisionamento do Storage.

A conexão do ChatGPT com Firebase falhou. Alternativa operacional: Cloud Shell
no console Firebase, autenticado pelo próprio proprietário. Primeiro diagnóstico
somente leitura: `firebase apps:list --project cormyr`. Não enviar tokens,
chaves de conta de serviço ou senhas pelo chat. O resultado desse comando não
concede acesso a este agente; implantação futura exige configurar CI com
identidade federada ou executar os comandos no Cloud Shell autenticado.

O projeto `cormyr` não foi classificado como homologação ou produção. Nenhum
alias default de deploy foi criado para evitar publicação implícita nele.
