# Homologação visual de miniaturas rígidas 3D — 10/11/2026

**Escopo:** continuação dos lotes 2, 3 e 4. Desenvolvimento em PR empilhado de revisão; nenhum deploy, migração, liberação para jogadores ou modificação dos motores. A homologação real em Android/GPU física ainda depende de execução manual.

## Situação de origem

- PR #360 (revisão do Lote 1) e PR #361 (lotes 2–4) tinham workflows Validate e Battle browser sintético aprovados, sem merge em main.
- A suíte sintética original validava mapas/replays e parte da UX, mas não exercitava WebGL2 real e as 17 miniaturas de ponta a ponta.

## Novas verificações (PR #362)

1. `tests/battle/browser/harness.tsx` monta `MiniatureDemo` exclusivamente com unidades fictícias e uma cena de 80 peças sintéticas; sem Supabase, credenciais ou campanha.
2. `tests/battle/browser/test_miniatures3d.py` usa Chromium Playwright com **SwiftShader** (WebGL2 por software), testa montagem de cena, alternância das câmeras, movimento visual, quatro arquétipos, galeria 17, toque e zoom móvel, ausência de WebGL com retorno 2D, carga de 80 peças e destruição/desmontagem do canvas.
3. `.github/workflows/battle-browser.yml` instala dependências Python fixadas, arquiva capturas PNG por 14 dias no artifact `cormyr-miniatures3d-swiftshader` e mantém execução sintética sem credenciais de produção.
4. Os testes anteriores de battle browser continuam no mesmo workflow; o Validate executa os testes de domínio/componentes, TypeScript e build.

## Problemas concretos encontrados e correções

- **Rótulos verticais e sobreposição de miniaturas em viewport móvel:** inicialmente o Html de cada peça quebrava palavras por caractere. Primeira correção reduziu os rótulos e padronizou alvos de toque de 44 px.
- **Rótulo selecionado sumindo:** a camada Html de Drei não mostrava todas as etiquetas na mesma cena. Criado painel de texto persistente acima do canvas com nome, contagem e Casa já fornecida pelo motor.
- **Exceção ao alterar de quatro para 17 tokens:** o Chromium registrou `removeChild: The node to be removed is not a child of this node`, associada aos portais de rótulos HTML. Substituídos por `CountSprite`, um billboard numérico renderizado como textura de canvas dentro de Three.js. Não há mais portais HTML por peça. O painel selecionado permanece fora do canvas.
- **Campos do catálogo em inglês:** galeria usa agora nomes de `BATTLE_PROFILES` em português, sem duplicar etiquetas ou inventar tipos.
- **Carga gráfica:** cena de 80 tokens fictícios exercita a via de geometria compacta já implementada. Não equivale a uma medição de FPS; somente garante renderização, inicialização e desmontagem no runner por software.

## Critérios obrigatórios para liberar homologação

- [ ] PR #362: Validate e Battle browser com WebGL aprovados no **commit final**; inspecionar capturas desktop/mobile.
- [ ] Em um Android real de capacidade intermediária: medir FPS, memória, aquecimento e toque/zoom em mapas 11×9 e 15×11 com 40/80 tokens.
- [ ] Em sessões de Narrador reais **de homologação**: alternar 2D/3D e comparar movimento, ataque, iniciativa, morte, pegada de criatura G, voo, seleção, replay e restauração nos três motores.
- [ ] Em conta de jogador: confirmar ausência do toggle 3D e ausência de mudanças nas fichas/campanha.
- [ ] Auditar contraste, legibilidade, rótulo selecionado e tamanhos de toque em tela estreita.

## Ressalvas importantes

- SwiftShader é software; o Chromium emulado com `is_mobile`/touch não mede aceleração gráfica nem bateria de um Android físico.
- Números de FPS e percentuais de usabilidade não devem ser inventados com base apenas na aceitação sintética.
- O código continua isolado, opt-in somente Narrador e **2D por padrão**.
- Nenhuma mudança em banco, RLS, login, Hub Temporal, fichas, motores de batalha ou dados oficiais das Casas.
- Não fazer merge nem publicar enquanto os gates de hardware e jogabilidade não forem aceitos.
