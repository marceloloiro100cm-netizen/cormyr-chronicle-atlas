# Catálogo de Qualidades e Defeitos — auditoria e interface de novembro/2026

## Auditoria do livro-base
- Livro: *Guerra dos Tronos RPG*, capítulo 5, tabela 5-1 (benefícios) e tabela 5-2 (desvantagens) no acervo conectado da campanha.
- Catálogo canônico: **150 entradas** (115 qualidades e 35 defeitos), incluindo graus I, II e III, mantidos em IDs únicos.
- A importação automática das tabelas recuperou **115 descrições resumidas com correspondência exata**. As outras **35 entradas** aparecem no seletor completo, mas a transcrição do livro tem colunas quebradas, especialmente benefícios marciais em séries; essas descrições permanecem explicitamente sem confirmação.
- O motor de efeitos numéricos não é equivalente ao catálogo integral. Somente efeitos com fonte, requisitos, situação e cálculo verificados ficam elegíveis para ativação. Mesmo assim, toda ficha importada permanece não homologada até decisão do Narrador.
- Cada cartão clicável informa efeito/resumo, exigências, fonte, status de validação e observação de recorrência quando aplicável. Qualidades e defeitos que carecem de regra validada mostram aviso, não bônus inventado.

## Criação e edição de fichas
- `TraitCatalogPicker` oferece os 115 benefícios e 35 defeitos em grupos pesquisáveis via seletor. Permite detalhamento (ex.: Herança: Cajado de Magi; Foco em Conhecimento: Alquimia; Defeito (Pontaria)).
- Seletor conectado ao formulário estruturado existente (criar ou editar). Cada inclusão é salva como texto na versão V1 estruturada e reapresentada pela importação V2 como `imported_unverified`.
- A aquisição com custo de Destino, o número máximo de benefícios por idade e os pré-requisitos mecânicos **não são debitados/ativados automaticamente** por esse seletor. Isso depende de RPC e migração formal ainda pendentes.
- **Editar ficha** abre o editor de versão existente somente para quem tiver `canEdit`; fichas legadas abrem edição do texto integral para evitar perda silenciosa de colunas; cada gravação usa a RPC versionada `save_campaign_record`.
- **Baixar ficha** exporta os dados apresentados em PDF; números não homologados ou incompletos permanecem marcados `A conferir`.
- Removidos os textos decorativos e avisos da parte superior destacados nas imagens: o cabeçalho mostra nome e ações.

## Abastado e efeitos de calendário
Regra conferida no texto principal do livro: no **início de cada mês**, um personagem com Abastado pode fazer teste **Fácil (3)** de **Astúcia ou Status**. Um sucesso concede **10 dragões de ouro por grau de sucesso**, com graus definidos pela tabela 2-1: 0–4 de margem = um grau, 5–9 dois, 10–14 três, 15+ quatro. Não é renda fixa nem benefício em recurso Riqueza da Casa.

Implementado:
- Código puro de cálculo por dados D6 conferíveis e graduação, progresso dos meses absolutos de Harptos e chave idempotente `personagem:mês:versão da regra`.
- Ponto de integração entre calendário central e plano de crédito a processar, incluindo saltos com vários meses, dados verificados e bloqueio de personagens sem aprovação.
- O resultado do cálculo possui estado **pending_authorized_settlement**. O cliente não tem permissão para depositar moedas apenas por abrir a ficha.

**Pendente para crédito real automático no banco**: estabelecer ledger persistente único por pessoa/mês e saldo monetário do personagem ou cofre da Casa, vincular personagem canônico, decidir propriedade do ouro, executar rolagem auditável no backend com autenticação e ligar a rotina à função de publicação do Hub Temporal. O sistema produtivo ainda não tem vínculos canônicos homologados, e a sequência de SQL da V2 está em `docs/sql-drafts` por questões de segurança. Não habilitar depósitos sem essas condições.

## Qualidades com ciclos adicionais
A base suporta um futuro registro de efeitos por periodicidade: mensal (Abastado), diário (Sortudo, Pio), cena (Famoso, Fúria), evento (Herança e Companheiro), atividade econômica (Ofício, Mente Matemática). Ainda não existem transações automatizadas para essas categorias: não é correto converter efeitos contextuais do livro em renda passiva.

## Estado de publicação
A interface, catálogo e cálculos puros podem ser publicados com testes, sem migração SQL. A ativação das compras, efeitos de combate não validados e **crédito automático real de ouro** permanece bloqueada até integração transacional com o banco.
