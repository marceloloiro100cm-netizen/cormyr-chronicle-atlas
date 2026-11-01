# Lote 35 — revogação também nas leituras temporais privadas

**Base:** PR #160 (Lote 34). **Data:** 31/10/2026.

## Entrega
O Conselho do Narrador observa o resultado das consultas administrativas
do Hub Temporal. Um erro explícito de revogação (incluindo `42501`) ao
consultar genealogias, prévias de idade, histórico, rascunhos ou entregas
temporais dispara o mesmo bloqueio global já implementado para gravações.
O cache reservado é eliminado; a próxima verificação do escopo só pode
liberar a interface após uma leitura nova e autorizada.

O observador só atua quando o escopo declara cargo administrativo; uma
consulta pública falhando, um timeout simples ou uma consulta de jogador
não implicam revogação do Narrador. A lista de chaves administrativas é
explícita e testada; novas consultas privilegiadas devem ser adicionadas
ao contrato e aos testes.

## Aceitação
- Revogação por RPC privado purga caches de fichas e missivas.
- Erros de rede não simulam perda de cargo.
- Falha do calendário público não bloqueia automaticamente o Narrador.
- A desmontagem remove a assinatura do cache.
- A rota conserva a autorização do servidor como fonte da verdade.

## Restrições
Sem merge, deploy, escrita no Supabase real, publicação de data ou alteração
de missivas/jogadores. A aplicação em produção segue **NO_GO** por 27
migrações SQL não conciliadas, duplicidade de prefixo `0041` e falta de
restauração homologada de backup real autorizado.
