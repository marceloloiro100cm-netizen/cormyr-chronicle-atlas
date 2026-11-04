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
