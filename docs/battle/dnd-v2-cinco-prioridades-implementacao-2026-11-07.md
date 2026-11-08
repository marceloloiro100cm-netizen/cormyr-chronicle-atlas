# Cormyr · D&D V2 — implementação das cinco prioridades

**Baseline:** PR #332, derivada de `main` 0bd898c8. **Escopo exclusivo:** modo D&D simplificado do Narrador; GOT e Adaptado preservados. **Data da auditoria:** 7 de novembro de 2026.

## 1. Correções de regras (P0)
- Identificador de sessão V2 `dnd-training-v2-...` distingue fórmulas novas dos replays antigos.
- Desliga moral automática, falha por moral, turnos extras por moral, penalidades de moral e retaliação automática apenas no D&D V2.
- D&D V2 não encerra automaticamente no limite de 20 rodadas nem após duas rodadas sem dano. Encerramento por eliminação/retirada ou comando explícito do Narrador, com resultado registrado em replay.
- Resolve ataque simples por d20, PV, CA e dano; sem habilidades e magias especiais nesta fase.

## 2. Alterar efetivos durante a batalha
- Novos comandos auditados em replays: `DND_SET_COUNT`, `DND_WITHDRAW`, `DND_ADD_STACK`, `DND_END_BATTLE`.
- Ajuste de quantidade preserva o número de baixas anteriores e PV da criatura parcialmente ferida, respeitando teto de tamanho.
- Retirada oculta a unidade do mapa sem convertê-la em baixa; relatório distingue retiradas.
- Reforços entram na zona de implantação desocupada, com iniciativa d20 determinística no estado do replay. Até sete pilhas ativas por lado.
- Painel de ajustes recolhível para não diminuir o mapa.

## 3. Movimento, distância e voo
- Armas/ataques à distância **não possuem alcance máximo numérico no tabuleiro D&D V2**. É obrigatória a linha de visão; um alvo bloqueado por cobertura intransponível não fica automaticamente elegível.
- A biblioteca permite todos os ataques `ranged`, mesmo quando a fonte não forneceu `range_ft`. O dano e bônus básicos são preservados; não são convertidos em ataque corpo a corpo.
- Criaturas com `flags.flying=true` e velocidade de voo positiva atravessam terrenos difíceis, florestas, rochas, barreiras e posições ocupadas. Não terminam na posição de outra tropa.
- Mapas D&D V2 podem conter uma barreira contínua (como um rio modelado como quadrados intransponíveis); os outros modos continuam exigindo conexão terrestre.
- **Limitação visual:** o mapa compartilhado distingue planície, floresta, colina e rocha. Rio/muralha ainda é representado como obstáculo intransponível nesta versão; altitude, pouso, tamanhos multicélula e escala de 5 pés são melhorias posteriores.

## 4. Fichas de monstros corrigíveis sem alterar originais
- As 300 entradas do Supabase permanecem inalteradas.
- `battle_dnd_monster_overrides`: tabela isolada com correções por monstro de PV, CA, deslocamento terrestre, voo, bônus e dano de ataques simples.
- Editor privativo do Narrador com salvar e restaurar original. Loader aplica o `combat_patch` ao montar o catálogo de combate, validando os 300 registros resultantes.
- 16 criaturas com `speed_ft=0` continuam recebendo voo de 30 pés somente enquanto não houver revisão explícita. Quando o Narrador salva `fly_ft`, o motor utiliza o valor revisado.
- O símbolo de proveniência continua `local-unverified`: nenhuma ficha de terceiros é publicada em GitHub ou concedida ao jogador.

## 5. Salvar e retomar
- `battle_dnd_sessions`: replays e relatórios privados por `owner_id` e `battle_id`.
- Somente Narrador autenticado e ativo pode listar, gravar ou retomar. O carregamento verifica o replay com os hashes originais.
- Cada novo encontro recebe identificador próprio; sessões antigas exportadas continuam recuperáveis por arquivo e a versão V1 não é recalculada com regras V2.
- A gravação é explícita pelo Narrador, não automática. Salvar novamente após alterações é necessário.

## Migração e segurança
- SQL versionado em `docs/battle/sql/0082_dnd_private_sessions_overrides.sql`; aplicado nas duas tabelas separadas.
- RLS ativada. Regras: `is_campaign_admin()` e `campaign_access_active()`; em sessões, `owner_id=auth.uid()`. Nenhum privilégio SELECT anônimo.
- Não altera senhas, e-mails, contas, fichas de Casas, recursos, exércitos oficiais, calendário, missivas ou outros sistemas de combate.

## Portão de aceite antes da publicação
1. CI `Validate` (testes, TypeScript, build) e navegador sintético verdes no SHA final.
2. Teste autenticado com Narrador: catálogo 300, editar ficha, reforçar, retirar, salvar e retomar em outro dispositivo.
3. Teste jogador/anon: RLS nega leitura e escrita direta de ambas tabelas e do bestiário.
4. Batalha de voo através de rocha/floresta; ranged atravessando a distância total de linha visível; obstáculos fechados impedem tiro sem linha.
5. Replay V2 verificável e replay V1 importável; GOT e Adaptado sem regressão.

**Não afirmar conclusão de publicação sem confirmação do deploy atual.**
