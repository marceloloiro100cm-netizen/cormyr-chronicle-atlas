# Hub Temporal de Cormyr — Lote 7: Motor Anual de Idades

**Data:** 31/10/2026 · **Base:** Lote 6, PR #132. **Implantação real:** nenhuma escrita em produção.

## Resultado

O envelhecimento deixa de ser uma alteração manual em cada ficha. A idade corrente elegível é **calculada deterministicamente** a partir do ano de campaign_calendar e do nascimento ou idade-base de campaign_characters. Em 1523, Percival Evenhand (nascido em 1492 CV) tem **31 anos** onde existir uma fonte canônica vinculada e autorizada. Datas originais e textos históricos não são regravados.

### Regras de idade

- Com nascimento confirmado: idade = ano consultado - birth_year.
- Sem nascimento, com idade-base e ano de referência revistos: idade = baseline_age + ano consultado - baseline_year.
- A regra de campanha incrementa na **virada do ano CV**, não no aniversário individual.
- Antes de nascer, retorna estado not_born sem idade; no ano de nascimento, zero.
- Falecidos com ano de morte documentado deixam de envelhecer e preservam idade na morte. Uma consulta a ano anterior à morte consulta idade histórica naquele ano.
- Se vida, fontes, revisão ou referência forem inconclusivas, não se inventa número.
- Contradição entre nascimento e baseline: estado conflict; nenhuma correção automática.
- Política manual_exception: exceção aprovada e justificada, mas sem mecânica inventada pelo motor. Idade fica sinalizada para revisão individual.
- Fontes múltiplas convergem para um único ID. A projeção não soma +1 num banco; repetir a mesma operação, saltar anos ou retroceder nunca duplica idade.

## Migração 0063_annual_character_ages.sql

- character_age_state: cálculo interno com estados de verificação; execução revogada para anônimos e participantes.
- get_character_age_dashboard: prévia privada do Narrador com totais completos (afetados, falecidos, conflitos, ausentes, não nascidos) e registros limitados a até 2.000 linhas para listagem e exportação.
- get_house_character_ages: projeção estrita por vínculo canônico com ficha de personagem; somente ficha e Casa autorizadas (ou administrador), nunca outro personagem sem fonte, nem segredo do Narrador.
- character_year_transitions: tabela de auditoria de fronteiras anuais, com versão e autor. Trigger na atualização do ano em campaign_calendar registra cada limite atravessado na transação da publicação. Repetir um comando idempotente não cria novos eventos.
- get_character_year_transitions: histórico anual exclusivo do Narrador.

Todas as novas estruturas preservam RLS. O RPC anônimo /api/public/time continua expondo somente a data, sem idades privadas.

## Hub Temporal e fichas

A seção **Nobres e idades** apresenta ano corrente e ano de destino, número de nobres vivos/falecidos, quantidade que envelhecerá, conflitos, pendências e não nascidos; exibe lista com origem, destino e situação, permite exportação CSV e consulta do histórico anual.

Quando o comando temporal propõe uma virada de ano, a prévia privada das idades torna-se obrigatória antes da confirmação pelo Narrador. Pendências isoladas não impedem o calendário de avançar; o personagem permanece sem idade atribuída até regularização.

Na **Ficha do Personagem** de uma Casa, fichas Chronicle, legadas e Corte podem mostrar a idade canônica somente quando o record de origem foi vinculado explicitamente à pessoa pelo Narrador e a Casa tem acesso. O texto histórico original da ficha legada permanece intacto. Chronicle v1 recebe nascimento declarado opcional (birthYear e birthDate), sujeito a revisão e sem alterar habilidades.

Uma atualização oficial de data invalida caches de idade por Casa, painel e auditoria; as consultas refazem o cálculo com o ano vigente.

## Testes

A suíte de CI inclui scripts/test-annual-character-ages.sql e src/test/character-annual-ages.test.ts, além das regressões Chronicle e Calendário. Casos incluem Percival 30→31, Planchar congelado aos 74 após morrer em 1521, nascimento em 1524, identidade contraditória, fonte não confirmada, idade-base, salto de múltiplos anos, repetição idempotente, retrocesso, RLS e isolamento entre Casas. Testes utilizam PostgreSQL descartável; nada é aplicado em produção.

## Condições de implantação

1. Integrar lotes anteriores na sequência, incluindo #132, e reconciliar as migrações Drizzle de produção.
2. Criar backup e testar 0063 em homologação; coordenar frontend com backend.
3. Revisar e vincular os nobres canônicos com o Narrador antes de considerar cobertura de idades completa.
4. Verificar em ambiente controlado uma virada anual, retorno ao ano anterior, idade de falecido, fonte compartilhada e segredo não autorizado.

**Escopo deliberado:** o Atlas público permanece com a data oficial e NÃO recebe idades ou detalhes de NPCs privados. Biografias públicas requerem aprovação explícita por identidade antes de publicar idades; manuscritos e anos históricos não se modificam.

**Situação:** código e testes versionados no PR; nenhuma operação temporal executada no banco real.

**Próxima etapa:** Lote 8, integração das missivas e cronologia de eventos ao Hub Temporal, preservando seus históricos.
