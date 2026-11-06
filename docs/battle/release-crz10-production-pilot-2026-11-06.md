# Publicação controlada CRZ-1.0 · Piloto do Narrador · 06/11/2026

Esta release transpõe **somente** os módulos `src/lib/crusade`, o componente `BattleCrzLab`, CSS, testes CRZ e documentação, sobre a `main` atual do projeto. **Não** mescla os 216 commits experimentais nem substitui os 10 commits de correção presentes exclusivamente na `main`.

- O menu **Módulo de batalha → CRZ-1.0 · Laboratório (teste)** é exibido somente na interface autenticada do Narrador; a tela é carregada de forma lazy.
- Para possibilitar os testes manuais solicitados, a flag `BATTLE_CRZ_TRAINING_UI_ENABLED` está habilitada por padrão, **apenas nesse menu**, e pode ser interrompida com `VITE_ENABLE_CRZ_TRAINING=false` seguido de rebuild e deploy.
- Tropas-modelo originais, quatro cenários, magias e habilidades do motor CRZ-5E, replays e relatórios JSON locais. **Sem escrita em Supabase, economia, unidades reais, missivas, Hub Temporal, contas ou progressão oficial**.
- Preservadas as correções da branch principal, inclusive as relacionadas a segurança. Sem novas migrações ou alterações de variáveis secretas.
- Nível de garantia: CI TypeScript/Vitest/build/DB descartável; a homologação visual real é responsabilidade do teste manual após implantação e não pode ser inferida de smoke tests da V3.
- Rollback: voltar ao commit da `main` anterior ao PR de piloto ou ativar o kill-switch por build; arquivos JSON exportados pelo usuário não são removidos.
- Critérios manuais: login Narrador e visualização do novo botão, player não enxerga CRZ, iniciar batalha, mover, atacar, General, habilidade, IA, replay/exportação/importação, alto contraste/zoom, 375px e desktop; ausência de alterações no site oficial.
