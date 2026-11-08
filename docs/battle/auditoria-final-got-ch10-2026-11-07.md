# Auditoria de encerramento — Guerra dos Tronos, Capítulo 10

Data 2026-11-07. Escopo: modo `GOT-CH10-1` do Cormyr Chronicle Atlas. Fonte principal: `Guerra dos Tronos RPG.pdf` do usuário, cap. 6 (p. 138–140), cap. 9 (combate pessoal) e cap. 10 (p. 219–241). Nenhuma ficha oficial de Casa, personagem ou recurso é modificada por esta atualização. Os motores **Adaptado** e **D&D** não recebem essas regras.

## Matriz de implementação auditada

| Tema | Regra do livro | Estado da integração |
| --- | --- | --- |
| Escala e mapas | Quadrados de 10 m, unidades de 100, esquadrões de 10 (pp. 219–223) | Motor de Guerra usa mapa quadrado, heróis em escala de 1 m; replays legados conservados |
| Habilidades | Defesa = Agilidade + Atletismo + Percepção − penalidade; Saúde = Vigor × 3 (p. 223) | Adaptador oficial preserva fórmula e bônus documentados |
| Marcha e marinha | Infantaria 40 m, cavalaria 80 m, navios 60 m **sem corrida**, Volume −10 m (p. 223) | **Corrigido**: navios em rio/lago navegáveis; corrida naval bloqueada; retiradas navais atravessam água |
| Campo de batalha | Tabela 10-3: cobertura somente ao **Defender** (pp. 226–228) | **Corrigido**: cobertura nunca é passiva em tiros; interface e testes conferem |
| Movimento lento | Movimento lento −10 m, muito lento −20 m; estrada reduz restrições (pp. 226–227) | **Corrigido**: maior penalidade do percurso aplicada uma vez por ordem e desde o terreno inicial. Menor trajeto por custo total; sem penalidades meteorológicas inventadas |
| Visibilidade e clima | Chuva pesada −2 resultado, neve leve −2 resultado, neve pesada conta como escuridão (pp. 226–227) | **Corrigido**: chuva pesada não impõe automaticamente −2D de pouca luz; neve leve não cria terreno adicional |
| Formações | Regras opcionais (pp. 238–239) | Motor avançado separado, ângulos e formações com testes; casos exóticos demandam adjudicação |
| Ordens e iniciativa | Passos 4–9, ordens contínuas, Disciplina, Guerra (pp. 228, 230–237) | Implementadas e com dados determinísticos; revisar com narrador em grandes exércitos |
| Heróis | Até Status do comandante em heróis por exército (p. 222) | **Corrigido**: montagem da batalha agora rejeita excesso de heróis |
| Cerco e montanhas | Sem artilharia atacante em terreno proibitivo; defensor pode usar havendo fortificação (Tabela 10-3) | **Corrigido**: prévia + disparo efetivo bloqueiam terreno, respeitando exceção |
| Engenheiros | Até 4 armas por engenheiro, recarga e comando por rodada (pp. 228–230) | Motor de cerco mantém limite, recarga, artilharia e munições |
| Fortificações | +3/+4/+6/+8/+12, capacidade 1/2/3/5/10 (p. 228) | Efeito do mapa sem duplicar atributos da Casa; integridade/VA de estruturas é **convenção digital**, não regra da tabela |
| Sobreviventes e Glória | Passo 11, Tabelas 10-5 e 10-6 | Prévia e trilha de dados; consequências oficiais exigem aval do Narrador |
| Unidades de Casas NPC | Fonte de unidades, posses e qualidades | As 162 NPCs do catálogo não têm fichas militares completas; rosters propostos **não** geram bônus de Casa presumidos (PR #327) |
| Qualidades marciais | Inspirador, Líder de Homens e outras (Cap. 5) | Sem ficha específica de comandante, nenhuma qualidade é presumida pela linhagem |

### Gaps que impedem declarar 100% certificado

1. Não existe confirmação da ficha mecânica individual para todas as 162 Casas NPC; suas tropas documentais continuam simulação.
2. Efeitos narrativos de personagens, qualidades, defeitos, Destino e combate pessoal dos capítulos 5/9 demandam lista de exceções por qualidade, equipamento e ação, com fichas verificadas.
3. O livro exige adjudicação humana para efeitos narrativos de emboscada, diplomacia, condições ambientais variáveis, disputas de posse e consequências; o digital não pode inventar esses resultados.
4. Algumas combinações de mobilização de grandes exércitos, mapa personalizado e equipamentos de cerco ainda precisam testes manuais autenticados do Narrador em telas reais. O teste sintético automatizado não substitui essa aceitação.
5. Destruição de fortificações permanentes usa valores de estrutura **digitais configuráveis**, não uma correspondência aritmética exata às regras do livro.

### Correções específicas deste lote

- `terrain.ts`: cobertura por Defender, chuva/neve segundo p. 226–227; sem somar penalidades automáticas de movimento por chuva forte/neve leve.
- `engine.ts`: marcha em quadrados com seleção determinística do caminho de menor custo; a maior penalidade da zona conta uma vez, incluindo terreno inicial; rios e grandes lagos transitáveis por navios; corrida naval proibida; retirada naval consistente.
- `advanced-orders.ts`: bloqueio de corrida naval em manobras e prevenção da exclusão errônea de águas navegáveis em empurrões.
- `siege-readiness.ts` + disparo do motor: montanhas e exceção das fortalezas do defensor.
- `BattleGotGame.tsx`: exibe bônus de cobertura somente ao Defender, movimento lento por ordem e corrida naval indisponível.
- Testes no novo arquivo `battle-got-chapter10-final-20261107.test.ts` e atualização dos testes antigos que refletiam a aproximação digital incorreta.

### Critério de publicação

Publicar **somente** depois de validação de testes, TypeScript, build, banco e aceite sintético no SHA exato do PR. Vincular o deploy ao merge confirmado e distinguir sincronização com o Lovable de deploy concluído. Não escrever estados de campanha nem aplicar consequências oficiais.
