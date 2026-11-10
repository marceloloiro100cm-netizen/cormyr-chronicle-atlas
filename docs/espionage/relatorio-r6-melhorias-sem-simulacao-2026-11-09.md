# Cormyr Chronicle Atlas — R6: melhorias sem simulação real
**Data:** 09/11/2026  
**Branch:** `fix/espionagem-r6-ux-robustez-sem-simulacao-20261109`  
**Base:** `d002f6d317225f473f9602f32bedb3810a0e798c` (P0–P3, R4 e R5 integrados).

## Objetivo e isolamento
Executar somente correções verificáveis sem uma partida com pessoas, sem autenticação de jogadores reais e sem alteração de dados da campanha. Nenhum script SQL de escrita ou avanço do HUB foi executado nesta etapa. Nenhuma senha, recurso, agente, missão ou dossiê de produção foi modificado. Não publicar automaticamente.

## Implementações

| Frente | Item executado no código | Evidência verificável | Risco ainda aberto |
|---|---|---|---|
| Resolução e prêmios | Classificação da Central em `retry` para `waiting_catalog` e `integrity` para prêmio ausente/desconhecido, com ação distinta e sem retry cego | `spy-narrator-operations-center.tsx`; `espionage-r5-lote3-narrator-ux.test.ts` | Aceite de resultado e XP em sessão autenticada |
| Central do Narrador | Mensagens de estado curto, aviso de lista possivelmente obsoleta, botões de mutação bloqueados quando consulta falha, feedback acessível | Central, testes R6 offline | Desconexão real em dois dispositivos |
| Envio de missão | Exibição exclusiva de erros conhecidos; falha de rede não apresenta SQL e conserva chave de solicitação para retry idempotente; local alterado reinicia a seleção de versão | `spy-submit-house-mission.tsx` e R6 offline | Concorrência real de duas sessões autenticadas |
| Dossiês/sigilo | Validação de identificador da Casa antes da RPC e mascaramento de exceções de transporte para jogadores; RLS do banco permanece fonte de verdade | `spy-dossier.functions.ts`; `espionage-r5-lote3-privacy.test.ts` | RLS com JWTs reais de duas Casas |
| Diagnósticos | Log server-side de falha na materialização agora é sanitizado (sem payload/SQL ou ID da Casa) e não desfaz resultado salvo | `spy-agent-actions.functions.ts`, R6 offline | Análise de incidentes da partida real |
| Android/acessibilidade | Foco por teclado, texto quebrável, inputs de 16 px, alvos de 48 px, colunas responsivas inclusive 320–375 px em criação, dossiês e Central | CSS de três painéis e `espionage-r6-offline-readiness.test.ts` | Revisão visual com aparelhos/usuários |
| Regressões | Suites para classificação de estados, prevenção de reprocessamento incorreto, bloqueio de ID inválido, erro de transporte, contratos responsivos e preservação do HUB oficial | Testes Vitest R5 ampliados e nova suíte R6 | Teste de ponta a ponta com pessoas |

## O que NÃO foi feito
- Nenhuma criação/alteração de conta, senha, Casas, agentes, recursos, missões, prêmio ou calendário.
- Nenhum julgamento ou publicação de désdia; nenhum teste que pudesse produzir alterações reais.
- Nenhuma migração SQL nesta R6. Regras de Astúcia, dados, risco, graduação, Lei e tempo preservadas.
- Nenhuma afirmação de 90% de usabilidade real baseada em teste unitário ou CSS.

## Gate automatizado
CI deve executar Vitest, TypeScript e build para esta branch. Adicionalmente, os testes R6 verificam contratos de privacidade, estados, idempotência e UI, sem depender de login de teste. Uma aprovação de CI é necessária, mas não substitui aceite com usuários.

## Fase 2 — pendências que exigem simulação real
1. Em homologação isolada **persistente**, provisionar Narrador + jogador A + jogador B e duas Casas independentes, com autorização explícita; nunca reaproveitar logins reais.
2. Jogador A: recrutar agente com Rede/retrato/melhoria; iniciar Recursos, Exército e Posses em destinos distintos. Verificar débito uma só vez e recibos.
3. Publicar 1 e várias désdias em HOMOLOGAÇÃO e atravessar ao menos um festival. Confirmar viagem → investigação → aguardando Narrador.
4. Narrador: julgar sucesso, fracasso, fuga, captura e morte; verificar XP, promoção, eventos, datas e atualização do dossiê.
5. Desconectar durante envio/julgamento; repetir a mesma chave e comparar contagens de decisões, XP e achados. Testar duas sessões concorrentes.
6. Jogador B: tentar ler agentes, missões e segredos da Casa A via interface e RPC; tudo deve ser negado.
7. Em Android 320/360/375 px e desktop, medir conclusão sem ajuda, número de toques, tempo por tarefa e clareza do resultado. Corrigir o que for observado.
8. Confirmar qual commit o hosting Lovable efetivamente serve e publicar somente após os gates de segurança, não pela simples integração do GitHub.

**Métrica:** o R6 anterior apresentou 89,4% como **estimativa técnica**, não como medição real. Não recalcular notas sem evidência de execução e dados de sessão.
