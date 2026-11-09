# Cormyr Chronicle Atlas — Relatório V4 de UX e Game Design
**Data:** 9 de novembro de 2026  
**Escopo:** módulo de batalha; Game of Thrones (GOT), Adaptado (PTE-2.0), D&D simplificado e laboratórios relacionados  
**Natureza:** revisão de arquitetura, implementação P2 e regressão automatizada. Não substitui ensaio com jogadores reais.

## 1. Resumo executivo
A revisão V4 prioriza **fazer o jogador compreender sua próxima decisão** sem multiplicar botões. Os três itens P2 foram implementados:
1. Objetivos táticos opcionais com consequência real para a vitória, exclusivamente no **Adaptado**.
2. IA determinística que busca pontos estratégicos, tenta evitar engajamento desfavorável para unidades de longo alcance e pode defender posição.
3. Tutorial curto de primeiro uso, com três passos por modo, descartável e reabrível.

**Limites explícitos:** nenhum objetivo novo altera as regras do livro de Game of Thrones, os ataques simplificados do D&D ou os dados oficiais da campanha. A IA PTE não é compartilhada com motores D&D e GOT. O módulo segue restrito ao Narrador (BATTLE_PLAYERS_ENABLED=false).

## 2. Avaliação por experiência
| Jornada | Situação V4 | Observação |
|---|---|---|
| Entrar e escolher GOT / Adaptado / D&D | Boa | Seletor próprio; tutorial contextual de 3 passos |
| Criar confronto Adaptado | Melhorada | Condição de vitória é uma escolha simples; padrão permanece eliminação |
| Jogar Adaptado | Melhorada | Objetivo na arena, pin no quadrado alvo e texto de progresso |
| IA Adaptado | Melhorada, em teste | Comandos legais, desempate determinístico, aproximação e posição de tiro |
| Preparar GOT | Boa com ressalvas | Decisões por fase; ainda existem muitos controles de exceções do livro |
| Jogar GOT | Funcional, complexo | Cerco, heróis e ordens seguem o motor próprio; objetivos P2 não aplicados |
| Preparar D&D | Boa para jogo simples | Busca de monstros, pilhas, comparador de PV/CA sem prognóstico falso |
| Jogar D&D | Funcional, incompleto por desenho | Não replica habilidades, magia e ações lendárias da 5e |
| Retomar sessões | Informativo, não unificado | GOT no navegador; D&D privado; Adaptado via persistência disponível; V3 via arquivos |
| Mobile | Coberto por simulação Chromium | Ainda exige sessão autenticada e avaliação em Android real |

## 3. P2.1 — objetivos com vitória real
### Opções do Adaptado
- **Derrotar o inimigo**: padrão original, sem alterações no replay antigo.
- **Conquistar posição**: atacante mantém quadrado central transitável por **2 rodadas completas consecutivas**; defensor vence se impedir a conquista até o fim da **8ª rodada**.
- **Resistir**: defensor vence se mantiver o exército capaz de lutar até o fim da **6ª rodada**; atacante ainda pode vencer antes por eliminação/debandada.

As vitórias são resolvidas **na transição da rodada pelo redutor determinístico**, e não por texto visual, ação de IA ou intervenção manual. Objetivos aparecem em snapshots/replays novos e recebem validação de célula não bloqueada. Replays sem objetivo continuam usando a mesma versão PTE-2.0 e não recebem campos novos.

**UX:** sem painel de administração adicional. Um seletor na preparação, um marcador no mapa e uma linha curta com progresso e prazo; informações de regra preservadas no motor.

**Riscos / limites:** apenas duas famílias de objetivo nesta etapa. Falta um editor avançado de pontos múltiplos, zonas de controle, reforços condicionais e métricas de território. Não há sincronização com a campanha; é intencional.

## 4. P2.2 — IA mais tática
A IA PTE foi aprimorada sem sorteio oculto:
- prioriza ataques que derrotam alvos, ameaças sobre o objetivo, baixas e dano;
- ao conquistar/defender posição, reduz a distância ao ponto tático sempre que encontra movimento legal;
- arqueiros buscam células com linha de visão, alcance válido e sem inimigo adjacente;
- defensores no cenário de resistência usam defesa quando não existe ataque legal;
- respeita `getLegalActions`, terreno, linha de visão, custo de movimento, limites da ativação e replay.

**O que não significa:** não é IA de aprendizado, não usa rede externa, não faz planejamento em múltiplos turnos e não simula doutrina militar histórica. O comportamento é estável e auditável.

## 5. P2.3 — primeira batalha em três passos
Cada modo possui um roteiro **Escolher → Jogar → Salvar** adaptado:
- Adaptado: forças-modelo, toque no mapa, replay/salvamento;
- GOT: tropas, fases do livro, cópia local;
- D&D: busca de monstros, quantidade/posicionamento automático, retomada privada.

O guia é exibido no primeiro uso do modo, pode ser pulado e permanece acessível em **Como jogar**. Preferência é local ao navegador e não expõe identidade nem dados da campanha.

## 6. Regras e unidades
- **Adaptado:** 15 m por célula tática no motor de movimento PTE, conforme `movementMetresPerHex`. A apresentação distingue quadrado e célula legada; não usa pés.
- **D&D:** 3 m por quadrado e 4,5 m para diagonal; bestiário legado convertido na borda do sistema, sem migração destrutiva.
- **GOT:** 10 m por quadrado, com fases próprias do livro.
- **Distâncias regionais:** km. **Massas e cargas:** kg. Nenhuma nova regra P2 introduz libras, pés ou milhas.

## 7. Segurança, persistência e compatibilidade
- `BATTLE_PLAYERS_ENABLED=false` permanece inalterado.
- Sem migrations, SQL em produção, alterações de contas, senhas, e-mails, HP oficial, posses ou HUB temporal.
- Campos `objective` e `objectiveProgress` são opcionais. O valor padrão é ausente e não modifica hashes de replays anteriores.
- Simulações com objetivo registram sua condição de vitória em evento de combate/replay reproduzível.
- A função de salvamento deve continuar sendo considerada **separada por motor**, não unificada em banco.
- Verificação de CI em banco descartável não comprova acesso autenticado de produção.

## 8. Plano de aceitação
| Verificação | Aceite exigido |
|---|---|
| Objetivo sobreviver / prazo defender | Resultado automático na rodada correta; sem empate por inatividade prematuro |
| Captura | Contagem apenas depois da rodada inteira; ocupação consecutiva; célula transitável |
| Replay com objetivo | `verifyReplay(captureReplay(...))` retorna estado idêntico |
| Replay histórico | Sem mudanças quando objetivo não está definido |
| IA | Escolhas dentro dos comandos legais e idênticas com mesma entrada |
| Tutorial | 3 passos; pular, concluir, reabrir; 3 modos |
| Touch e zoom mobile | Chromium 390×844; sem rolagem horizontal da página |
| TypeScript, build, banco | Jobs Validate + Battle browser sem falhas |

**Registro de execução:** substituir por estados reais do GitHub Actions após os checks da PR. Não reportar como aprovado antes dos resultados.

## 9. Dívida restante e proposta de P3
**Alto impacto:** teste Android físico autenticado do Narrador, auditoria completa de persistência depois de retomar em outro dispositivo e inspeção de contraste/toque com pessoas reais.

**Evolução de jogabilidade:** objetivos com múltiplos pontos e reforços, objetivos narrativos de defesa de ponte e fortificação, presets de comportamento da IA (agressiva, defensiva, artilharia), telemetria privada de abandonos de etapa e indicador de duração do confronto. Nenhum desses itens foi implementado nesta etapa.

## 10. Veredito V4
**Direção de produto:** UX com poucas decisões visíveis, regra completa escondida em detalhes, condição de vitória comunicada antes do primeiro turno e feedback de consequência depois de cada rodada.  
**Status final:** depende dos checks de CI e da aceitação autenticada em aparelho real; merge não equivale a publicação no site.
