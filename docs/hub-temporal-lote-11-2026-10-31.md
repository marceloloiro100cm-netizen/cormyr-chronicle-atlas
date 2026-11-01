# Hub Temporal de Cormyr — Lote 11: auditoria integrada e preparação de implantação

**Data:** 31/10/2026  
**Base:** Lote 10 / PR #136, dependente dos lotes anteriores.  
**Situação:** implementação, diagnóstico e regressões versionadas em branch de auditoria; não há alteração de produção ou de calendário real.

## 1. Objetivo

Validar os contratos do relógio oficial de Harptos, revisar a segurança e a cadeia de dependências, corrigir falhas observadas no CI e preparar um procedimento explícito de implantação e reversão sem perder histórico. **Nenhum teste realizado na pipeline efêmera prova que o Supabase de produção está migrado**.

### Evidências da auditoria

| Achado | Evidência | Medida |
| --- | --- | --- |
| CI do Lote 10 (#136) falhava na suíte de interface | Job \`validate\`: 2 falhas em \`narrator-calendar-publish.test.tsx\`, 564 testes aprovados, 7 ignorados | Mock das novas RPCs agora cobre dashboard de consumidores e pré-voo; conserva os testes originais de falha de rede e divergência de snapshot |
| Banco descartável do Lote 10 aprovou migração e regressões | Job \`mail-database\`: \`success\` | Preservado e expandido por testes SQL do Lote 11 |
| Estações eram detectadas só comparando origem e destino | Trigger da migração 0066 usava \`from_season<>to_season\` | Migração 0067 conta fronteiras de estação reais atravessadas, inclusive saltos de ano completo e retrocessos |
| Drizzle journal não cobre todas as migrações SQL | \`drizzle/migrations/meta/_journal.json\` contém registros somente até a tag \`0042_reconcile_house_workbooks\`, enquanto o diretório contém arquivos até \`0067\` | **Bloqueador de deploy até conciliar o diário e o estado de migração real**; não executar \`drizzle-kit migrate\` cegamente |
| Duas implementações do Lote 4 permanecem como PRs abertas | #129 e #130; #131 está empilhada sobre #130 | Escolher cadeia #130 → #131, não tentar mesclar ambas as implementações |
| RLS e critérios de revisão precisam ser observados após implantação | RPCs SECURITY DEFINER restritas ao Narrador; tabelas de outbox sem SELECT direto para jogadores | Testes SQL e checklist de identidade administrativa/conta comum |

## 2. Mudanças do Lote 11

1. \`drizzle/migrations/0067_temporal_release_preflight.sql\`
   - Função determinística e interna \`temporal_season_crossings(from,to)\` calcula o número de mudanças sazonais cruzadas, sem confundir festival intercalar e mês.
   - Atualiza o gatilho da outbox de \`campaign_time_operations\` para a regra de estação correta. Payload acrescenta \`season_crossings\`.
   - RPC \`get_temporal_release_preflight()\`: diagnóstico privado, somente leitura, com versão/data, Casas ativas, rascunhos, fichas inválidas, atrasos/adiantamentos, operações, entregas e pendências de revisão.
   - O indicador \`month_processing_preflight_ok\` significa **apenas** ausência de fichas inválidas detectadas pelo contrato de processamento mensal. **Não é licença de implantação**.
   - O RPC assinala backup e homologação obrigatórios, sempre; nunca declara que foram realizados.
2. \`src/lib/calendar/temporal-consumers.ts\`: validação estrita dos dados do pré-voo, sem fallback para hora do navegador, datas gregorianas ou semana de missivas.
3. \`src/components/calendar/temporal-consumer-hub.tsx\`: painel de integridade visível apenas no Hub do Narrador, com aviso claro de bloqueio por fichas inválidas.
4. \`src/components/calendar/realtime.ts\` e \`narrator-calendar.tsx\`: invalidação do pré-voo quando a data do servidor muda, mais atualização periódica.
5. \`src/integrations/supabase/types.ts\`: nova assinatura RPC.
6. Correção das fixtures dos testes de calendário e testes adicionais em \`scripts/test-temporal-release-preflight.sql\` e \`src/test/temporal-consumers-lote10.test.ts\`.
7. GitHub Actions: inclusão do script SQL de regressão no banco descartável.

## 3. Gatilhos e critérios de segurança

- **Fonte única:** \`campaign_calendar\` versionado. As três désdias de 10 dias ordinários continuam distintas das rodadas de missivas.
- **Atomicidade:** publicação, projetos mensais, alteração oficial e registro da operação precisam ser uma única transação. A outbox é gravada no INSERT da operação e volta atrás com qualquer erro.
- **Idempotência:** mesmo UUID de publicação com mesmos argumentos não repete obras nem outbox. A mesma chave com parâmetros alterados é rejeitada.
- **Retrocesso:** não devolve obras, não reduz idade persistida (a idade é projeção do ano canônico), não reseta saldos, não apaga missivas, não reabre decisões econômicas.
- **Privacidade:** RPCs de prévia e decisão só para o Narrador; cadastro e outbox privados. A visualização pública da data não revela NPCs, Casas, conteúdos ou eventos privados.
- **Efeitos militares:** as unidades consomem bônus derivados das posses já ativas. Nenhum exército é criado, pago, treinado, movimentado ou atacado pela passagem de tempo.
- **Economia e serviços:** notifications \`manual_review\` não executam Sorte, receitas, impostos, recursos, soldos nem vencimentos não aprovados.
- **Saltos longos:** do inverno de 1522 ao inverno de 1523 existem quatro mudanças de estação; o Lote 11 registra uma entrega de revisão \`seasons\` com \`season_crossings=4\`.
- **Rede/concorrência:** UI só declara sucesso após comparar snapshot remoto à prévia; falha ou versão diferente preserva seleção e chave idempotente.

## 4. Ordem de integração das PRs

Cadeia funcional observada no GitHub:

\`#127 → #128 → #130 → #131 → #132 → #133 → #134 → #135 → #136 → [PR do Lote 11]\`

A PR #126 é o baseline de auditoria, a ser avaliado separadamente. A PR #129 é uma **implementação concorrente do Lote 4** e não faz parte da cadeia acima. O responsável deve confirmar sua substituição ou encerramento — não executar merge duplicado.

**Atenção:** os PRs foram abertos em branches empilhadas, não diretamente sobre \`main\`. Fazer merge em ordem, conferir os diffs restantes e as bases dos PRs filhos e só depois seguir para o próximo. Não rebasear nem atualizar branches de outra pessoa sem avaliar conflitos e trabalhos recentes.

## 5. Implantação segura — procedimento operacional

### Fase A — inventário e backup (pré-migração)

1. **Janela de manutenção combinada com os jogadores:** interromper operações que gravam Casas, projetos, missivas, calendário e movimentos de recursos; registrar o momento da parada.
2. Obter inventário somente leitura da instância real: versões SQL aplicadas, tabelas existentes, hashes de migração, \`drizzle.__drizzle_migrations\` quando existir, triggers de calendário, roles/RLS e o valor atual de \`campaign_calendar\`.
3. Comparar com os scripts \`0059\` e \`0060\`–\`0067\`; conciliar o histórico local do Drizzle e o de produção. **O diário atualmente não deve ser usado como fonte completa sem essa etapa.**
4. Criar backup consistente e restaurável da base de produção e, separadamente, das configurações/regras essenciais de Auth/Storage. Guardar o backup fora da branch, com controle de acesso. Testar a restauração integral em banco isolado.
5. Definir responsável pela implantação, validador independente e responsável pela decisão de reversão.

### Fase B — homologação (obrigatória)

1. Clonar dados **desidentificados ou aprovados** para ambiente isolado, ou usar cópia restaurada com acesso estritamente controlado. Não compartilhar dados de jogadores em logs ou PRs.
2. Executar migrations em ordem com \`ON_ERROR_STOP\`, controlar commits/versões e auditar logs de DDL. Confirmar índices, constraints, triggers e grants depois de cada etapa.
3. Rodar testes SQL de cada lote e \`test-temporal-release-preflight.sql\`; executar Vitest, TypeScript e build. Os testes de CI em PostgreSQL descartável não substituem este teste com schema legado real.
4. Validar no Hub como Narrador: prévia de désdia, festival, virada de mês, virada de ano, histórico, projetos pai/filho, idades de pessoas vivas/falecidas, missivas sem redatação, efeitos militares derivados e estados de outbox.
5. Validar como jogador comum: não há RPC administrativa acessível nem dados secretos expostos; somente sua Casa e sua cronologia autorizada são visíveis.
6. Forçar erro intencional em homologação: versão antiga, UUID repetido, projeto inválido, retrocesso sem justificativa e queda antes do commit; confirmar transação sem efeitos parciais.
7. Confirmar que a UI anterior não chama mais RPCs legados de publicação de data revogados pela migração 0060. Planejar implantação coordenada de backend/frontend.

### Fase C — corte controlado

1. Com backup restaurável e homologação aprovada, aplicar a sequência de migrações faltantes no banco real — **somente em janela autorizada**, com operador habilitado e logs de execução.
2. Implantar frontend compatível com RPCs finais e invalidar caches. A UI nova deve estar publicada **depois** da disponibilização de seus RPCs; evitar janelas em que clientes antigos tentem escrever o calendário.
3. Executar \`get_temporal_release_preflight()\` como Narrador e registrar versão e contagens; se \`invalid_houses>0\`, **não avançar meses** até corrigir fichas. Verificar manualmente outros riscos que o RPC não cobre.
4. Realizar smoke tests **não destrutivos** na produção: leitura da data como jogador, consulta do diagnóstico e lista de consumidores como Narrador, RLS e ausência de duplicidade. Não realizar saltos fictícios de calendário no banco real.
5. Reabrir escritas só após confirmação de integridade e decisão do responsável. Registrar SHA do frontend, sequência SQL, hora e aceite.

## 6. Reversão, falhas e recuperação

- **Falha antes de começar migrações:** manter produção inalterada. Não publicar frontend novo.
- **Falha de migration SQL em transação:** transação é revertida; inspecionar o estado antes de repetir. **Não** assumir que scripts aplicados anteriormente na janela também foram revertidos.
- **Falha de frontend após banco migrado:** retirar acesso à ação de publicação e retornar frontend compatível apenas se suas RPCs existirem; algumas RPCs legadas foram revogadas em \`0060\`, então simplesmente usar frontend antigo pode falhar. Priorizar correção progressiva.
- **Falha grave com banco já modificado:** restaurar backup validado em ambiente isolado e planejar retorno coordenado, considerando o risco de **perda de dados gravados após o backup**. Não aplicar um DOWN que destrua missivas, fichas, ledger de operações ou eventos históricos.
- **Falha após jogadores retomarem a campanha:** interromper novas escritas, reconciliar os registros transacionais e usar *forward fix* auditado sempre que possível. Restauração destrutiva requer decisão explícita e reconciliação dos novos dados.
- **Retrocesso da data do jogo não é rollback de software/banco.** Nunca usar \`set\` para desfazer uma implantação.

## 7. Checklist de aceite

- [ ] PRs integradas em ordem sem duplicar o Lote 4.
- [ ] Diário Drizzle e histórico real conciliados; migrações anteriores comprovadamente identificadas.
- [ ] Backup testado e janela de manutenção aprovada.
- [ ] GitHub Actions aprovado (Vitest, TypeScript, build, banco/RLS).
- [ ] Migrações 0060–0067 testadas em homologação com estado legado representativo.
- [ ] Narrador validou avanços, retrocessos, estações longas e prévias.
- [ ] Testes de privacidade por usuário comum e Casa foram aprovados.
- [ ] Procedimento de recuperação testado.
- [ ] Operador aprovou o corte; SHA frontend/backend registrado.
- [ ] **Nenhuma mudança temporal automática na produção até o aceite da mesa**.

## 8. Restrições remanescentes

Este lote não valida o banco real, não pode garantir consistência do histórico de migrações sem acesso ao ambiente, não realiza homologação e não conclui implantação de frontend. O pré-voo executável após aplicar a migração 0067 é **apoio diagnóstico**, não certificação de todos os dados ou da infraestrutura.

**Estado do Lote 11:** código e plano prontos para avaliação de CI e revisão; sem implantação na produção.
