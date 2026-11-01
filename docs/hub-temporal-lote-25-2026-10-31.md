# Hub Temporal de Cormyr — Lote 25: cronologia histórica e retificações

**Data:** 31/10/2026  
**Base:** PR #150 (Lote 24)  
**Escopo:** visualização do calendário e histórico de missivas e eventos, com ensaios em PostgreSQL descartável. Não houve acesso à produção.

## Resultado da auditoria

Os módulos já distinguem a **data oficial atual** das **datas históricas das missivas**, da abertura das rodadas e da publicação de eventos. O Narrador pode retificar o relógio, mas isso não altera a data que uma carta já possuía nem a data original da rodada.

Foram identificadas duas lacunas relevantes:

1. React Query pode conservar dados após uma falha na atualização. A tela do calendário e a cronologia podiam continuar exibindo dados privados ou uma data oficial antiga, apesar de erro do RPC. Isso é especialmente arriscado quando uma sessão perde a autorização para ler correspondência.
2. A validação da cronologia conferia a data de eventos, mas não exigia que a referência histórica de cada rodada fosse do **mesmo mês e ano** da cronologia consultada, nem rejeitava número de rodada repetido.

## Correções da interface

Em `src/components/calendar/calendar.tsx`, o presente não é mostrado a partir de cache quando o RPC de calendário está em erro. A página informa indisponibilidade, sem inventar uma data ou usar o calendário do dispositivo.

Quando `calendar_mail_events` ou `get_campaign_schedule_events` falham, o calendário deixa de renderizar os valores previamente cacheados dessas consultas. Permanecem somente as observâncias públicas anuais. O jogador vê a mensagem de erro e pode solicitar recarga.

Em `src/components/calendar/chronology.tsx`, se a consulta de cronologia está em erro, nem os eventos nem as rodadas cacheadas são renderizados. A interface mostra um aviso e a opção de recarregar. O erro não transforma uma carta antiga em uma data nova.

## Contrato de referência histórica

Em `src/lib/calendar/chronology.ts`, a nova verificação `roundReferenceBelongsToMonth` exige que a referência Harptos seja válida e pertença ao ano e mês requisitados. Abrange as três désdias e festivais intercalares, incluindo Shieldmeet somente em ano bissexto.

A validação recusa rodadas sem período quando vierem indevidamente na coleção de rodadas atribuídas (elas devem estar na contagem de rodadas sem referência), números duplicados e referências de outros períodos. Nenhuma data antiga é preenchida usando o presente.

## Ensaios automatizados

O script `scripts/test-temporal-historical-consistency.sql` cria um Narrador, uma Casa remetente e dois jogadores de Casas distintas na fixture descartável do CI, tudo sob **BEGIN/ROLLBACK**.

| Passagem | Comportamento esperado |
| --- | --- |
| 1522, Midwinter | Rodada registra o festival original e carta restrita recebe data histórica |
| Entrega da carta | Aparece apenas depois da entrega e no mês de Hammer |
| Evento em Tarsakh | Rascunho fica invisível até publicação pelo Narrador |
| Avanço até 1523 | Missiva, referência de rodada e evento continuam em 1522 |
| Retrocesso para Midwinter de 1522 | Relógio oficial muda, mas não redatada ou republicada a correspondência |
| Retorno a 1523 | Não duplica a carta nem reexecuta efeitos econômicos/militares |
| Consulta de Casa A | Destinatário autorizado continua vendo a carta histórica |
| Consulta de Casa B | Carta privada não aparece; evento público continua visível |

Os testes `src/test/calendar-ui.test.tsx` cobrem falhas do RPC após os resultados estarem em cache, para garantir que o calendário não mostre uma data oficial sem verificação nem correspondência cujo acesso falhou. O teste `src/test/mail-chronology-contract.test.ts` cobre festivais, mês/ano divergente, rodadas não atribuídas e duplicatas.

O workflow passa a executar o novo cenário SQL depois do teste de permissões do Lote 24. O manifesto da cadeia inclui a PR #150 como predecessora.

## Limites e pendências

A ocultação de dados após um erro é uma proteção conservadora de tela; não substitui o isolamento da cache na troca de usuário, políticas RLS e testes de autenticação. A migração da campanha real continua impedida pela conciliação pendente das **27 migrações SQL sem entrada no diário Drizzle**, prefixo histórico **0041 duplicado** e falta de backup real restaurado em homologação autorizada.

**Estado: NO_GO para produção.** Nenhuma PR foi mesclada; não houve migração, publicação de data nem modificação de missivas reais.
