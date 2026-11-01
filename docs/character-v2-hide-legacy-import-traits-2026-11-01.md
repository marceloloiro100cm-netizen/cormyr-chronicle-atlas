# Correção da Ficha V2 — ocultação do legado e importação de Qualidades/Defeitos

**Data:** 01/11/2026

## Diagnóstico verificado

A aba de personagens renderizava o componente `ChronicleCharacterEditor` sem `row` para todo perfil com permissão de edição, criando automaticamente o bloco vazio **“Novo personagem de Erdenor”** e atributos básicos de valor 2. Esse bloco não representa o personagem Aldaeric.

O importador das planilhas antigas reconhecia graduações, mas ignorava o quadro tabular com colunas **Qualidades** e **Defeitos** (colunas 0 e 2) e a seção da ficha nova mostrava apenas `qualities/flaws` preenchidos no formato Chronicle V1, que não existem nos documentos GOT legados.

A análise por consulta somente leitura das seis fichas legadas indicou:

| Casa | Qualidades | Defeitos | Observação |
|---|---:|---:|---|
| Ashkar | 3 | 0 | Furioso, Esquadrão de Elite, Herança |
| Erdenor | 2 | 1 | Patrono, Carismático, Mudo |
| Fewmerry | 3 | 1 | Abastado, Cortês, Magnético, Inimigo |
| Goldfin | 6 | 3 | Inclui Defeito (Pontaria) e Medo (Prata) |
| Grantass | 6 | 8 | Inclui efeitos parametrizados e Assombrada |
| Silversky | 3 | 1 | Inclui Medo (Ameaça Obscura) |

Total: **23 qualidades e 14 defeitos importáveis como texto da fonte**, não uma certificação de 37 efeitos automáticos.

## Mudanças implementadas

- O bloco em branco **Novo personagem** não fica exposto na aba principal. A ferramenta de criação anterior permanece recolhida e disponível apenas ao Narrador.
- A ficha V2 em bolinhas permanece visível conforme a permissão atual da Casa. As informações da antiga ficha, inclusive a visualização anterior, permanecem ocultas para jogadores. O Narrador pode consultar a fonte em ferramenta administrativa recolhida.
- O formulário legado `FichaPersonagemForm` foi **removido desta tela**, pois o serializador antigo perderia as linhas adicionais da planilha, incluindo Qualidades e Defeitos; as fontes originais no banco não são apagadas.
- `legacy-traits.ts` interpreta as colunas do quadro GOT, identifica cada característica individualmente e preserva a escrita original e parâmetros em `params.original/detail/skillId`.
- Correspondência com as 150 entradas do catálogo, incluindo famílias de texto com parâmetros e defeitos por habilidade. Correspondências não resolvidas são exibidas como pendentes, não descartadas.
- `read-adapter.ts` grava as características **somente na prévia em memória**, com status `imported_unverified`. Isso integra as fichas novas sem alterar o banco, comprar atributos ou homologar efeitos automaticamente.
- `player-sheet.tsx` renderiza cartões separados de Qualidades e Defeitos, com nome original, categoria, grau quando aplicável e estado de validação. Efeitos `verified` só ficam habilitados depois de aprovação da seleção e da ficha, o que **não ocorre** nesta importação.

## Critérios e segurança

- Preservar todas as fontes anteriores integralmente (conteúdo, versão, autoria, XP e Destino).
- Não presumir bônus narrativos de Patrono, Herança, Esquadrão de Elite, Inimigo ou Medo; revisar cena, livro e pré-requisitos.
- Dados ambíguos (por exemplo, **1 Atletismo (Sedentária)** e **Frágil (Atletismo, Luta e Pontaria)**) permanecem anotados e sem penalidade automática.
- Correção visual, não migração formal da V2: a edição V2 e a liquidação de XP ainda dependem da conciliação canônica e da RPC segura.
- A publicação deve ser condicionada à execução de testes, TypeScript e compilação, seguida de sincronização no Lovable. Não executar SQL ou salvar registros da campanha nesta mudança.
