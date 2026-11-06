# CRZ-1.0 — Lote 9: marcos de observação e relatório pós-batalha

**Linha canônica:** #282 → #283 → #284 → #285 → #286 (L7) → #287 (L8) → este lote. Nenhum merge/deploy para produção nesta entrega.

## Marcos de observação (somente leitura)
- Três locais marcados por mapa: **Estrada de Cormyr, Colina de vigia e Depósito de suprimentos**.
- Escolha determinística dos hexágonos caminháveis fora das zonas de implantação, também em mapas 11×9 e 15×11, inclusive passagens e rochas.
- Ocupante (Coroa/Ashkar/livre) calculado diretamente das pilhas capazes; pilhas destruídas ou debandadas não controlam marcos.
- **Não há pontuação automática, condição de vitória nova nem registros persistentes.** O motor de turnos, regraset e replay permanecem autoridades.

## Relatório derivado de replay
- `src/lib/crusade/insights.ts` gera objeto versionado **CRZ-REPORT-1**, somente após `crzVerifyReplay` reexecutar integralmente os comandos, negar adulteração e validar a cadeia SHA-256.
- Totais por lado: tropas iniciais/sobreviventes/baixas fictícias, PV originais/restantes, pilhas debandadas, dano causado/recebido (ataque, retaliação e magia) e conjurações.
- Metadados: ID, seed explícita, preset + hash, rodada, resultado, comandos e hash final do replay.
- UI do Narrador exibe marcos no mapa e nos cards, tabela por exército e botão para **exportar relatório JSON local**. Nenhum novo endpoint, tabela ou autorização de edição.
- Relatório **não é assinatura digital nem documento oficial da campanha**. Para verificação por terceiro, arquivar junto com o replay JSON original.

## Segurança e testes
- `src/test/crusade-crz10-lot9-insights.test.tsx` valida 4 cenários × 2 tamanhos, terreno/deployment, estabilidade e não mutação, estatística derivada de evento de magia, falha para replay adulterado, renderização, tabela e marcador SVG.
- Vitest, TypeScript, build, browser acceptance sintético existente e testes PostgreSQL descartáveis precisam estar verdes; não afirmar homologação visual da nova UI sem navegador com conta de Narrador.
- Nenhum efeito em `PTE-2.0`, `HouseState`, economia, missivas, gestão de tropas, calendário, banco ou aplicação de baixas reais.
- Feature flag do Lote 7 continua **opt-in e restrita ao Narrador**: `VITE_ENABLE_CRZ_TRAINING=true` apenas em ambiente de homologação após revisão.
