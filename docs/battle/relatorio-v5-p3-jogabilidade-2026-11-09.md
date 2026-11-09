# Cormyr Chronicle Atlas — Relatório V5 (P3)
**Data:** 9 de novembro de 2026  
**Escopo:** evolução do simulador Adaptado, sem alteração dos motores GOT/D&D e sem liberação de jogadores.

## 1. Entregas P3
| Item | Implementação | Limite |
|---|---|---|
| Editor multiobjetivos | 2–5 pontos, quota de 1–5 controlados, contagem de 2 rodadas por padrão, estrelas no mapa | Apenas motor Adaptado; posições precisam ser transitáveis e únicas |
| Objetivos narrativos | Postos avançados, ponte e portão fortificado | Ponte e muralha são terrenos simplificados do Adaptado; sem mecânica de cerco GoT |
| IA configurável | Equilibrada, agressiva, defensiva, à distância; escolhas determinísticas legais | Não aprende, não usa LLM, não faz planejamento de vários turnos |
| Desafio e duração | Indicador descritivo da potência inicial relativa; rodada, comandos, movimentos, ataques, baixas; tempo da aba | Não calcula probabilidade de vitória; tempo não acompanha outras sessões |
| Aceitação automatizada | Testes do motor, replays, mapa, seleção de IA e Chromium móvel | Não substitui sessão do Narrador autenticada no Android físico |
| Testes reais com jogadores | Protocolo proposto na seção 7 | **Não realizados nesta execução:** exigem participantes/ambiente real e acesso autorizado |

## 2. Editor de missões
No Adaptado, os objetivos padrões continuam: eliminação, captura de um ponto e resistência. P3 acrescenta:
- **Postos avançados:** três posições separadas no campo, com dois pontos necessários para a vitória.
- **Ponte:** mapa de travessia com barreira de rocha e uma passagem transitável, mais três posições de controle.
- **Fortificação:** mapa com muralha e portão abertos de forma simplificada, mais três posições de controle no interior.

O Narrador pode editar os pontos diretamente no tabuleiro no modo avançado, escolher quantos devem ser dominados e permanecer com a configuração sugerida. O atacante mantém a quota por duas rodadas completas consecutivas; o defensor vence ao encerrar a rodada 10 sem conquista. O motor ainda permite vitória por eliminação. Objetivos inválidos (fora do mapa, sobre rocha, duplicados, quota maior que o total) são rejeitados no esquema de validação.

Nenhuma dessas metas altera a ficha de Casa, recursos, moral oficial ou calendário.

## 3. Perfil tático da IA
A estratégia pode ser escolhida por lado. **Equilibrada** mantém a política P2 antiga quando nenhum perfil é gravado; **Agressiva** prefere danos altos, preservando ataques legais; **Defensiva** usa a defesa quando não há ponto tático a disputar; **À distância** prefere posições de tiro sem inimigos adjacentes e tenta aumentar espaço quando necessário. O motor de ações e o replay permanecem determinísticos.

Campos novos `aiProfiles` e `objective` são opcionais. Arquivos PTE-2.0 legados não são reescritos. Os novos parâmetros são validados no replay e incorporados à cadeia de hashes.

## 4. Indicadores e privacidade
O módulo calcula força relativa a partir de efetivo inicial, pontos de vida e atributos táticos. O número indica pressão relativa, **não** dificuldade absoluta e **não** chance de vitória. Durante o confronto, a interface apresenta rodadas, ações, movimentos, ataques, baixas e relógio local somente desta sessão. Pausar para de acumular; recarregar ou retomar em outro dispositivo reinicia o relógio local. Não há coleta de dados externos nem alteração de esquema no banco.

## 5. UX simplificada
- Modo rápido: um seletor de objetivo e, somente quando usar IA, um seletor simples de estratégia.
- Modo avançado: um botão para editar estrelas no mapa, seletor da quota e controles por lado quando aplicável.
- Em combate: mesmo mapa e comandos; marcador do objetivo, progresso curto e indicadores secundários em painel recolhido.
- Acessibilidade: botões alcançáveis por toque, rótulos para seletores, leitura de posições e aviso do objetivo.

## 6. Critérios de aceite de engenharia
1. Todos os presets geram pontos distintos e transitáveis em ambos os tamanhos de mapa;
2. Contagem por rodada completa, não por ativação individual;
3. Captura só vence após o número exigido de rodadas consecutivas; prazo beneficia o defensor; eliminação antecipada preservada;
4. Replays antigos sem campos opcionais não mudam; novos replays verificam o estado idêntico;
5. Cada perfil IA retorna comandos legais, sem RNG;
6. Painel não grava informações pessoais nem depende de servidor;
7. Chromium móvel, testes de componentes, checagem TypeScript, build e bancos descartáveis passam.

**Estado dos checks — APROVADOS (09/11/2026):**
- PR [#349](https://github.com/marceloloiro100cm-netizen/cormyr-chronicle-atlas/pull/349) integrada à `main` (merge `5d83fe308074bee9c2abaf29dd72cbb210db91ec`).
- GitHub Actions `Validate`: **success**, 267 arquivos de testes aprovados, 4 ignorados, TypeScript e build aprovados.
- GitHub Actions `Battle browser acceptance (synthetic)`: **success**, 13 testes Chromium, incluindo missão P3 com objetivos múltiplos e indicador de combate.
- Testes de banco descartável de batalha e de correspondência: **success**. Nenhuma migração de produção realizada.
- Teste de editor Narrador (objetivo, mapa, quota, início) e IA defensiva incluídos na suíte de componentes.
- Aceite autenticado em Android físico e testes com participantes reais: **pendentes**; não confundir com CI.
- A integração GitHub **não comprova publicação** da última revisão no endereço público.

## 7. Roteiro de teste real — ainda pendente
Executar com Narrador autenticado em Android e 3–5 participantes voluntários:
- montar sem instruções uma batalha rápida em cada modo; registrar onde houve hesitação;
- criar uma missão de ponte, mudar a quota, mover um objetivo, iniciar e concluir;
- repetir com 4 perfis da IA e observar comportamento consistente;
- salvar, retomar e conferir replays em sessão autorizada;
- verificar toque em 360, 390 e 412 px, contraste, rótulos e orientação;
- medir conclusão de tarefas, erros de toque, duração e comentários dos participantes (consentimento explícito); não gravar e-mails/senhas;
- confirmar que o jogador não acessa dados privados, editor nem partidas alheias.

**Bloqueio de liberação:** nenhum teste sintético vale como aceitação em Android real ou verificação de RLS sob contas autenticadas. O acesso dos jogadores continua bloqueado por `BATTLE_PLAYERS_ENABLED=false`.

## 8. Pendências
Integração futura ao restante da campanha somente depois de homologação e autorização; campanhas e fichas oficiais continuam sem sofrer efeitos. A edição P3 não altera regras GOT nem D&D. Um editor de missões de cerco no motor GOT seria iniciativa separada, com rastreabilidade ao livro.
