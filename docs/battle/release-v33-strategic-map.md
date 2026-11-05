# Cruzada V3.3 — mapa estratégico abstrato

Continuação da issue #269, sobreposta ao PR #271 (comandantes evolutivos) e ao PR #270 (quartel).

## Funcionalidades
- Botão **Planejar Cruzada · Mapa estratégico** na preparação de batalhas livres; não aparece ao abrir convocações bloqueadas do Narrador.
- Mapa navegável com **7 nós fictícios**, **8 estradas**, **3 marcos estratégicos** e indicação de posições dos dois exércitos.
- Cada lado realiza uma ordem por dia local: marchar somente por estrada adjacente, recrutar 20 combatentes (60 suprimentos), reabastecer até 120 suprimentos ou encerrar o turno.
- O deslocamento consome suprimentos proporcionais ao tamanho do exército de treino; sem estoque suficiente, não existe marcha.
- Escaramuça automática **abstrata e determinística** ao entrar na posição inimiga, com perdas apenas no estado da simulação.
- Vitória ao controlar os três marcos no encerramento de um dia ou, após o dia 30, controle majoritário. Empate possível.
- Adversário IA de objetivos: busca alcançar posições não dominadas; em baixa de recursos, prioriza reabastecimento em depósitos próprios e recrutamento quando sua hoste fica pequena.
- Painel de efetivos, suprimentos, posição e histórico de ordens; interface baseada em botões nativos sobre mapa CSS/SVG, responsiva e utilizável via teclado.

## Segurança e limites
- As localizações são fictícias e **não correspondem a propriedades, limites ou mapa geopolítico de Cormyr**.
- Os dias do treino são isolados; não chamam o Hub Temporal e não envelhecem personagens.
- O contingente inicial é uma cópia numérica das pilhas em campo do quartel V3.1; recrutas, perdas, turnos e conquistas NÃO afetam os agrupamentos do combate tático ou as fichas oficiais.
- A arena de batalha tática PTE-3.0-SANDBOX permanece como botão separado **Batalhar**. Conectar conflitos táticos e conquistas estratégicas de forma transacional requer a fase de integração futura.
- Sem persistência remota, sem Supabase e sem migração de banco. Estado local é reiniciado ao fechar o mapa.
- Nenhum ativo ou regra proprietária de Pathfinder/Owlcat foi importado.

## Verificação e aprovação
`src/test/battle-v3-strategy.test.tsx` cobre conectividade da rede, restrições de deslocamento, orçamento logístico, controle da IA, conflito abstrato, vitória, UI e preservação da opção tática. CI com Vitest, TypeScript, build e Chromium deve ficar verde antes de qualquer merge. Esta entrega ainda **não é produção nem multiplayer**.
