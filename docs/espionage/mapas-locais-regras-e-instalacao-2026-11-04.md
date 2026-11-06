# Mapas locais de espionagem — regra de exibição (2026-11-04)

## Regra efetiva do planejador
- Se o agente está em outra região em relação à Casa-alvo, **manter o mapa geral de Cormyr** e os cálculos originais de deslocamento.
- Se o agente e a Casa-alvo estão na mesma região e a Casa proprietária do agente também pertence a ela, mostrar o **mapa detalhado dessa região**, quando cadastrado.
- Os mapas detalhados de Dragon Coast, Horselands e Volkumburgh **não têm modal, controles de zoom, carrossel nem setas de navegação**. Escalam proporcionalmente à largura da seção.
- Para as Casas com bandeiras e nomes identificados na imagem, desenhar os dois marcadores e uma linha ilustrativa de origem até destino.
- **A duração da missão continua sendo calculada pelo planejador e pelo SQL**; distâncias gráficas não são datas, movimentos nem aprovações.
- Se o arquivo da imagem faltar, usar o mapa geral já existente sem bloquear a missão.
- Se uma Casa não tiver posição identificada no mapa, exibir o mapa, mas não inventar coordenadas ou linha.

## Imagens enviadas pelo Narrador (04/11/2026)
| Região | Arquivo em `public/maps/espionage/` | Dimensões |
|---|---|---|
| Dragon Coast | `dragoncoast.webp` | 1709 × 920 |
| Horselands | `horselands.webp` | 1024 × 1536 |
| Volkumburgh | `volkumburgh.webp` | 1536 × 1024 |

A versão WebP otimizada dos três arquivos está no pacote entregue na conversa. Os arquivos binários **precisam estar publicados** sob os caminhos acima; enviar apenas o código ao GitHub não inclui imagens anexadas ao chat.

As âncoras de Casas identificadas constam em `src/lib/espionage/spy-noble-detail-maps.ts`. Volkumburgh não tem identificação textual das bandeiras no desenho; portanto **não tem âncoras atribuídas**. A calibração depende de identificação confirmada pelo Narrador.

## Próximas regiões
1. Adicionar o arquivo otimizado em `public/maps/espionage/<slug>.webp`.
2. Cadastrar nome, caminho, largura, altura e casas identificadas no objeto `SPY_NOBLE_DETAIL_MAPS`, em `spy-noble-detail-maps.ts`.
3. Marcar as coordenadas no sistema de pixels **da imagem original**, não no tamanho exibido pelo navegador.
4. Testar origem, destino, ausência de coordenadas, uso do fallback e comportamento responsivo.

Não alterar `cormyr-interactive-map.tsx` nem as RPCs de viagem para cadastrar mapas novos.


## Mapas adicionados (06/11/2026) — arquivos originais otimizados para WebP
- **Helmlands**: 1536 × 1024, `/maps/espionage/helmlands.webp`, 25 estandartes cartografados; Marliir e Obarskyr sem marcador identificável na imagem.
- **Shieldmark / Marca do Escudo**: 1536 × 1024, `/maps/espionage/shieldmark.webp`, 30 casas com coordenadas de estandartes.
- **Crownlands / Terras da Coroa**: 1536 × 1024, `/maps/espionage/crownlands.webp`, 24 casas com coordenadas de estandartes.
- Os mesmos arquivos são mostrados em **Reino e Regiões** como mapa da região, e na **Espionagem** como mapa local com sobreposição SVG calculada nas coordenadas originais.
- A imagem e as linhas usam a mesma caixa responsiva, com proporções fixas e tamanho máximo baseado na altura da janela; sem recorte e sem zoom forçado.
- Origem e alvo são encontrados pelo nome/ID normalizado da Casa, sem inferir posições para estandartes ausentes. As linhas são apenas orientação visual; não modificam distâncias, recursos ou as RPCs do Hub Temporal.
- Integridade dos três arquivos WebP verificada por hash Git (blob SHA-1) após upload: `9ce5b178a582539331b1e11a7622fb1b2d45b6ed`, `0dd5f599aead606e29d2df6bde3d9e59528d2a22` e `feb353cd39a5079098a770db73391a2c5b52ad52`.

## Ferlin e Stonelands (06/11/2026) — preparação dos novos mapas

| Região | Ativo no repositório | Tamanho original | Casas cartografadas |
|---|---|---|---|
| Ferlin | `public/maps/espionage/ferlin.webp` | 1183 × 1329 | 10 |
| Stonelands | `public/maps/espionage/stonelands.webp` | 1536 × 1024 | 8 |

Os mapas devem ser publicados **junto aos arquivos WebP originais otimizados**, não só com as referências de código. As duas imagens compartilhadas pelo Narrador foram convertidas para WebP mantendo a resolução; o pacote binário acompanha a entrega da tarefa.

Em **Reino e Regiões**, `public/cormyr/data.js` referencia o mesmo ativo da Espionagem, evitando versões conflitantes. O CSS preserva todo o enquadramento para o formato vertical de Ferlin e o horizontal de Stonelands, sem corte. Em Espionagem, as posições dos estandartes são coordenadas de pixels da imagem original e servem apenas de orientação visual. O processo de deslocamento, probabilidades e a regra de mostrar mapa geral quando a região é diferente permanecem inalterados.

A suíte de testes exige os dois WebP antes da integração, para impedir que uma publicação parcial quebre as imagens do atlas. Após anexar os dois arquivos em `public/maps/espionage/`, validar os testes de `src/test/espionage-noble-detail-maps.test.tsx` e o carregamento HTTP 200 dos dois ativos no domínio publicado.
