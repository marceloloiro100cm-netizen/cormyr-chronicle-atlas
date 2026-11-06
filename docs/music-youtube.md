# Música pública — integração exclusiva com YouTube

## Etapa 1 (01/11/2026) — alterações no acervo público

- Todas as referências a arquivos do Google Drive foram retiradas do catálogo, cartões, descrições e reprodutor das músicas. Outros recursos do projeto que utilizam Drive não são afetados.
- Os 15 links de vídeos já identificados continuam cadastrados. O módulo `youtube-media.js` extrai IDs de URLs HTTPS autorizadas, normaliza links diretos e não depende de uma playlist específica.
- O Bardo da Corte cria um único player do YouTube por vez, sob ação explícita da pessoa, usando a IFrame Player API. O player identifica falhas 2, 5, 100, 101, 150 e 153 e fornece o link direto para abrir no YouTube.
- O link para a playlist original permanece como acesso opcional, sem determinar a capacidade de reproduzir cada vídeo.
- Seis músicas sem ID identificado no catálogo ficam visíveis como pendentes, não como links quebrados: O Nó de Sangue (Mareforte), A Força Vem do Povo (Yellander), A Milonga das Vozes que Ficam, Essa Coroa, Vou-me Embora pra Sossal e Música dos Dragões Azuis.
- As letras cadastradas continuam acessíveis.

## Validação

Execute `node --test scripts/youtube-music.test.mjs` ou `node --test scripts/*.test.mjs` e depois `bun run build`. Testes de fonte não substituem teste manual em navegador desktop, Android e iOS; valide aberturas, bloqueio de incorporação, troca de música e fechamento do player.

## Etapa 2 planejada (não implementada)

- Painel privado do narrador para indicar o YouTube ID das seis músicas pendentes e atualizar os vídeos existentes sem editar `data.js` manualmente.
- Diagnóstico periódico server-side dos vídeos usando YouTube Data API com credenciais e limites de cota apropriados; distinguir vídeo removido, privado, restringido e incorporação desabilitada. A API IFrame por si só só informa erros durante o uso.
- Histórico de verificações, botão de testar vídeo individualmente e auditoria do resultado no site publicado. Não marcar disponibilidade como comprovada sem consulta real ao YouTube.

## Comportamento esperado diante de falhas

O reprodutor exibe a mensagem de erro e oferece `Abrir no YouTube`. Não tenta contornar restrições ou reproduzir vídeos sem autorização. A política de referenciador utiliza `strict-origin-when-cross-origin` e a URL incorporada inclui `origin`.

Referências oficiais: https://developers.google.com/youtube/iframe_api_reference e https://developers.google.com/youtube/player_parameters.

## Auditoria de categorias e cobertura regional (06/11/2026)

- Catálogo estático: 15 vídeos vinculados por URL, 6 títulos ainda sem URL e 3 letras de Cancioneiro sem vídeo.
- O filtro Cancioneiro agora agrupa suas letras e seus títulos pendentes sob um único agrupamento e contabiliza cada registro uma única vez; o seletor passa a descrever corretamente os grupos.
- As 11 regiões são analisadas explicitamente: Crownlands, Ferlin e Volkumburgh não possuem vídeo temático vinculado no cadastro atual. Esses casos são apresentados como lacunas de cadastro, sem inventar vídeos.
- Os rótulos usam **vídeo vinculado**, não **vídeo disponível**, porque o parser valida apenas o formato de URLs e IDs. A disponibilidade e a autorização de incorporação dependem de consulta real ao YouTube.
- A playlist https://www.youtube.com/playlist?list=PLNkPwXjMDaCw não retornou seus itens na consulta externa desta auditoria. Assim, nenhuma música nova foi atribuída por suposição e nenhum link existente foi declarado reproduzível sem checagem externa.
- Antes de dar a importação como completa, obter via YouTube Data API (ou exportação confiável) os IDs e títulos atuais, comparar com os 15 IDs do cadastro, acrescentar os que faltam e confirmar as associações regionais e de Cancioneiro.

- A aba oferece **Ouvir a playlist aqui**: incorpora a playlist oficial somente após clique, exibindo também vídeos que ainda não foram individualmente catalogados. Essa vista não substitui a auditoria e classificação por vídeo. A abertura de uma faixa no Bardo fecha o iframe da playlist para evitar reprodução simultânea.


## Atualização de vídeos fornecidos pelo Narrador (06/11/2026)
- Swordmark: `https://www.youtube.com/watch?v=HHZjbwRCoes` (substitui o vínculo antigo).
- Shieldmark: `https://www.youtube.com/watch?v=5VPgawygkEc` (substitui o vínculo antigo).
- Ferlin: `https://www.youtube.com/watch?v=_uJndPcaHj0`.
- Volkumburgh: `https://www.youtube.com/watch?v=bR66gczzEdk`; o mesmo ID também foi atribuído à Casa Von der Harten conforme o link fornecido.
- Cancioneiro: Cante uma Canção a Elturel (`xoOtYuebA9k`), Terra dos Cavalos (`f4L0mCHpOv8`) e Essa Coroa (`HM4a9vYrdDU`).
- Os vídeos do Cancioneiro são músicas independentes, não substituem temas regionais. Elturel conserva a letra; Terra dos Cavalos recebe a referência de Horselands.
- Os links foram fornecidos diretamente pelo Narrador, normalizados e validados estruturalmente. A consulta do Windsor.ai ainda não retornou esses IDs; a disponibilidade atual e permissões de incorporação no YouTube não foram confirmadas pela fonte externa.
- O catálogo possui 18 vínculos em reino/regiões/casas + 3 no Cancioneiro, **20 vídeos distintos**, com o ID de Volkumburgh usado em dois contextos. Permanecem cinco músicas sem vínculo e duas letras sem vídeo.


## Cobertura regional completa — confirmação de Terras da Coroa (06/11/2026)
- Tema oficial **Terras da Coroa / Crownlands**: `https://www.youtube.com/watch?v=7B-Mb9vnmZk`, conforme link fornecido pelo Narrador.
- **Essa Coroa** (`HM4a9vYrdDU`) permanece **somente no Cancioneiro**, não é tema da região.
- As **11 regiões** têm exatamente um tema registrado: Crownlands, Swordmark, Dragon Coast, Ferlin, Helmlands, Horselands, Veilstone, Stonelands, Elfhold, Volkumburgh e Shieldmark.
- Swordmark/Shieldmark usam os links atualizados enviados em 06/11/2026; Ferlin/Volkumburgh foram adicionadas; o tema de Volkumburgh foi compartilhado com a Casa Von der Harten conforme indicado.
- O catálogo final possui **19 vínculos** de temas do reino/regiões/casas e **3 no Cancioneiro**, ou **22 vínculos / 21 IDs distintos** (Volkumburgh e Von der Harten compartilham um ID). Há cinco títulos sem vídeo e duas letras ainda sem vídeo cadastrado.
- Os IDs foram validados estruturalmente; reprodução e permissão de incorporação permanecem sujeitas ao YouTube, não certificadas por esta auditoria.


## Unificação — Músicas Populares (06/11/2026)

O Narrador unificou as antigas categorias **Cancioneiro** e **Novidades da playlist** em **Músicas Populares**, para reunir as canções de bardos em um único filtro e um único painel. A categoria interna é `populares`; a interface exibe o rótulo **Músicas Populares**. Os temas oficiais do reino, das regiões e das casas permanecem classificados separadamente.

- São 10 registros de Músicas Populares, sendo 8 com vídeos do YouTube, 1 com vídeo ainda não vinculado e 1 com somente letra. Os identificadores, títulos, letras, regiões e URLs continuam preservados.
- O agrupamento antigo `cancioneiro` ou `playlist`, quando encontrado em dados legados, também é tratado como `populares` na apresentação, evitando dois filtros separados.
- O seletor de grupos mostra apenas **Músicas Populares**, sem subdividir canções por região; cada música mantém o metadado de região. A playlist do YouTube continua como opção de reprodução independente.
- O catálogo público como um todo possui 27 vínculos de vídeo (26 IDs distintos) e quatro títulos pendentes, contando também as categorias de músicas das casas; a lista de letras é conservada.

Validação: `node --test scripts/youtube-music.test.mjs`, os testes de `src/test/frontend-audit-public.test.ts` e o fluxo CI habitual. Os parágrafos anteriores deste documento são registros históricos de auditorias anteriores a essa unificação.
