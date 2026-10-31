# Hub Temporal de Cormyr — Lote 2: Motor de Harptos e Désdias

**Data:** 31/10/2026  
**Implementação:** biblioteca pura, sem alterações de banco nem conexão com o relógio publicado.  
**Origem:** Plano Diretor v2 e auditoria do Lote 1 (PR #126).

## Objetivo e escopo

Disponibilizar o motor temporal reutilizável por todos os módulos:

- **Désdia oficial:** avanço de dez **dias ordinários** de Harptos, inclusive de datas intermediárias (17 Ches → 27 Ches).
- **Festivais intercalares:** existem na cronologia, são listados na prévia, mas não consomem nenhum dos dez dias ordinários.
- **Partida num festival:** usar como referência o último dia ordinário do mês que antecede o intercalar; Midwinter → 10 Alturiak depois de uma désdia.
- **Anos:** 365 dias corridos no ano comum, 366 no ano com Shieldmeet (divisível por quatro, conforme regras do código existente); 360 dias ordinários em todo ano.
- **Estações:** Hammer, Alturiak, Nightal = inverno; Ches–Mirtul = primavera; Kythorn–Eleasis = verão; Eleint–Uktar = outono. O festival retém a estação de seu mês.
- **História:** intervalos retrospectivos são calculáveis sem modificar o calendário oficial.
- **Limites:** de 0001 a 9999 CV, com rejeição explícita de datas fora do limite.

O motor não define rodadas de missivas nem aplica bônus, impostos, Sorte, idades, obras, batalhas ou mutações. Esses efeitos devem consumir o tempo publicado nos lotes posteriores.

## Arquivos

- **src/lib/calendar/temporal-engine.ts** — motor sem banco de dados, relógio real ou navegação.
- **src/test/harptos-temporal-engine.test.ts** — testes cobrindo data, ordinal, festivais, dez dias, estações, anos, múltiplas désdias e retrocesso.

A implementação reutiliza o catálogo de meses, festivais e parser de **src/lib/calendar/harptos.ts**, sem duplicá-lo.

## Contratos de integração

| Função | Objetivo |
|---|---|
| daysInHarptosYear | Ano comum e Shieldmeet |
| getHarptosOrdinal | Ordinal de **todos** os dias de Harptos, incluindo festivais |
| fromHarptosOrdinal | Recuperar a data exata pelo ordinal |
| getHarptosDesdia | Identificar 1ª, 2ª, 3ª désdia ou festival |
| getHarptosSeason | Estação correspondente à data |
| advanceHarptosDesdia | Somar 10 dias ordinários por désdia |
| listCrossedHarptosPeriods | Identificar meses, anos, estações e festivais atravessados |
| previewHarptosDesdia | Prévia pura para o Narrador, sem salvar nada |

O contrato de intervalos retorna data inicial e final, direção, dias ordinários decorridos, dias cronológicos decorridos, meses, anos, mudanças de estação e festivais. A data inicial é excluída e a final incluída na lista de eventos cruzados. Para retrocesso, os resultados acompanham a direção consultada.

**Não confundir:** o ordinal representa os dias cronológicos **com festivais**. O avanço de désdia conta apenas os dias **ordinários**.

## Exemplos

| Origem | Désdias | Destino | Festivais |
|---|---:|---|---|
| 17 Ches 1522 | 1 | 27 Ches 1522 | — |
| 21 Hammer 1522 | 1 | 1 Alturiak 1522 | Midwinter |
| Midwinter 1522 | 1 | 10 Alturiak 1522 | Festival de origem não reprocessado |
| 21 Flamerule 1522 | 1 | 1 Eleasis 1522 | Midsummer |
| 21 Flamerule 1524 | 1 | 1 Eleasis 1524 | Midsummer e Shieldmeet |
| 21 Nightal 1522 | 1 | 1 Hammer 1523 | Ano 1523 |
| 21 Alturiak 1522 | 1 | 1 Ches 1522 | Mudança inverno → primavera |

## Segurança e validação

1. A biblioteca é **pura** e repetível. Não consulta nem grava dados em produção.
2. Não altera o site ativo nem os gatilhos de abertura de missivas; migrações SQL só após conciliação.
3. Não introduz RPC, tabela, política de leitura, RLS ou publicação Realtime neste lote.
4. Não modifica textos históricos, ficha de personagem, idade ou vínculo entre jogador e Casa.
5. A nova suíte testa todos os 360 dias ordinários e festivais dos anos 1522 e 1524, datas intermediárias, viradas e anos limites.
6. Executar no CI da branch: testes Vitest, build, checagem de scripts e tipagem conforme workflow vigente.

## Pendências explicitamente reservadas aos próximos lotes

- Lote 3: leitura central da data oficial em todas as superfícies que mostram o presente.
- Lote 4: publicação versionada, prévia e idempotência no backend.
- Lote 5: componente do Hub do Narrador e atualização dos jogadores.
- Lotes 6–7: registro unificado dos nobres e envelhecimento anual.
- Lote 8: missivas, gatilhos antigos e eventos privados; correção do filtro mensal de festivais.
- Lotes 9–10: construções, exércitos, Sorte, economia e registro extensível de consumidores.

**Aviso:** o gatilho legado de abertura de missivas ainda pode alterar a data oficial em produção até ser substituído. O motor do Lote 2 não foi acoplado a esse gatilho, de modo que não há mudança de comportamento do relógio ativo por causa desta entrega.
