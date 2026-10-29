# Calendário e gestão da casa — implementação

O PR #31 integrou calendário de Harptos, data obrigatória nas missivas e mudanças de Corte, Exército e Vassalos. Atualizações posteriores do repositório foram preservadas.

## Calendário
- Três désdias de dez dias, festivais intercalares e rosa dos ventos simplificada.
- Reino em roxo; missivas em laranja; estações em verde. Eventos acessíveis por mouse, teclado e toque.
- Data obrigatória no envio de missivas e respostas, inclusive MCP. Datas históricas ausentes não são inventadas.
- Apenas missivas entregues e autorizadas pelas políticas de acesso alimentam o calendário.
- Midsummer após Flamerule, conforme o PDF; Shieldmeet em anos divisíveis por quatro.
- Ajuste global pelo Narrador, avanço opcional por nova rodada e conclusão auditada de projetos ao mudar de mês. Repetir a mesma rodada não duplica o avanço; voltar a data não desfaz obras.

## Gestão
- Casa narrativa; gerenciador de NPCs na Corte. Corte, Vassalos, Projetos e Calendário separados.
- Comandante opcional com criação/vínculo de NPC na transação da unidade.
- Vassalagem imediata com investimento 20/10/5 de Poder. Novas vassalas possuem cinco d6 por recurso e mini-ficha com orçamento próprio.
- Revisão devolvível ao rascunho, resolução seletiva de pendências, registro de perdas com déficit e salvamento antes de navegar entre etapas.
- Correções de Swordmarch e capacidades de fortificações, com posteriores ajustes de regras preservados.

## Validação e implantação
O fluxo de CI verifica testes unitários/interface, TypeScript, build, arquivo público e todas as migrações em PostgreSQL descartável. Testes dependentes de credenciais externas podem permanecer ignorados.

O código no GitHub não comprova aplicação ao banco de produção nem publicação pelo Lovable. Calendário e comandantes dependem das migrações 0038 e 0039; a versão atual também contém migrações posteriores. Conferir o registro de migrações do ambiente antes de aplicá-las, preservando os dados existentes.

Sugestão futura: cadastro de eventos públicos editáveis pelo Narrador, separado dos eventos de missivas privadas.
