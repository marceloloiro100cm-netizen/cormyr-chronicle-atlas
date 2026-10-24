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
| Compras | Simulação local,3 etapas, saldo antes/depois, transação, versão/idempotência; bloqueio síncrono de duplo clique; chave preservada em retry; custos originais/finais/descontos históricos; requisitos corrigidos Fishery/Court/Port/Marketplace/Tolls/Inn | Todos descontos condicionais e decisões para múltiplos descontos; Magnum Opus sequencial ainda pendente |
| Domínios |4 terrenos,11 características,5 comunidades; somatória; terreno único; posse no domínio | Imagem e capacidade operacional detalhada |
| Fortificações |5 tipos, custos/prazos/dados, obra futura, bônus de unidade separado | Capacidade, unidades situadas e upgrades por regra explícita |
| Prosperidade | Catálogo nominal identificado; Estate1/domínio; Settlement por suporte sem somar capacidades: povoado/torre1,vila pequena/salão2,vila grande/castelo4,cidades sem limite; exceções Abbey/Tolls/Inn; Growth2 espaços por melhoria ativa; melhorias marcadas coexistentes/repetíveis; descontos Canis/Mestre da Caça, cavalos esportivos/Mestre de torneios, campo de torneios/Mestre de torneios, cavalos de guerra/Cavalaria e construtor/Navios | Suportes Castelo pequeno/superior não inferidos; benefícios dinâmicos, comércio entre domínios, sazonalidade e todos descontos ainda parciais |
| Exército |17 tipos,4 treinamentos,XP/saúde/Defesa/Disciplina; mercenários Poder2/4/6/8 e Riqueza permanente1/3/6/9; sem manutenção inventada; movimento e Volume | Mistas: equipamento é escolha de um conjunto conforme livro, mas habilidades/Disciplina ainda precisam concluir; cavalaria aguarda montarias; sobreviventes/evolução e treino em campanha não concluídos |
| Equipamento |Tabelas10-1/10-2, melhoria por categoria1Riqueza permanente,limite uma; Volume/penalidade atualizados; dano Luta/Pontaria exibido conforme melhoria; baixas/saúde preservadas | Especial/cerco e operador; água/óleo ambíguo; Fogo Selvagem aguarda Cormyr; mistas/equipamento selecionado ainda pendentes |
| Família/vassalos |NPCs vinculados sem duplicar ou cobrar cadastro; funções de corte; custos20/10/5 catalogados | Status/herdeiros/sucessão mecânica e criação de vassalos |
| Calendário |Meses Faerûn CV separados do real; avanço idempotente; projetos ativam na conclusão |Projetos personalizados, tesouro/câmbio, sazonalidade e ações desbloqueadas completas |
| Sorte |Tabela6-18; efeitos estruturados ativos de Sorte/ganho/mitigação; acumulados4–6=1d6,7–11=2d6,13–18=3d6 com dados registrados; ganho só sobre ganho real,mitigação não cria lucro; melhoria sem principal ativa não fornece efeitos; alternativa+1 sem bônus; tabela6-19 |Total2/3 exige decisão de arredondamento,+12 sobreposto e >18 bloqueados; efeitos sazonais/dinâmicos continuam em conciliação |
| Importação |Prévia por cabeçalho/contexto,erros,#REF!Casa!B38,Erdenor/Ashkar,linhas vazias; Narrador confirma snapshot de recursos e decisões, sem tropas/compras e sem reaplicar bônus |Conciliação campo a campo de posses/tropas e resolução das pendências antes da aprovação |
| Permissões |RLS privado,grants,server auth/vínculo ativo/can_edit; GM separado; RPC de commit só service role |Testes de acesso cruzado e concorrência reais ainda não executados |
| Histórico |Snapshots,autor,data real/campanha,regra,versão,chave,desfazer; custos/descontos preservados em novas compras; venda/cancelamento/destruição não restitui automaticamente; obra destruída não reativa |Estorno ativo com decisão auditável ainda não concluído |
| Drive/export |Download PDF direto paginado e Excel13 abas com identidade,recursos,domínios,poss es,benefícios,tropas/habilidades,projetos,corte,Sorte/ações,história,ledger e conciliação; downloads autenticados verificados |Novo formato estruturado Drive,conciliação externa e fórmulas Excel; ledger exportado limitado às100 operações atualmente carregadas |

## Integridade dos anexos
- Evenhand: `Casa!B38=#REF!` exibido; lançamentos não escondidos para forçar saldo.
- Ficha da Casa: identidade Ashkar; unidades Exército Erdenor separadas/bloqueadas.
- Sorte por Lei/Pop não debitada. Bônus não vira evento. Vazio não equivale a zero.
- Planilhas originais permanecem no upload; prévia guarda abas/células/fórmulas em memória, sem escrita automática.

## Pendências específicas de fonte
Animal Husbandry, Master of Arms, Secret Police e Spy Network têm campos críticos perdidos. Salt Works, Research Archivists, Herald e versões têxteis têm conflitos explícitos. Gaol: prazo literal2d5 preservado como pendência. Stacking: +12 sobreposto; total>18 e arredondamento não definidos. Texto de escadas/cordas/arpéus e dano da catapulta média não recuperável. Todo item bloqueado exibe sua pendência no catálogo.

## Estado de validação
65 testes isolados passaram em24/10 às22:10: motor,Sorte/conversões,requisitos/limites/descontos,mercenários/equipamento,permissões/idempotência simuladas,compra3 passos,relatórios e regressões. Download PDF real e Excel13 abas verificados com acesso do Narrador; formulário de mercenários mostra custo permanente correto; celular390px sem overflow e zero erros de navegador. Nenhuma compra, missiva, avanço ou dado fictício foi gravado em casa real. Gravação/leitura end-to-end e concorrência reais ainda não exercitadas no banco compartilhado.

**Não declarar o hub completo:** os pontos da última coluna continuam abertos e precisam de implementação ou conciliação específica.