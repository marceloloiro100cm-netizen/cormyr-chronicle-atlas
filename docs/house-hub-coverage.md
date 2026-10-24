# Hub de casa nobre — cobertura e conciliação

Fontes: cinco anexos autorizados em 24/10/2026. Nenhuma casa real foi importada ou redistribuída. Nenhuma publicação foi executada.

## Fontes e precedência
1. Pedido explícito de Cormyr e Bonus por Região: substituem geografia/bônus de Westeros.
2. Prosperidade: substitui mina, mercado, porto, artesão/guildas onde indicado.
3. Livro básico: capítulo 6, tabelas 6-6/7/8/18/19; capítulo 10, tabelas 10-1/2.
4. Planilhas: exemplos legados sujeitos à conciliação, nunca autoridade para fórmulas.

As imagens de Bonus por Região foram lidas visualmente. As 16 imagens de Prosperidade são ilustrações e elementos gráficos, não fotografias das tabelas: não recuperam texto ausente. A tabela de empilhamento está no texto, com sobreposição em +12 e arredondamento do d3 não definido. Esses pontos não foram corrigidos por suposição. Swordmarch Lei=5 segue o pedido explícito, apesar de Lei=10 no quadro anexado.

## Matriz por grupo
| Grupo | Implementado | Não concluído / motivo |
|---|---|---|
| Integração | Ficha da Casa / Personagem / registro anterior; IDs e brasões oficiais | Representação administrativa ainda não inclui o novo hub |
| Contabilidade | Sete recursos; total, alocado, obras, disponível, permanentes; frações; não devolver ao destruir | Efeitos condicionais complexos e restituições específicas |
| Criação | Dez etapas, autosave, revisão/aprovação, orçamento não fixo, redistribuição bloqueada após revisão | História mecânica tabela6-4, ajustes individuais 1d6 e rolagens com controle completo |
| Regiões | Onze regiões/aliases, bônus substitutivos e datas de fundação CV | Datas não são intervalos de idade; não reaplicado +2 em personagens |
| Catálogo | 173 entradas Prosperidade (76 opções incluindo variantes,97 melhorias), custos/textos/fontes/pendências; catálogo básico adicional | Algumas opções são deliberadamente bloqueadas por texto ambíguo ou requisito ainda não automatizado |
| Compras | Simulação local,3 etapas, saldo antes/depois, confirmação server-side, transação, versão/idempotência e ledger | Descontos completos, stacking, limites Settlement, compatibilidade de múltiplas melhorias |
| Domínios |4 terrenos,11 características,5 comunidades; somatória; terreno único; posse no domínio | Imagem e capacidade operacional detalhada |
| Fortificações |5 tipos, custos/prazos/dados, obra futura, bônus de unidade separado | Capacidade, unidades situadas e upgrades por regra explícita |
| Prosperidade | Catálogo nominal completo identificado,descrições e fontes; Estate máximo1/domínio | Muitos benefícios militares/conversões/sazonais narrativos; stacking não automatizado |
| Exército |17 tipos catalogados,4 treinamentos,XP/custo/saúde/Defesa/Disciplina; guarnição treinada5; XP bloqueado | Mistas: custo simulado, confirmação bloqueada até regra de equipamento/Disciplina; cavalaria aguarda montarias; mercenários aguarda contrato; treino em campanha bloqueado |
| Equipamento |Tabelas10-1/2 para17 tipos, melhoria por categoria1Riqueza limitada; baixas preservadas | Especial/cerco catalogados com bloqueio de operador; água/óleo custo1/2 ambíguo; Fogo Selvagem aguarda Cormyr |
| Família/vassalos |NPCs vinculados sem duplicar ou cobrar cadastro; funções de corte; custos20/10/5 catalogados | Status/herdeiros/sucessão mecânica e criação de vassalos |
| Calendário |Meses Faerûn CV separados do real; avanço idempotente; projetos ativam na conclusão |Projetos personalizados, tesouro/câmbio, sazonalidade e ações desbloqueadas completas |
| Sorte |Tabela6-18 não linear,Lei/Pop,dados de teste/bônus separados,melhores dados,consequências narrador,máximo1/mês; alternativa+1; tabela6-19 |Efeitos de posses exigem conciliação; nenhum empilhamento inventado |
| Importação |Prévia por cabeçalho/contexto,erros,#REF!Casa!B38,Erdenor/Ashkar,linhas vazias,originais intactos |Confirmação transacional de snapshots e decisões campo a campo |
| Permissões |RLS privado,grants,server auth/vínculo ativo/can_edit; GM separado; RPC de commit só service role |Testes de acesso cruzado e concorrência reais ainda não executados |
| Histórico |Snapshots antes/depois,autor,data real/campanha,regra,versão,chave,desfazer rascunho |Estorno ativo e custo completo dos descontos históricos |
| Drive/export |Excel multiaba legível e PDF por impressão; sincronização anterior intacta |Novo formato estruturado Drive,conciliação externa,Excel com fórmulas/estilo,PDF direto e histórico exportado |

## Integridade dos anexos
- Evenhand: `Casa!B38=#REF!` exibido; lançamentos não escondidos para forçar saldo.
- Ficha da Casa: identidade Ashkar; unidades Exército Erdenor separadas/bloqueadas.
- Sorte por Lei/Pop não debitada. Bônus não vira evento. Vazio não equivale a zero.
- Planilhas originais permanecem no upload; prévia guarda abas/células/fórmulas em memória, sem escrita automática.

## Pendências específicas de fonte
Animal Husbandry, Master of Arms, Secret Police e Spy Network têm campos críticos perdidos. Salt Works, Research Archivists, Herald e versões têxteis têm conflitos explícitos. Gaol: prazo literal2d5 preservado como pendência. Stacking: +12 sobreposto; total>18 e arredondamento não definidos. Texto de escadas/cordas/arpéus e dano da catapulta média não recuperável. Todo item bloqueado exibe sua pendência no catálogo.

## Estado de validação
Testes isolados de motor e regressões de fichas/NPCs. Tela autenticada do Narrador lida sem salvar casas reais; busca de castelos e uploads das duas planilhas verificados. Celular390px sem overflow após correção. Nenhuma compra, missiva, avanço ou dado fictício gravado em casa real.

**Não declarar o hub completo:** os pontos da última coluna continuam abertos e precisam de implementação ou conciliação específica.