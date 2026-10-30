# Conciliação das seis fichas anexadas — 29/10/2026

## Resultado e alcance

As seis planilhas foram lidas integralmente (valores armazenados, fórmulas e abas). Os originais não foram alterados. A base do repositório foi comparada à aba Casa; bônus iniciais e eventos históricos entram uma única vez no total. O motor continua calculando disponível = total − alocado − comprometido.

Os números abaixo são os saldos esperados dos estados reconciliados, não confirmação de aplicação no banco de produção.

| Casa | Defesa | Influência | Terras | Lei | População | Poder | Riqueza |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| ashkar | 0 | 30 | 1 | 30 | 5 | 0 | 1 |
| grantass | 4 | 9 | 0 | 2 | 15 | 1 | 4 |
| silversky | 11 | 33 | 7 | 27 | 40 | 1 | 37 |
| everlost | 0 | 0 | 0 | 40 | 29 | 0 | 0 |
| erdenor | 9 | 1 | 2 | 30 | 44 | 16 | 16 |
| fewmerry | 1 | 13 | 0 | 22 | 38 | 0 | 5 |

## Correções confirmadas

- Grantass, Erdenor e Fewmerry: incorporar os bônus iniciais omitidos na importação 0041.
- Silversky: substituir os atributos codificados pelos totais da ficha recebida.
- Erdenor: segunda estrada custa 5 (Casa!E28), não 4. A soma de todas as posses de Terras é 38; com total 40, restam 2. Casa!E30 mostra 3 porque omite o Pasto de Casa!E29.
- Ashkar e Everlost: preservar os totais e custos contabilizados na aba Casa.
- Lei: −2 em Ashkar/Fewmerry e −10 em Grantass aparecem no resumo Sorte da Casa e coincidem com os modificadores da regra de Sorte. Não são deduções permanentes do recurso.
- População: preservar os totais exibidos nas fichas (5 em Ashkar e 38 em Fewmerry), mas registrar pendência: a linha rotulada Sorte da Casa foi somada pelas fórmulas da própria fonte. É necessário distinguir ajuste histórico de modificador de teste antes de modificar esses saldos.

## Custos e fontes que exigem cuidado

Custos históricos não foram substituídos pelos preços do catálogo. Exemplos: infantaria treinada de Fewmerry custa 5 na ficha e apoio treinado custa 7; a cotação atual é respectivamente 7 e 5. O Hall de Everlost custa 10 na fonte; a mina de Silversky usa Terras, conforme o campo original.

A aba Exercito de Ashkar, Grantass e Fewmerry contém tropas identificadas como Erdenor. As de Everlost e Silversky possuem linhas de modelo com atributos zerados. Tipos, treinamentos e custos das unidades foram conferidos pela aba Casa; não copiar tropas entre casas nem transformar linhas vazias em unidades. Atributos detalhados, nomes e distribuição em domínios já existentes foram mantidos, com pendência explícita quando não confirmados. As abas NPCs da Casa estão sem membros preenchidos; não gerar integrantes da Corte.

O cadastro contém 80 posses e 23 unidades nas seis casas. Desdobramentos já existentes (por exemplo, estalagem e crescimento) mantêm o custo combinado da ficha.

## Migração protegida

0042 usa nomes exatos normalizados, IDs textuais e bloqueio transacional. Importa somente fichas ausentes ou estados integralmente iguais aos snapshots legados 0036/0041. Estados editados recebem status needs_review; nomes ambíguos não são escolhidos. Cada alteração incrementa a versão, guarda antes/depois completos no ledger e usa chave idempotente. Uma repetição não desfaz compras posteriores.

O ator UUID zero representa a migração de sistema, não um usuário. O relatório de execução fica em noble_house_workbook_imports, visível somente ao narrador/admin e ao serviço. Nenhuma permissão de jogador foi alterada.

Os antigos scripts 0036/0041 foram desativados para instalações que ainda não os executaram: convertiam IDs textuais para UUID, omitiam updated_by obrigatório, usavam colunas inexistentes before/after no ledger e substituíam fichas sem conciliação. Os snapshots originais permanecem em 0042 para comparação exata; bancos já migrados são tratados pela nova migração. Não reexecutar os antigos importadores.

Depois de aplicar 0042 em produção, verificar:
```sql
SELECT house_key, house_id, status, detail
FROM public.noble_house_workbook_imports
WHERE batch = 'workbooks-2026-10-29'
ORDER BY house_key;
```

missing: casa ainda não cadastrada. ambiguous: resolver identidade. needs_review: conciliar a ficha editada e preservar compras. applied: importação concluída. O merge no GitHub, por si só, não comprova execução SQL ou publicação do site.

## Fontes verificáveis

As células extraídas e seus valores/fórmulas estão em src/test/fixtures/house-workbooks-2026-10-29.json, usadas pelos testes de regressão.

| Arquivo | Total dos atributos | SHA-256 |
| --- | --- | --- |
| Casa Ashkar.xlsx | Casa!B19:H19 | 1e78eb1f7133115398e70df812bc5da3cf6543738622a778e9faf92846f2a7f6 |
| Casa Grantass.xlsx | Casa!B18:H18 | c00bffcb4f17aee3a23c0ab35220f0b0f6980a2afdb55ebee8c5b46bebed6a82 |
| Casa Silversky.xlsx | Casa!B13:H13 | 2e344f17a0e54afbbaa655b9fdc2e1035b7d242d0f90254563f9a53d86619250 |
| Casa Everlost.xlsx | Casa!B14:H14 | fe4e22257d026d60f561ad517b17a2837631916b32a2a1dba1f43f4802801bd2 |
| Casa Erdenor.xlsx | Casa!B14:H14 | 395232cf179dcc18a365407ddc695177b625421575472ba2f06f46aaf5b24eff |
| Casa Fewmerry.xlsx | Casa!B14:H14 | 1cd5f91fae9fd4bad0c9fe3db56a519c755ac617bf991742aed901b8ece269d9 |

## Verificação automatizada

Testes conferem as somas das linhas de origem, saldos das seis casas, Pasto omitido de Erdenor, custos históricos e distinção entre Lei e Sorte. PostgreSQL testa IDs textuais, snapshots 0036/0041, preservação de ficha editada, nomes ambíguos, auditoria, repetição após compras e privacidade. O teste da galeria verifica que as regras CSS podem ser lidas no nível correto e preservam a imagem completa.
