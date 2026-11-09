# Cormyr — Espionagem · P1 / UX e Game Design
**Data:** 09/11/2026  
**Integração:** branch `feat/espionagem-p1-usabilidade-20261109` baseada sobre `fix/espionagem-p0-integridade-20261109`. P1 depende da validação e mesclagem de P0.

## Oito intervenções P1
| Código | Modificação | Critério |
|---|---|---|
| P1.1 | Auditoria das probabilidades 3D6 a 6D6, incluindo casos inalcançáveis sem modificadores. Fórmula de Lei e rolagens permanecem **inalteradas**. | Risco não é confundido com percentual arredondado. |
| P1.2 | Planejador compacto, apenas agentes disponíveis, região real pré-selecionada, mapa expansível. | Percurso de escolha com menos passos, sem criar origem fictícia. |
| P1.3 | Risco textual com orientação de escolha de agente e probabilidade inferior a 0,1% sem exibir zero falso. | Chances provêm da mesma RPC autenticada. |
| P1.4 | Narrador: rolagem, modificador e descoberta visíveis; guardas/cadeia e observações atrás de `details`. | Sem alterar a regra, versões, autorização ou a RPC. |
| P1.5 | Acompanhamento visual por fase: viagem, investigação, narrador; próximos prazos visíveis e datas dentro de painel expansível. | Usa estados e datas oficiais do HUB Temporal. |
| P1.6 | Erros de missão classificados com lista permitida; mantém diagnóstico específico de recrutamento já implementado. | Nenhum SQL, UUID ou dado de outra Casa exposto. |
| P1.7 | Campos de toque de no mínimo 44/48px, fontes mínimas de 16px em seletores móveis, modais ajustados à viewport. | Testes de contrato; revisão visual manual pendente. |
| P1.8 | Contagem de agentes disponíveis/em missão/indisponíveis, nível, Astúcia e barra de 0 a 3 sucessos. | Dados derivados das fichas, não inventados. |

## Revisão matemática de dificuldade — sem modificadores
Valores a seguir são exemplos arredondados, não possibilidades de detecção:
| Dificuldade | Verde 3D6 | Treinada 4D6 | Veterana 5D6 | Elite 6D6 |
|---|---:|---:|---:|---:|
| 9 | 74,1% | 94,6% | 99,3% | 99,9% |
| 12 | 37,5% | 76,1% | 94,1% | 99,0% |
| 15 | 9,3% | 44,4% | 77,9% | 93,9% |
| 18 | 0,5% | 15,9% | 50,0% | 79,4% |
| 21 | 0% | 2,7% | 22,1% | 54,6% |
| 24 | 0% | 0,08% | 5,9% | 27,9% |
| 30 | 0% | 0% | aproximadamente 0,01% | 2,0% |

**Diagnóstico:** um Verde não pode atingir DC 21 sem modificadores; DC 30 é improvável mesmo para Elite. Isto é um alerta de equilíbrio, não um erro de implementação da fórmula. Alterar a regra-base e introduzir bônus mecânicos requer decisão separada do Narrador; esta PR evita alterar o jogo existente silenciosamente.

## Regras preservadas
- Grau Verde/Treinada/Veterana/Elite = 3D6/4D6/5D6/6D6, promoção a cada três êxitos.
- Lei convertida uma vez em dificuldade, com proteções de construções adicionadas depois.
- Uma désdia = dez dias ordinários; nenhuma alteração no motor do calendário.
- Agentes, Casas e chances continuam validados por RPC autenticada; prévia não executa missão.
- Se descoberta e consequência forem necessárias, somente o Narrador resolve; compras, vagas e retratos continuam transacionais.

## Arquivos centrais
- `src/lib/espionage/spy-mission-probability.ts`
- `src/lib/espionage/spy-mission-errors.ts`
- `src/lib/espionage/spy-browser-client.ts`
- `src/components/house/espionage/spy-{regional-turns-panel,mission-odds-card,submit-house-mission,narrator-resolution,house-management}.tsx`
- CSS de planejador, probabilidades, agentes e resolução do narrador
- `src/test/espionage-p1-ux.test.ts` e atualização do teste existente do planejador

## Condições de aceite
1. CI completo e testes de espionagem passam.
2. Em tela de 360px e 768px: nenhuma rolagem horizontal em seletores, cartões, mapa e modal; controles acessíveis por toque/teclado.
3. Um agente 3D6 contra DC 21 mostra *inalcançável sem modificadores*; se a chance real for positiva mas arredondar para zero, mostra *menos de 0,1%*.
4. Trocar de agente redefine a região para sua localização real; trocar de região limpa a Casa-alvo.
5. O narrador conclui a operação e recebe o resultado ou alerta de dossiê do P0, mantendo chave idempotente durante retentativas com entrada igual.
6. A API não retorna atributos secretos via seleção pública; mensagens de erro nunca incluem o texto SQL bruto.
7. P0 deve estar completamente homologado e mesclado antes de publicar P1 em produção.

**Status:** código P1 preparado em branch; CI, revisão visual autenticada e deploy ainda não concluídos.
