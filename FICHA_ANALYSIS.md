# Análise da Criação e Consulta de Ficha

## 1. O que já está implementado

A implementação atual da aba "Ficha" localiza-se principalmente nos arquivos `src/components/players/ficha-tab.tsx` e `src/lib/ficha.ts`.

### A - Componentes de Interface (`ficha-tab.tsx`)
A `FichaTab` fornece três visões (`view`) selecionáveis por botões de navegação:
1. **Ficha da Casa ('house')**:
   - Renderiza o componente `NobleHouseHub`.
   - Inclui informações da casa atual (`current`), dos membros da corte e NPCs derivados dos registros lidos.
2. **Ficha do Personagem ('character')**:
   - Exibe a Ficha do Lorde (`FichaPersonagemCard`) vinculando um retrato encontrado caso exista.
   - Lista detalhes de outros personagens/integrantes da Corte (lidos pela classificação `kind === 'character'` excluindo quem é lorde).
   - Renderiza uma galeria de imagens exclusivas (`PrivateImage`) usando fotos que foram extraídas na identificação do conteúdo (`retratos`).
3. **Ficha Anterior Preservada ('legacy')**:
   - Uma aba para consultar o registro da Ficha da Casa armazenado como texto puro no registro antigo (`FichaCasaCard`).
   - Apresenta um modo para o administrador/jogador poder editar essa ficha (usando `RecordEditor`).

### B - Engine de Parseamento (`ficha.ts`)
A parte inteligente dessa feature roda no `src/lib/ficha.ts`, que funciona como um extrator de texto (já que os dados originam do Google Sheets/Google Drive exportados em plain text, separados pelo token `·`):
- **Identificação**: Funções `isFichaPersonagem` e `isFichaCasa` usam `Regex` para descobrir se um bloco de texto é uma ficha ou não.
- **Parse de Personagem (`parseFichaPersonagem`)**:
  - Extrai Nome, Casa, Idade, Jogador, Virtude/Vício, Defesas (Intriga/Compostura) e Movimentação.
  - Varre o texto em busca de uma tabela de "graduação" x "habilidade" para montar o array estruturado das capacidades do Lorde/Personagem.
- **Parse de Casa (`parseFichaCasa`)**:
  - Busca as chaves padrão: Nome, Suserano, Região, Lema, Herdeiro, Fortaleza.
  - Encontra e formata um array dos 7 atributos core de casas em Game of Thrones (Defesa, Influência, Terras, Lei, População, Poder, Riqueza).
  - Extrai um log de "Eventos Históricos" da família.

### Limitações / Ponto de Atenção Atual
- **A Criação/Edição** via `RecordEditor` atualmente é um editor de texto livre (`textarea` ou similar no `RecordEditor`) que salva dados em formato plain text e depende da reinterpretação correta do parser. Não é um fluxo "Formulário de Passo a Passo" tipado.
- Os "NPCs" da corte não possuem ficha estruturada sendo convertida/exibida com os status; são dispostos diretamente como texto na tela.

---

## 2. Plano de Ação (Particionado) para Melhorias

Abaixo mapeio os passos sugeridos para refatorar e aprimorar a Criação e Consulta das fichas, para torná-la mais robusta e guiada (Formulários UI em vez de edição de plain-text).

### Passo 1: Estruturação dos Dados (Backend / Estado)
- **Objetivo**: Garantir que as informações lidas da planilha (plain text) possam ser convertidas bidirecionalmente (JSON <-> Texto), ou refatorar o banco de dados para salvar os atributos de personagem isoladamente (usando o Drizzle).
- **Ações**:
  - Modificar `ficha.ts` para possuir uma função `serializeFichaPersonagem(ficha: FichaPersonagem): string` que transforma os objetos de volta para o padrão lido (`·` format), mantendo a compatibilidade do Drive.

### Passo 2: Construção de Formulários Tipados (UI - Consulta/Criação)
- **Objetivo**: Substituir o `RecordEditor` de texto livre para campos controlados.
- **Ações**:
  - Usar `react-hook-form` e `zod` para criar o schema de `FichaPersonagem` e `FichaCasa`.
  - Criar o componente `<FichaPersonagemForm />` com inputs para Nome, Casa, atributos numéricos (Defesa, Compostura) e lista dinâmica (useFieldArray) de Habilidades.
  - Integrar esse form no componente `ficha-tab.tsx` (substituindo ou envolvendo a tag `<RecordEditor />` para edição focada).

### Passo 3: Criação de Novos NPCs / Membros da Corte
- **Objetivo**: Permitir adicionar um novo membro da corte diretamente na visão de Ficha ('character').
- **Ações**:
  - Inserir botão "Novo Integrante da Corte".
  - Abrir um modal ou formulário expansível reutilizando o `<FichaPersonagemForm />`.
  - No evento `onSave`, criar um novo "Record" padronizado.

### Passo 4: Evolução e Testes de Regressão
- **Objetivo**: Assegurar que as mudanças de gravação geram strings estritamente idênticas às esperadas pelos testes preexistentes.
- **Ações**:
  - Atualizar os testes em `src/test/ficha.test.ts`.
  - Validar renderização via interface no console (`bun run test`).