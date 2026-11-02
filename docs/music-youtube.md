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
