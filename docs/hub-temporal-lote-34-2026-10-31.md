# Lote 34 — bloqueio global da área administrativa após revogação

**Base:** PR #159 (Lote 33). **Data:** 31/10/2026.

## Problema corrigido

O Lote 33 limpava os caches privados e ocultava apenas o painel que recebeu
o erro de autorização. O componente pai do Conselho dos Jogadores ainda podia
estar montado com `data.admin=true` até a próxima consulta periódica de
vínculos. Navegar a outra aba poderia exibir dados anteriores.

## Mudanças

- Introduz uma marca de revogação no React Query, separada de dados privados.
- Ao detectar revogação num RPC do calendário ou de entregas, remove
  imediatamente as consultas privadas, grava a marca e cancela uma leitura
  anterior de escopo antes de exigir uma consulta nova.
- A rota `jogadores` bloqueia **toda** a interface do Conselho — incluindo
  outras abas administrativas — enquanto houver uma marca de revogação.
- Somente resultado **novo**, sem erro, sem consulta em andamento, posterior
  à marca, permite retirar o bloqueio. A verificação não concede o cargo;
  RLS e RPCs PostgreSQL permanecem a autoridade.
- Testes de bloqueio, cache, tempo do snapshot e localização do guarda de UI.
  Um botão permite solicitar nova consulta quando houver erro de rede.

## Limites

- O bloqueio se aplica quando o cliente recebe revogação explícita; alterações
  silenciosas seguem a checagem periódica existente (15 s) e os eventos do banco.
- Nenhum dado real da campanha, ficha, data ou missiva foi modificado.
- **Sem merge, deploy, migração ou acesso ao Supabase de produção.**
- Permanecem pendentes a conciliação dos 27 SQL fora do journal, ordinal 0041
  duplicado e homologação de restauração de backup real autorizado.

**Decisão: NO_GO para produção.**
