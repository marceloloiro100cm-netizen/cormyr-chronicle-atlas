# Auditoria de integração — Casas NPC e regras de guerra

Data: 2026-11-07. Escopo: Cormyr Chronicle Atlas, **Game of Thrones: capítulo 10**, Adaptado e D&D. Não alteramos cadastro, senhas, recursos, fichas ou saldos oficiais.

## Inventário de origem (somente leitura da produção)

- 172 casas em `house_catalog`, das quais **162 não são uma das 10 casas ativas da campanha**.
- Dessas 162 Casas NPC, **160** têm atributos em `spy_noble_house_stats`, **160** têm `battle_house_roster_imports`, e **0** têm `noble_house_sheets` completo.
- Há 483 registros de roster (de vários tipos de casas), com 446 rotulados “Compra proposta”, 21 “Proposta NPC” e 16 “FICHA OFICIAL — LANÇAMENTO”. O rótulo de uma linha NÃO substitui a existência de ficha operacional completa.
- `noble_house_rule_overrides` possui 0 linhas; `noble_house_gm_notes` possui 0 linhas.
- Muitos atributos NPC são estimativas narrativas/regionais (`attribute_origin`), não comprovação de posse comprada e ativa.
- O catálogo `archive_data` registra principalmente história, heráldica, vínculos e localização. **Não armazena propriedades militares estruturadas, condições, treinamento ou qualidades de personagens.**
- Fontes autorais individuais no Drive podem mencionar castelos, cavalos, abadia, fortalezas, vantagens etc., mas **narrativa não equivale a investimentos de regras**. Exemplo genérico: o nome narrativo de uma sede não comprova o investimento mecânico em Castelo nem autoriza +8 de Defesa.

**Conclusão de dados:** não é possível certificar fidelidade 100% para 162 Casas NPC enquanto 0 têm a ficha mecânica de guerra completa. Preservar a diferença entre informação narrativa, proposta de compra e registro validado.

## Rastreabilidade de regras (livro fornecido pelo Narrador)

Livro: `Guerra dos Tronos RPG.pdf` (Green Ronin/Jambô), páginas impressas:
- cap. 6, p. 134–135: fortificações (+3 Torre, +4 Salão, +6 Castelo pequeno, +8 Castelo, +12 Castelo superior); só defendendo estrutura.
- cap. 6, p. 138–140: Poder, unidades, treinamento, disciplina e armas conforme os perfis.
- cap. 10, p. 226–228: terreno, posição, cobertura, fortificações, condições meteorológicas e capacidade das estruturas.
- cap. 10, p. 229–230: artilharia, engenheiros, recarga, dano/alcance.
- cap. 10, p. 231–243: ordens, heróis, resolução e consequências.
- cap. 5, p. 93–119: **qualidades, benefícios e desvantagens são atributos de personagens** e exigem ficha individual e condição explícita, não devem ser gerados pelo sobrenome de uma Casa.

| Regra/benefício | Fonte comprovada | Tratamento no código | Limite de fidelidade |
|---|---|---|---|
| Treinamento, Saúde, Defesa básica, Disciplina, arma | `noble_house_sheets.state.units` | Copiar em snapshot imutável | Bloqueia NPC sem ficha |
| Fortificação do domínio (+3/+4/+6/+8/+12) | Holding ativo e domínio da unidade | Remover do atributo base na importação; motor soma só se unidade ocupar fortificação do campo | Narrador confirma posição e tipo real |
| Engenheiro +1 em fortificação, preparado para cerco e Armadura especial | Holding de suplemento `pros-*` | Deixar condicional/visível e **não** somar em campo aberto | Confirmar suplemento/fortificação |
| Academia Militar +1 habilidade, Cães de Guerra e armas especializadas | Holding ativo, vínculo e especialidade | Consumido apenas onde o adaptador tem conversão explícita; restante é pendência | Sem efeito automático sem posse |
| Mestre de Armas +1 no teste de sobreviventes | Holding ativo `pros-master-of-arms` | Proveniência oficial no snapshot GoT, prévia automática **sem somar duas vezes** | Decisão final do Narrador |
| Recrutamento: descontos e quantidades | Cotação da ficha | Nunca reaplicar durante luta | Não duplicar créditos de Poder/Riqueza |
| Moral, liderança, qualidades, defeitos e talentos de heróis | Fichas individuais/efeito aprovado | Exigir documentação explícita | Não inventar valores |
| Vassalagem, vínculos dinásticos e mobilização | `vassals` e logística narrativa | Não presumir tropas, bônus de Guerra ou lealdade | Aprovação do Narrador |
| Terreno e clima | Mapa e seleção do cenário | Motor próprio de cada modo | Mapas quadrados comuns ≠ regras idênticas |
| Consequências pós-guerra e Glória | Resultado e escolhas de ocupação | Projeção; não grava em ficha | 3 meses e investimentos requerem aprovação |

## Correções deste lote

1. Novo adaptador auditável `src/lib/battle/adapters/house-war-effects.ts`: calcula somente efeitos registrados da ficha completa, distingue automático, condicional e revisão; preflight NPC `full-sheet`/`training-proposal`/`unavailable`.
2. GoT: subtrai Defesa de fortificação e Armadura condicional da **Defesa base** do snapshot. `fortForUnit` concede bônus físico uma única vez no campo. Evita +8 antecipado +8 no castelo.
3. Pós-Guerra: aplica +1 de Mestre de Armas da **ficha oficial** à Tabela 10-6 e registra a origem, com teto +1; escolhas manuais não duplicam.
4. Adaptado: remove fortificação de atributos universais em campo aberto e mantém aviso de pendência; efeitos não convertidos não são marcados como aplicados.
5. UI e servidor: informa quando tropas NPC são apenas propostas, mostra lacunas para fidelidade ao livro e expõe o relatório da proveniência das unidades com ficha completa.
6. Testes: posse ativa/inativa, domínio diferente, unidade fora de casa, Defesa não duplicada, sobreviventes e classificação NPC.

## Lista de requisitos para alcançar integração verificável

- Criar ou aprovar, **para cada Casa NPC**, `HouseState` com domínio, holdings ativos, tropas, tipo, treinamento, armadura, saúde e disciplinas.
- Separar arquivos narrativos/nomes de castelos dos dados de compra/posse, com ID da fonte, versão e aprovação do Narrador.
- Para qualidades/benefícios/defeitos: cadastrar no modelo de personagem/comandante e definir pré-condições e duração; nunca conceder à tropa por associação nominal.
- Descrever no cenário a fortificação exata e qual unidade a ocupa; proteger contra duplicação de efeitos quando terreno e holding se sobrepõem.
- Distinguir suplemento `pros-*` de regra obrigatória do livro básico; teste automatizado por linha de regra, incluindo interações com cerco, moral e pós-guerra.
- Por fim, executar partidas com NPCs documentados e revisão narrativa de resultados pelo Narrador. Até isso, registrar “fidelidade não certificada” ao invés de “100%”.
