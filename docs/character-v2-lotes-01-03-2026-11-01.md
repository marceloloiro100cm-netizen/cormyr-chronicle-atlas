# Cormyr · Ficha de Personagem V2 · Lotes 01–03

**Escopo:** fundações aditivas e prévia **não publicada ao jogador**. Não criar compras, tabelas novas ou atualização de registros até a homologação posterior. Documento de implementação: `Relatorio_Implementacao_Ficha_Personagem_Cormyr_2026-11-01.docx` (entregue na conversa).

## Lote 01 — Taxonomia, fonte e política de regras

- Inventário em `src/lib/character-v2/catalog.ts`: 115 benefícios/variantes, 35 desvantagens, IDs estáveis, grupos, graus I–III, nomes alternativos, referência por entrada e versão do catálogo.
- Fonte base: **Guerra dos Tronos RPG**, edição em português disponibilizada no Drive da campanha, **Capítulo 5, tabelas 5-1 e 5-2**; criação nos Capítulos 3 e 4. O OCR da fonte divide algumas linhas e requer conferência visual dos itens sinalizados (`sourceQuality=visual_review_required`).
- A edição/impressão exatas e possíveis diferenças de tradução continuam pendentes de conferência com o exemplar original. A lista de nomes é rastreada à tabela, **não** certifica efeitos, custos ou pré-requisitos.
- `automation=pending_rules`, `campaignStatus=requires_narrator_review` para **todas** as entradas. Nenhuma regra se aplica automaticamente neste lote.
- Política para regras caseiras: mudanças para Cormyr devem ter ID, justificativa, origem, autor/narrador, aprovação, data e versão própria; nunca alterar a definição do livro em silêncio. Benefícios de facções específicas de Westeros não são convertidos em bônus de Cormyr por suposição.
- Toda aquisição/cancelamento e mudança de interpretação deve manter log e poder ser revertida. Narrador confirma o que o sistema não conhece.

### Critérios e pendências

O teste `character-v2-foundations.test.ts` verifica quantidade, unicidade, categorias, IDs/aliases e ausência de efeitos prematuros. **Pendente para liberar motor:** conferir visualmente textos completos, variantes, edições, pré-requisitos e traduções, preencher parâmetros e escrever teste por efeito. A catalogação é exaustiva para **as 150 entradas do inventário aprovado**, não uma certificação de todas as expansões do jogo.

## Lote 02 — Leitura V2 e compatibilidade reversível

- `src/lib/character-v2/schema.ts`: contrato Zod V2 tipado (19 habilidades canônicas, habilidades especiais e vantagens parametrizadas, personagens, Casa, origem, snapshot e estado).
- `src/lib/character-v2/read-adapter.ts`: conversão em memória de ficha Chronicle V1 ou importação de texto antigo; NÃO grava no banco nem no Drive.
- O registro de origem identificado por `campaign_records.id` define uma referência canônica estável somente para **prévia de importação**, preservando `houseId`, `playerId`, versão e bytes do texto original. A identidade final com `character_id` e relacionamento da Corte exigirá conciliação do Narrador em lotes posteriores.
- Astúcia usa `cunning` da V1; **Briga** não é elevada a habilidade autônoma nem convertida automaticamente em graduação de Luta. Campo anterior é preservado em `source.unparsedFields`.
- Especialidades em texto, qualidades, defeitos, equipamento, XP, Destino e cálculos legados não se convertem em poderes automáticos. Expressões como `4m+1m /28 em corrida` permanecem em `unparsedFields` e geram pendências.
- `source.originalContent` permite devolução exata da fonte. `sourceFingerprint` é um identificador local de mudança **não criptográfico**, não um token de autorização.
- A origem deve ser carregada **somente após RLS/verificação de permissão**; o adaptador nunca consulta registros de outra Casa. Não disponibilizar `originalContent` ou dados privados no HTML de jogadores não autorizados.
- **Sem SQL, RPC de mutação, migração destrutiva ou inserção de registros V2.** Qualquer persistência futura terá versionamento otimista, transação, snapshot, RLS e rollback auditado.

## Lote 03 — Componentes gráficos reutilizáveis

Em `src/components/character-v2/character-sheet-parts.tsx`:

| Componente | Contrato |
| --- | --- |
| `SkillPips` | Habilidade com 7 círculos por padrão, valor legível e clique por graduação quando habilitado |
| `SpecialtyPips` | Dados de bônus `B`, até 5 como representação inicial e opção de zerar; limites definitivos dependerão do livro |
| `TraitCard` | Nome, categoria, grau opcional e estado de revisão; **nenhum efeito aplicado** |
| `CharacterStatus` | Cabeçalho, dados derivados provisórios e aviso de não homologação |
| `CharacterV2Preview` | Composição somente leitura com as 19 habilidades e pendências |

- Botões nativos e `aria-pressed`, nomes acessíveis, navegação pelo teclado, foco visível, valores numéricos para leitores de tela e cores não exclusivas para transmitir estado.
- CSS em arquivo isolado, quebras a 640px e 390px e suporte a `prefers-reduced-motion`.
- `CHARACTER_V2_PLAYER_UI_ENABLED=false`: **não aparece** na ficha pública. O componente pode ser usado para prévia interna e nos testes, sem expor dados.
- Testes `character-v2-ui.test.tsx` verificam bolinhas preenchidas, clique/foco, specialty B, revisão e composição. Em lote futuro, adicionar screenshots automatizados em navegadores reais desktop/mobile e revisão visual antes de ativar.

## Comandos de validação

```bash
bun run test -- src/test/character-v2-foundations.test.ts src/test/character-v2-ui.test.tsx
bun run test
bun run build
```

## Não incluído nestes lotes

Preço e compra por idade, motor de cálculo de Defesa, Saúde ou Movimento, efeitos de vantagens/defeitos, destinação de XP/Destino, alteração do banco, migração real, exportação PDF V2, publicação ao jogador e integração de idade canônica com o Hub Temporal. São dos lotes 04–12 e **não podem ser presumidos concluídos**.

## Porta de ativação

Não habilitar V2 na produção antes de: fonte revisada; efeitos regulamentados e testados; consentimento de conversão de fichas legadas; RLS e auditoria de mutações; comparação V1×V2; rollback testado; revisão de diferentes Casas e aprovação do Narrador.
