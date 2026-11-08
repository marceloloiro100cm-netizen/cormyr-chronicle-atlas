# Cormyr · D&D: importação privada de 300 monstros

Data: 7 de novembro de 2026. Continuação do PR #329.

## Entrada suportada

Arquivo do Narrador: `bestiario_cormyr_faerun_300.json`, com `metadata.version=1`, `metadata.count=300` e array `monsters` de 300 entradas. **O arquivo não é versionado nem distribuído neste repositório público.** As 300 fichas básicas foram registradas no banco Supabase privado, em `public.battle_dnd_cormyr_monsters`, com RLS de Narrador autenticado e acesso ativo. A interface carrega automaticamente as fichas pela função segura `loadBattleDndCormyr300`. A importação manual do arquivo JSON permanece como fallback, validado e salvo apenas no `localStorage` do dispositivo. Outras máquinas/navegadores autenticados podem consultar o mesmo catálogo privado.

Os metadados exibidos no navegador são nome, grupo, fonte, ND, tamanho, PV, CA, deslocamento e bônus de ataque. Habilidades especiais, conjuração, ações lendárias, ataque em área e multiataques não são importados para a engine. A proveniência é marcada `local-unverified`, explicitamente sem licença pública confirmada.

## Cinco grupos

- Dragões: 27;
- Goblinoides: 16;
- Humanoides: 126;
- Constructos: 61;
- Mortos-vivos: 70.

Total: 300. Nenhuma criatura é removida da biblioteca com filtros; são somente vistas sobre o catálogo em memória.

## Controles de preparação

- Pesquisar texto por nome, ID, fonte ou grupo.
- Filtrar grupo, tipo (dragon, humanoid, construct, undead), tamanho (T/S/M/L/H/G), fonte, ND mínimo e máximo.
- Ordenar por nome, ND crescente ou decrescente.
- Listagem paginada (30 resultados por vez) com botão **Mostrar mais**.
- Escolher quantidade de criaturas por pilha e botão **Atacante** ou **Defensor**, com limite inicial de sete pilhas por lado e limites de tamanho da engine.
- Inspecionar atributos na arena e mudar a quantidade no editor de pilhas antes de iniciar.
- Mapa quadrado unificado, zoom 100/150/200, visual ampliado, quadro de ordem de iniciativa, dados d20 e replays CRZ-5E preservados.

## Precisão e pontos de atenção

Ao validar o arquivo fornecido, foram identificados 39 registros marcados como ataque à distância mas sem alcance numérico e 16 criaturas com deslocamento 0. O importador **não inventa alcance ou movimento**: um ataque sem alcance só é oferecido como ataque adjacente se é o único ataque, com aviso de revisão; criaturas imóveis possuem `movementHex=0` por etiqueta explícita `immobile`. A iniciativa não está no arquivo selecionado; usa modificador de Destreza padrão 0 com aviso, e rolagem d20 do encontro.

Os valores do catálogo são derivados da seleção fornecida pelo usuário, e não representam uma implementação completa das criaturas de D&D nem demonstram a licença de sua publicação.

## Critérios de validação

- 300 entradas exatas, sem IDs duplicados, numéricos e dados válidos, tamanho máximo 600 KB;
- biblioteca com os cinco grupos e filtros combináveis;
- arquivos JSON arbitrários, errados ou adulterados são rejeitados antes da gravação local;
- pilha de monstro do catálogo gera CRZ-5E pronto, com source `monster-library`, hash de catálogo e replay verificável;
- criaturas imóveis não ganham deslocamento fictício;
- engine, estoque e contas de GOT/Adaptado permanecem inalterados.

## Fluxo do Narrador após a publicação

Módulo de batalha → D&D → **biblioteca carregada automaticamente do banco privado**, após autenticação do Narrador → filtrar criaturas → definir quantidade → **Atacante/Defensor** → **Iniciar batalha D&D · d20**. Fallback: **Carregar catálogo Cormyr 300 (JSON)** para arquivo local.

**Nota de entrega:** a carga inicial dos 300 registros foi realizada diretamente no banco privado do projeto. O SQL de esquema e política fica em `docs/battle/sql/0081_dnd_cormyr_300_private_catalog.sql`; os registros não fazem parte do GitHub. A função de consulta verifica a sessão do Narrador, confere a existência exata das 300 entradas e aplica a mesma validação estrita do arquivo JSON. Material não é servido à área pública.
