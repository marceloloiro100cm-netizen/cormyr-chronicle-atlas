# D&D — perfis militares, pilhas de monstros e importação de tabelas

Data: 7 de novembro de 2026. Modo: **D&D simplificado (CRZ-5E)**, mapas **quadrados**. Escopo: simulador local do Narrador; nenhuma unidade, Casa, recurso, ficha de jogador, calendário ou banco oficial é alterado.

## Entrega

- **De/para das 17 unidades do catálogo militar do Cormyr** em `src/lib/crusade/dnd-military.ts`, cobrindo PV, CA, ataque, iniciativa, deslocamento, dano e alcance. Perfis foram criados para este jogo, **não são traduções oficiais das estatísticas GOT** nem reproduções dos blocos protegidos do bestiário.
- **16 tipos disponíveis em arena terrestre.** Navios de Guerra estão no mapeamento como o 17º tipo, mas desabilitados: um navio possui escala, terreno e comportamento naval, não é uma tropa de 100 criaturas. Cavalaria usa referência de 20 cavaleiros; navios, referência de 5 embarcações; os demais, 100 combatentes por unidade **no cadastro original**, sem empilhamento compulsório na arena.
- Tipo Especial permite perfil genérico com aviso de revisão: habilidades e características específicas ainda devem ser confirmadas pelo Narrador.
- Cada lado recebe **1–7 pilhas** de **1–1.000 criaturas** por pilha, sujeitas aos limites por tamanho do CRZ-5E (Gargantuesco ≤25, Enorme ≤100, Grande ≤400). Pilhas têm PV agregados, criaturas sobreviventes, vida da criatura atingida e perdas auditáveis.
- **D20:** resolução rolada por ataque/monstro, incluindo 1 natural e 20 natural; iniciativa d20 + modificador de Destreza + treinamento lançada uma vez no começo de cada encontro. Opções: Rolada (padrão do D&D), Híbrida (em pilhas grandes usa probabilidade derivada do d20) ou Esperada.
- **CSV/JSON:** importação local de até 200 monstros / 1 MB. Cada linha aceita nome, id, tamanho, tipo, PV, CA, iniciativa, deslocamento em pés, ataques/dano corpo a corpo e à distância, alcance, quantidade e lado. A quantidade é sugestão; ao preparar a batalha, o Narrador escolhe a pilha. O leitor valida formatos, números, duplicações, conteúdo e origem, sela hash de cada ficha e impede cruzar com catálogos de outro replay.
- **Direitos:** origem, licença, atribuição e prova explícita de permissão são obrigatórias. Sem scraping, sem importação silenciosa de bestiários; os arquivos permanecem na memória do navegador durante a partida e dentro do replay exportado voluntariamente.
- **Replays:** snapshot integral da criatura e RNG dentro do replay verificável, sem dependência da tabela original para reexecutar a batalha.

## Modelo de CSV

Separador preferencial: ponto-e-vírgula (`;`), também aceita vírgula e campos entre aspas.

```csv
id;name;size;type;hp;ac;initiative;speedFt;meleeAttack;meleeDamage;rangedAttack;rangedDamage;rangeFt;count;side;source;license;attribution;permissionEvidence
wolf-test;Lobo de treino;M;beast;11;13;2;40;+4;2d4+2;;;;6;defender;Criação do narrador;original-authorized;Criatura fictícia da campanha Cormyr;Autorização do próprio criador para uso privado no simulador
```

- `size`: T/S/M/L/H/G (minúsculos ou palavras em inglês e português aceitas).
- `meleeAttack`, `rangedAttack`: bônus inteiros, por exemplo `+4`.
- `meleeDamage`, `rangedDamage`: fórmula `NdM+X`, por exemplo `1d8+3` ou `2d4+2`.
- `rangeFt`: alcance em pés, obrigatório quando existe ataque à distância.
- `count`: sugerido, de 1 a 1.000; `side`: attacker/defender.
- `license`: CC-BY-4.0, CC-BY-3.0, CC0-1.0, OGL-1.0a ou original-authorized. A ferramenta **não verifica direitos de terceiros**; depende de informações verdadeiras do autor e não reclassifica obras como SRD.
- Também aceita JSON em formato de array de linhas ou objeto `{"monsters":[...linhas]}`, com as mesmas propriedades.
- Apenas ataques simples de corpo a corpo e à distância são executáveis nesta versão. Magias, salvaguardas, ataques em área, multiataques especiais, ações lendárias e resistências não são inferidos do CSV. A ficha importada exibe aviso de limitações.

## Pontos de atenção de fidelidade

O D&D é deliberadamente um **jogo de exércitos simplificado com resolução d20**, não D&D 5e completo. O motor compartilha infraestrutura de pilhas da Cruzada, mas permanece isolado de GOT e Adaptado. O de/para é uma calibração de valores de teste, a ser ajustada posteriormente com o Narrador.

A forma de terreno naval e monstros grandes exige mapa e regras próprias, não falsificar velocidade de caminhada. Acessórios específicos de unidades oficiais, habilidades de Casas e qualidades de personagens não são importados da ficha GOT automaticamente. Futuros tipos podem ser adicionados como novas entradas no mapa de de/para, sem alterar o histórico das 17.
