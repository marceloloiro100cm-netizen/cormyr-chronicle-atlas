# Espionagem — adendo de decisão do Narrador (02/11/2026)

Este adendo atualiza **exclusivamente** o comportamento de capacidade e contratação do Lote 0; não modifica retroativamente o texto do suplemento `source-audit.json`, que permanece fiel à fonte parcialmente recuperada.

| Parâmetro | Decisão do Narrador | Tipo de origem |
|---|---|---|
| Rede de Espiões ativa | **1 agente inicial** por posse principal ativa | Regra de campanha aprovada pelo Narrador |
| Rede Ampliada ativa | **+2 agentes** por compra, repetível | Catálogo original já confirmado |
| Contratação avulsa | **5 Riqueza = 2 agentes**, repetível, não exige Rede | Regra de campanha aprovada pelo Narrador |
| Contabilidade da avulsa | **alocação** de 5 Riqueza por lote (analogia expressa à Rede Ampliada) | Interpretação operacional da decisão, sujeita a confirmação se desejar custo permanente |
| Validade/manutenção | **Não informadas** | Sem expiração ou cobrança automática |
| Falta de saldo | Compra bloqueada quando Riqueza disponível menos alocações avulsas existentes for inferior a 5 | Derivado do motor de recursos da Casa |

## Consequências técnicas
1. Células da Rede base só surgem após a posse estar **ativa**, seu domínio ser identificado e a reconciliação utilizar ID imutável. Comprar uma construção não gera agente imediatamente.
2. Compras avulsas são lotes de duas vagas. **Não há agente gratuito pelo simples clique na cotação**: é obrigatório lançamento idempotente no ledger transacional do Lote 10, criação dos dois ativos e reserva de 5 Riqueza no mesmo commit.
3. Uma compra adicional somente é permitida se houver saldo depois das outras alocações avulsas ativas. Nenhuma função de prévia debita saldo nem altera a ficha.
4. Casos de cancelamento, devolução de Riqueza, duração ou manutenção de contratados não receberam regras adicionais; dependem de adjudicação do Narrador e de versão própria.
5. As demais lacunas documentais de Lei, dificuldade, contramedidas cumulativas, confidencialidade, rotas reais e comunicação antecipada permanecem **pendentes**.

## Status
**Regras de capacidade aprovadas, código de prévia atualizado**. Nenhuma compra real, migração ou permissão de divulgação é publicada por este adendo.
