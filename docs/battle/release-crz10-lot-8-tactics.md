# CRZ-1.0 — Lote 8: evasão tática e formação defensiva

**Escopo:** regras experimentais controladas, somente no motor CRZ-5E, sobre #286 (Lote 7). Nenhuma alteração no hash/preset, perdas oficiais, unidades de jogadores, Supabase ou redutor PTE.

## Implementações

**NIMBLE_ESCAPE** (traço `nimble-escape` autorizado na ficha):
- É uma **habilidade explícita** disponível somente antes de mover/atacar; ocupa o espaço de preparação de habilidade da ativação.
- Ao mover no mesmo turno ignora **somente a interrupção por zona de controle** inimiga. Rocha, ocupação, orçamento de movimento e fronteiras continuam bloqueando.
- Não adiciona dados de dano, não causa ataque gratuito e não permite segundo movimento.
- Um batedor fictício do catálogo de treino demonstra a habilidade; sem atribuição automática a unidades oficiais.

**SHIELD_WALL_FORMATION** (magia experimental do General, já declarada mas anteriormente não executável):
- Só funciona quando há pelo menos **duas pilhas aliadas com rotina corpo a corpo adjacentes**; conjuração **sem alvo individual**.
- Consome **2 de energia** e **um uso de magia na rodada**, com **+2 CA** às pilhas elegíveis durante a duração já estabelecida do Lote 4.
- Recaste do mesmo General **renova, não acumula** bônus daquela formação. Sem refund/efeitos colaterais ou escrita em campanha.
- Preserva todos os limites já existentes de General, rodada, energia, seed, CRZ e origem `fictional`.
- UI inclui a nova opção apenas quando preparada, com o custo e o estado de elegibilidade; magias não executadas permanecem ocultas.

## Critérios de aceite

`src/test/crusade-crz10-lot8-tactics.test.ts`: exclusividade de traços, travessia de ZOC, bloqueio de segundo MOVE, nenhum bônus ofensivo, formação com aliados, custo/energia, falhas sem gasto, prevenção de empilhamento, replay de evasão com verificação e adulteração. Vitest, TypeScript, build e CI de DB descartável obrigatórios.

**Aviso:** valores de `SHIELD_WALL_FORMATION` (+2 CA/2 energia) são provisórios até a revisão da calibração normativa 07. Nenhum efeito do manual de Pathfinder proprietário é copiado. Nenhuma interface dos jogadores é exposta nesta fase.
