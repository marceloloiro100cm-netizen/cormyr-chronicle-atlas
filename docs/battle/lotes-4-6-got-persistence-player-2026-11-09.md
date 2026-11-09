# Cormyr — Lotes 4, 5 e 6 · 9 de novembro de 2026

## L4 · Game of Thrones guiado
- Componente `BattleGotGuide`: seis fases, destaque da fase atual, instruções ligadas ao livro, atalhos para preparação (tropas, condições, mapa) e comando.
- Botão de configuração rápida reversível pelo editor: remove cerco, heróis e parâmetros avançados, mas não emite ordem nem altera fichas oficiais.
- Condução real de fases continua nas regras já implementadas; não indica equivalência integral ao livro nem gera dados NPC não verificados.

## L5 · Salvamento e desempenho
- Até oito cópias nomeadas de GOT por perfil e navegador, com versão, rodada, rótulo e validação na retomada; área de salvamento antigo mantida para compatibilidade.
- Index de arquivos isolado por escopo de Narrador/jogador, sem envio de dados ao servidor.
- Renderização do editor de mapa GOT substitui a pesquisa linear repetida de terreno por lookup memoizado.
- D&D conserva persistência privada autenticada e Adaptado conserva replays verificados; biblioteca universal sincronizada fica para trabalho posterior.

## L6 · Preparação dos jogadores (PR #338 incorporada e reconciliada)
- Seletor no `BattleV3PlayerEntry`: GOT, Adaptado, D&D. Usa somente exércitos-modelo e cinco arquétipos fictícios de D&D.
- GOT jogador não importa tropas oficiais; salva com chave e arquivo separado. D&D jogador não monta a biblioteca privada nem controles do Narrador, e bloqueia funções administrativas e persistência privada.
- `BATTLE_PLAYERS_ENABLED=false` preservada. Não habilitar menu ou realizar deploy até validação real de identidade, autorizações, RLS e experiência em celular.

## Validação e rollback
- Executar CI TypeScript, build, Vitest, browser sintético e bancos isolados.
- Homologação autenticada como Narrador/jogador e regressão de sessão e isolamento continuam necessárias.
- PR empilhada sobre os lotes 1–3, não publicar diretamente na main.
