# Espionagem — revisão R4: remediação dos oito critérios abaixo de 90%

**Projeto:** Cormyr Chronicle Atlas · 09/11/2026
**Base de produção:** `eced00ae570eb0375b5166eea8df30ca96ea7bd5` (P0–P3)
**Escopo:** implementação em branch e PR, sem atualização de produção, HUB ou credenciais.

## Oito critérios sinalizados

A avaliação anterior foi uma estimativa técnica ponderada, **não** uma amostra real de sessões de jogadores. Nenhum critério atingiu 90%, portanto **os oito foram marcados para correção**:

| Critério | Antes | Mudança implementada na R4 | Evidência ainda necessária |
| --- | ---: | --- | --- |
| **P1 Criação e gestão** | **83%** | Rede de origem escolhida explicitamente em vez de `slots[0]`; impede usar uma rede que perdeu vagas; botão/seleção mobile maiores | Criar dois agentes em Redes diferentes numa conta de homologação |
| **P2 Planejamento e início** | **85%** | Consulta da versão do HUB **no clique de confirmação**; não envia prazo obsoleto; recuperação guiada com um botão | Abrir confirmação, avançar HUB noutra sessão e verificar bloqueio sem missão fantasma |
| **P3 HUB e tempo** | **89%** | Consulta de agentes/centro em intervalo visível de 30 s; alerta se prazo chegou mas o estado ainda não mudou, com botão Atualizar | Publicar de fato 1 e múltiplas désdias em homologação e observar gatilho, sem tocar produção |
| **P4 Resolução e premiação** | **62%** | Corrigido o receptor de Supabase RPC nas ações server-side; resolução diretamente na Central; rotina de finalizar dossiê na mesma lista, usando adjudicação/prêmio idempotentes existentes | Fazer sucesso, fracasso, captura, retry e conferir XP/estado/prêmio numa missão real autenticada |
| **P5 Dossiês e sigilo** | **80%** | Ação direta **Concluir dossiê** somente no painel do Narrador; mensagem explícita quando fonte não disponível; continua usando a premiação protegida pelo banco | Confirmar visibilidade só da Casa e a ausência de duplicações |
| **P6 Painel do Narrador** | **82%** | **Resolver agora** e **Concluir dossiê** no painel global; carrega ficha apenas ao clicar, sem navegar entre Casas; indicadores atualizam | Teste humano de poucos cliques com narrador |
| **P7 UX móvel** | **74%** | Rede de origem legível, controles com 48–50 px, formulário responsivo, ação direta de missão na Central, alertas curtos | Teste visual real Android/iPhone, teclado e leitura a 320/375 px |
| **P8 Confiabilidade operacional** | **65%** | `rpc.bind(context.supabase)` nos endpoints server-side de espionagem; testes específicos usando RPC que exige `this`; atualização de dados e recuperação explícita | Validar 2 contas simultâneas, perda de rede, idempotência, RLS e reprocessamentos em homologação |

## Ordem de prioridade aplicada

1. Corrigir chamadas Supabase no servidor que poderiam impedir **criação e homologação reais**, mesmo quando contratos mockados passassem.
2. Possibilitar ao narrador concluir operação **e dossiê** no mesmo local, com advertência se a premiação persistida estiver ausente.
3. Evitar envio com versão antiga do calendário e expor estados atrasados com uma atualização segura.
4. Permitir escolher a origem da Rede e diminuir cliques e textos desnecessários.
5. Cobrir alterações com testes reais de handler (receiver-sensitive), regressão de UI, TypeScript, build e suite geral.

## Política de produção e aceite

- Esta branch **não executa SQL de escrita** e **não altera** dados reais do HUB, agente, jogadores, recursos ou missões.
- Os testes reais em duas contas ainda exigem um ambiente isolado com calendário, Casas com Redes, alvos, narrador e jogador autenticados. A homologação isolada consultada anteriormente possuía zero agentes, zero missões e nenhum calendário; não é aceitável alegar sucesso de jogo real sem provisionar legalmente esses dados.
- **Não recalcular notas para >=90% automaticamente.** A correção funcional só terá percentual reavaliado depois de testes autenticados reais, execução no celular e leitura do banco pós-missão.
- Gate de publicação: testes CI verdes, resolução das falhas, homologação de usuários, merge controlado e somente depois publicação Lovable.
- Se o banco finalizar a missão, mas não conseguir materializar o catálogo, mostrar *missão salva; dossiê pendente*, nunca reportar falso erro de resolução.

## Teste autenticado de isolamento de Casas — pronto para execução

O repositório inclui `scripts/espionage-authenticated-acceptance.mjs`, um ensaio
**somente leitura** que usa autenticação real (jogador e narrador separados)
para verificar gestão da própria Casa, acesso negado à Casa adversária,
dossiês privados, proibição do painel global e acesso correto do Narrador.

O script exige `SPY_ACCEPTANCE_ENV=isolated-homologation`, URL e chave pública
do Supabase, duas contas reais de teste e duas Casas distintas. Sem credenciais
ele recusa executar; não cria login falso, não utiliza `service_role`,
não altera agentes, partidas ou calendário. Executar no repositório com:
`node scripts/espionage-authenticated-acceptance.mjs` após configurar as
variáveis de ambiente indicadas no cabeçalho do script.

**Esta prova não foi executada com credenciais neste lote** porque o ambiente
isolado continua sem o calendário e as contas de teste necessárias.

## Roteiro de aceite real — exatamente nessa ordem

1. Autenticar narrador e jogador em **homologação isolada**; validar separação de permissões de duas Casas.
2. Criar espião Verde na Rede B, selecionar retrato e melhoria, confirmar versão, saldo e não duplicação ao repetir solicitação.
3. Selecionar espião, Casa-alvo e objetivo **Recursos / Exército / Posses**, registrar ordem e data da saída.
4. Avançar HUB de 1, 2 e várias désdias; observar viagem, investigação e `pending_narrator_review` no agente e Central, com datas de Harptos.
5. Resolver sucesso pela Central, confirmar uma única decisão, XP e informação gerada. Se `waiting_catalog`, usar **Concluir dossiê**.
6. Repetir mesma solicitação de conclusão; confirmar que não concede outro prêmio nem XP.
7. Entrar em uma **segunda Casa**, tentar visualizar/agendar operação e ler dossiê alheios; RLS deve negar.
8. Repetir para fracasso, captura e fuga. Validar que perda de conexão informa a verdade sobre resultados já gravados.
9. Executar em celular: criação, missão, progresso e resolução com rótulos legíveis, toque e retorno claros.

**Resultado técnico atual:** correções implementadas na branch R4. Validação de jogo real positiva e percentual novo **ainda não demonstrados**.
