# Batalha · Lotes 1–3 (9 novembro 2026)

## Lote 1 — Navegação e retomada
- O hub abre o salvamento PTE apenas no Adaptado; GOT retoma o snapshot local validado no mesmo navegador; D&D abre o painel privado da conta do Narrador.
- Saída com progresso não salvo solicita confirmação em GOT, V3 e CRZ/D&D. Persistência e replays matemáticos continuam específicos por motor.
- Limitação: biblioteca persistente universal e sincronização entre dispositivos continuam em lote futuro.

## Lote 2 — Arena e legibilidade
- `BattleTurnCue` mostra modo, rodada, fase, unidade ativa, ações legais e orientação contextual em GOT, Adaptado V3 e CRZ/D&D.
- Botão de focar a unidade ativa funciona em V3 e CRZ/D&D. Mapa, IA, fórmulas, RNG, versões de replay e símbolos oficiais não sofrem alterações.
- A ampliação da arena existente é preservada; novo cabeçalho operacional responsivo.

## Lote 3 — Montador D&D
- Mantidos seletor único por lado, criação de pilhas de 1 a 7, edição direta e posicionamento automático.
- Filtros avançados de tamanho, fonte e faixa de ND; busca por nome ou fonte, prévia de PV/CA/ND/porte, totalizadores por lado, duplicar pilha e restaurar modelo.
- Editor privado, importação de CSV/JSON e implantação manual permanecem ocultos na preparação D&D.
- Limite por porte aplicado também na edição de quantidades; composição não altera unidades oficiais.

## Gates
- Validar TypeScript, testes de interface Vitest, build e navegador sintético no SHA final.
- Testar como Narrador autenticado, com 300 criaturas, salvar/reabrir, responsividade no celular, GOT e Adaptado intactos.
- Não liberar jogadores nem publicar em produção até aceite de homologação. Nenhuma alteração SQL, política RLS ou dados da campanha.
