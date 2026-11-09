# Cormyr — UX de batalha: lotes 7–9 e medidas em metros (09/11/2026)

## Decisão de conversão D&D
- Interface de D&D mostra metros: 5 pés ≈ 1,5 m, 10 pés ≈ 3 m,
  15 pés ≈ 4,5 m, 30 pés ≈ 9 m, 60 pés ≈ 18 m.
- Equivalência SI exata: 1 pé = 0,3048 m. Exibição de mesa é *aproximada*
  para facilitar contagem de quadrados, usando 5 pés como cerca de 1,5 m.
- Escala real de resolução **não mudou**: `DND_FEET_PER_SQUARE=10`;
  diagonal mantém custo de 1,5 células, LOS e voo inalterados.
- Catálogos e JSON continuam com `speed_ft` e `fly_ft`; telas exibem
  `formatDndMetres()` e os editores convertem de volta para múltiplos
  de 5 pés. Replays e criaturas antigas não são reescritos.

## Lote 7 — limpeza de inconsistências
- GOT mostra fase corrente; trilha de seis fases em `Ver fases`, sem
  mudar a ordem oficial ou ignorar fases vazias.
- O D&D não exibe `General: Nenhum ativo` na arena.
- D&D usa `Atacantes/Defensores` ao mostrar tropas e objetivos;
  cores e identificadores internos preservados.

## Lote 8 — jogabilidade e feedback
- PTE e CRZ identificam atacante e alvo a partir dos eventos já resolvidos
  e mostram danos/baixas fornecidos pelo motor. Dados detalhados ficam sob
  consulta; cálculos nunca são repetidos na UI.
- O PTE resume as ações efetivamente realizadas pela IA, sem inventar uma
  justificativa estratégica.
- Busca do evento recente sem cópia total de `events`, e histórico visível
  obtido por recorte antes da inversão.

## Lote 9 — continuidade e acessibilidade
- `Continuar batalha` passa a ser ação consistente no painel inicial.
- Avisos contextualizam onde estão os dados: GOT local ao navegador;
  D&D em armazenamento privado autenticado; PTE na conta do Narrador quando
  disponível; Cruzada V3 via arquivo de replay.
- Na arena CRZ/D&D, funções técnicas ficam em `Mais opções`.
- Layout de toque e uso em telas compactas: alvos de 44px e foco por teclado.
- Ainda não unificamos o backend de persistência: isso necessitaria migração e
  não faz parte desta revisão.

## Critérios de aceite e restrições
- CI: Vitest, TypeScript, build, navegador sintético e bancos isolados.
- Teste de continuidade dos três modos e novos testes de conversão métrica.
- Nenhuma mutação de Casas, tropas, HUB, contas, senhas ou dados de produção.
- `BATTLE_PLAYERS_ENABLED=false` deve permanecer até autorização e teste
  JWT/RLS autenticado e revisão visual manual do Narrador no celular.
- Teste sintético não prova ergonomia em aparelho Android real.
