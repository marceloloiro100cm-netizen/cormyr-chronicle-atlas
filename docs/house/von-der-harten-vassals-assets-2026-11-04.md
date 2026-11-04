# Auditoria e importação — Casa Von der Harten
Data: 04/11/2026 (campanha 1522 CV)
Casa operacional: `von-der-harten` (Terras da Coroa / Crownlands).

## Fontes oficiais
- Documento da Casa Von der Harten: https://docs.google.com/document/d/1vwKl680k8FfbeNpyezAXb1AD4epbvK_bIPomXxixlX4/edit
- Planilha de recursos e personagem: https://docs.google.com/spreadsheets/d/1MxHzGr0WiZiKypgFqXUeQ614vxaUtiM6/edit
- Atributos das Casas Nobres, importados previamente para o módulo de espionagem: `public.spy_noble_house_stats` (fonte Google Sheets `1Yts9r_X4yc1PsXcz1ah0HqmFvQme0CRCDoFhIgPMTmA`).

## Vassalagens importadas, sem cobrança duplicada
Ambas registradas como `approved` em `noble_house_sheets.state.vassals`.
São vínculos históricos da mesma Casa, com `vassal.id` igual ao ID
da posse `vassal-1/2` já existente; assim o rompimento usa exatamente
a mesma posse, sem gerar novo investimento.

| Vassala | ID | Custo Poder histórico | D | I | T | L | P | Pd | R | Base |
|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| Wyvernspur | `wyvernspur` | 20 |45|34|29|45|29|34|34|250|
| Immerdusk | `immerdusk` | 10 |43|26|30|51|22|43|35|250|

As mini-fichas têm exatamente os sete atributos já armazenados em `spy_noble_house_stats`.
Não foram inventadas tropas, posses, datas de aprovação ou rolagens das vassalas.
Nenhuma penalidade de Influência nova foi presumida (ambas 0).
Duas vassalas aprovadas dão **dois dados adicionais de teste** em Sorte da Casa
pela regra existente em `fortune.ts`, sem transferir atributos à Casa superior.

### Validação de imagens
Os arquivos já estavam presentes no repositório, com cabeçalho WebP válido e
arte visualmente correspondente à Casa indicada:
- `/cormyr/assets/crownlands-wyvernspur.webp` — cauda de escorpião sob o sol,
  cores rubras e douradas, título WYVERNSPUR.
- `/cormyr/assets/crownlands-immerdusk.webp` — guerreiro com escudo em fundo
  azul, título IMMERDUSK.

`house_catalog.archive_data.crest` utiliza o caminho relativo `assets/...`;
`vassalCrestUrl` normaliza esses caminhos, sem copiar ou substituir os arquivos.
Pontos ainda pendentes nas fontes: catálogo indica Thomas Immerdusk, mas narrativa
cita Bron Immerdusk. Não alterar o titular silenciosamente.

## Exército e contraespionagem
- Unidade `Guarnição Verde de Lex Castle`, tipo `garrison`,
  treinamento `green`, 100 soldados, custos 2 Poder (tipo) + 1 Poder
  (treino), **3 Poder** totais. Domínio da fortificação; 20 XP iniciais livres;
  6 Saúde; Armadura 3; penalidade 2; disciplina 6 em casa, 12 fora dela.
- O Castelo Pequeno confere **+6 de Defesa da unidade** defendendo a fortificação,
  não +6 no atributo geral Defesa da Casa.
- `pros-secret-police` já era posse ativa, custo **3 Poder + 10 Riqueza**.
  Lei da Casa: 62. Dificuldade básica de espionagem = 6 + 3 × piso((62−30)/5)
  = **24**. A Polícia Secreta adiciona +6: dificuldade **30**, antes de
  outros modificadores específicos. O SQL de prévia e
  `calculateSpyDefense` já reconhecem essa posse.
- A Polícia Secreta também concede Contatos nos próprios domínios e reduz
  em 1 **apenas penalidades negativas** de População à Sorte da Casa.
  `fortune.ts` foi corrigido para aplicar essa redução ao cálculo de Sorte,
  cumulativamente com Esgotos, quando existir.
- Essa posse NÃO é uma segunda unidade militar e NÃO concede um espião extra.

## Posse e catálogo
As 18 posses foram revisadas dentro de `noble_house_sheets.state.holdings`,
com nomes contextuais e descrições completas em português.
Custos, IDs, status, investimento e efeitos numéricos confirmados foram
preservados. Duas exceções de natureza estritamente representacional:
- Escola: o texto histórico «SF +1» foi convertido no efeito mecânico
  `{kind:'fortune',amount:1}` para computar o bônus que a posse já concedia.
- Biblioteca Grande: custo histórico (5 Riqueza) preservado, sem imputar os
  2 pontos de Defesa exigidos pelo catálogo moderno; o desconto de 2 Riqueza
  no Erudito está registrado no investimento histórico.

`HouseAssetCatalog` foi corrigido para apresentar **nomes, efeitos e custos
reais das posses adquiridas**, recorrendo ao catálogo genérico somente
para investimentos ainda não adquiridos ou sem descrição própria.
Descrições agora evitam `SF`, `Knowledge`, `Scholar` e `Settlement`
sem explicação. Ações e referências não podem fabricar novos ganhos.

### Reconciliação
| Recurso | Base | Alocado | Disponível |
|---|---:|---:|---:|
| Defesa |38|30|8|
| Influência |30|30|0|
| Terras |20|20|0|
| Lei |62|0|62|
| População |29|0|29|
| Poder |36|36|0|
| Riqueza |58|58|0|

O custo total de Poder é 20 (Wyvernspur) + 10 (Immerdusk)
+ 3 (Polícia Secreta) + 3 (Guarnição Verde) = **36**, sem duplicação.

## Cuidados de implantação
- Não recriar as Casas nem substituir brasões existentes.
- Os dados de vassalagem e guarnição foram importados no banco de produção.
- Os testes de regressão foram adicionados em
  `src/test/von-der-harten-military-and-vassals.test.ts`
  e a apresentação ajustada em `src/test/house-standard-asset-cards.test.tsx`.
- Execução automatizada e efetiva atualização do site público dependem
  de validação de compilação/deploy; não presumir só pelo commit.
