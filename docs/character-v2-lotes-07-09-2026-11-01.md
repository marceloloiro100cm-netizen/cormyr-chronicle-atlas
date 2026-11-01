# Cormyr Chronicle Atlas — Ficha de Personagem V2 — Lotes 07 a 09
**Data:** 01/11/2026 · **Estado:** engine aditivo; ficha V2 pública segue desabilitada.

## Fonte e estratégia
Livro: Guerra dos Tronos RPG (edição portuguesa no acervo da campanha), Capítulo 5, tabelas 5-1 e 5-2, e Capítulo 3, tabela 3-11.

O inventário do lote 01 contém 150 entradas: 115 benefícios/variantes e 35 defeitos. src/lib/character-v2/trait-rules.ts classifica cada item em verified, narrative_manual ou pending_source_review. Não é correto inventar +N para efeitos que dependem de cena, história ou escolha do Narrador. As entradas aprovadas e a ficha homologada são pré-requisitos para aplicar efeitos; não é autorização de acesso web (RPC e RLS no lote 11).

## Lote 07 — Fortuna, Herança e Habilidade
- Regras prontas: Ágil (rerrolagem facultativa de 1 em Agilidade); Amigo das Feras (+1D em Encantar/Treinar); Durão (+B verificado de Resistência à Saúde); Rápido (+1 Movimento e Corrida 5 × Movimento).
- Fortuna e Herança permanecem manual/pendentes quando criam posses, efeitos de narrativa, magia ou exigem validação editorial: Abastado, Sortudo, Companheiro, Enorme, Sangue de Heróis, Warg, entre outras.
- Motor com origem identificada, critérios de elegibilidade, normalização de aliases e prevenção de acúmulos duplicados; nada modifica graduações compradas.

## Lote 08 — Marciais e Sociais
- Teimoso (+B de Dedicação à Compostura, exigindo Vontade 3 e Dedicação 1B).
- Atraente (rerrolar 1 em Persuasão); Carismático (+2 ao resultado de Persuasão, graduação 3); Traiçoeiro (soma Astúcia ao resultado de Enganação).
- Favorito da Nobreza (+1B Persuasão contra Status 4+); Favorito da Plebe (+1B contra Status até 3); Preciso (+1D Pontaria contra cobertura).
- Benefícios de graus I, II, III respeitam a série de requisitos; efeitos de armamento, postura, manobra e ação ainda não são automáticos: Fúria, Pugilista, Lutador Braavosi, Dançarino da Água, Tiro Duplo/Triplo e Liderança devem ser vinculados ao motor de cenas/rolagens do lote 10.
- Contexto de teste explícito: habilidade, especialidade, cena, status adversário, finalidade e cobertura. Sem contexto, nenhum benefício situacional presumido.

## Lote 09 — Desvantagens, idade e condições
- Manco (Movimento -2); Anão (Movimento -1 e -1D em Charme/Seduzir); Doença na Infância (Saúde -2).
- Defeito parametrizado (-1D em uma habilidade escolhida, sem perder rank); Covarde (-1D durante combate/intriga); Ignóbil (-1D Persuasão/Status); Bastardo (-1D Persuasão contra Status maior); Doente (-2D Vigor para resistir doenças/perigos).
- Desastrado, Distraído e Marcado: rerrolagem obrigatória de 6 na habilidade correspondente.
- A tabela 3-11 exige defeitos por faixa etária, com habilidades distintas para idades avançadas. A avaliação nunca aplica defeitos quando o Hub Temporal avança.
- Ferimentos, lesões, fadiga e condições importadas geram pendências rastreáveis, sem penalidade numérica até evento tipado e regra homologada.
- Proscrito e demais efeitos que alteram Status exigem conciliação com Status da Casa; permanecem pendentes.

## Motor, interface e segurança
- src/lib/character-v2/trait-engine.ts faz avaliação pura e gera modificadores e efeitos contextuais separados; regras não suportadas nunca produzem número.
- src/lib/character-v2/derived.ts calcula Rápido 5× sem replicar bônus; os demais modificadores entram apenas uma vez.
- A prévia V2 discrimina fontes e pendências, mas a feature flag segue falsa. Nenhuma RPC, migração SQL ou atualização das fichas dos jogadores.
- Apenas uma camada de servidor autenticada poderá entregar efeitos ou registrar compras reais, no lote 11.

## Aceitação
A suíte character-v2-traits.test.ts verifica 150 status, pré-requisitos, aprovação, seleção duplicada, efeitos passivos/condicionais, rolagens, idade e condições. CI deve aprovar testes, TypeScript e build.

## Lotes seguintes
10: armas, armaduras, ações, rolagens, ferimentos, exportação.
11: RPC atômica, RLS, Hub Temporal, Casa, Corte e Missivas.
12: conversão assistida de Aldaeric e outras fichas, comparação, aprovação Narrador, feature flag e publicação.
