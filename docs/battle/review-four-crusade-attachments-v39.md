# Análise de quatro anexos ZIP — Cruzada Cormyr (05/11/2026)

Os anexos contêm **quatro arquivos Markdown**. Nenhum executável, imagem, PDF ou código foi importado a partir dos ZIPs. Os arquivos foram lidos diretamente de suas entradas compactadas, sem executar conteúdo.

## Fontes e precedência
1. **`03-regras-cormyr-cruzada-passo-a-passo.md`** — documento **normativo** do motor experimental `CRZ-1.0`. O próprio cabeçalho determina precedência sobre os demais. Regras propostas marcadas 🔧 **não são valores oficializados ou calibrados**.
2. **`06-arquitetura-e-integracao-cormyr.md`** — estudo de integração e preservação do legado PTE-2.0; a análise foi feita no `main` antigo `0a08ec9` (05/11/2026) e precisa de revalidação com as branches V3.1–V3.8 atuais.
3. **`02-empilhamento-de-criaturas.md`** — pesquisa de dano de pilhas 5e, aritmética inteira, overkill, PV agregado e testes numéricos propostos. A existência de fórmulas não significa que elas já estejam no PTE-2.0.
4. **`01-wotr-crusade-como-funciona.md`** — pesquisa descritiva de referência sobre Pathfinder WotR, com diferentes níveis de evidência. Não equivale a autorização para copiar personagens, mapas, interfaces, recursos gráficos, ou assumir seus valores como regras de Cormyr.

## Leitura técnica com impacto nas próximas fases

| Origem | Regra/achado sustentado | Decisão aplicada ou pendente |
|---|---|---|
| 03 §0–2 | `CRZ-1.0` tem três presets diferentes: `CRZ-5E`, `CRZ-WOTR`, `PTE-2.0-compat`; configurações precisam de `rulesetHash` | **Pendente:** motor isolado `CRZ-1.0`, com testes numéricos; não modificar `domain/*` legado para fingir paridade |
| 03 §5–6 | Iniciativa compartilhada, uma ativação por pilha, `WAIT`, `DEFEND`, ZOC e movimento | **Mantido:** motor PTE-2.0 da arena local; `CRZ-1.0` possui ajustes futuros que dependem do novo ruleset |
| 02 §2.3, 03 §7 | `CRZ-5E` pede d20/crit/hybrid, dano em centésimos, overkill cap e PV agregado; `CRZ-WOTR` tem fórmula distinta | **Não implementado:** sem inserir fórmula de WotR dentro de `PTE-3.0-SANDBOX` |
| 03 §9–10 | General fora do tabuleiro, ações antes da tropa, energia não regenerada durante a luta, moral numérica dependente de RNG | **Parcial:** V3.7 já tem energia em treino; regeneração, moral numérica e RNG de `CRZ-1.0` aguardam versão própria |
| 03 §11 | Floresta/rocha bloqueiam visão; floresta/colina custam 2 de movimento; água/estrada/fortificação são futuras | **Mantido:** V3.8 ilustra cenários com os quatro terrenos herdados, sem criar pontes caminháveis ou água simulada |
| 03 §12 | Vitória por eliminação, debandada, impasse, limite de rodadas; **objetivos alternativos `segurar hex por K rodadas`, `escoltar` ficam para v1.1** | **V3.9:** somente uma proposta de **controle de hexágonos** isolada/versionada no treinamento local, sem alterar `CRZ-1.0` nem `PTE-2.0` |
| 03 §13, 06 §6.4.2 | Enfermaria opcional do simulador; resultados de casas reais dependem de revisão do Narrador | **Mantido:** nenhuma recuperação automática de baixas ou escrita oficial |
| 03 §16, 06 §6.4 | Camada estratégica é opcional e não deve interferir no calendário real; arquitetura sugere módulo apartado e flags | **Mantido:** V3.9 não grava dados de economia, tropas, governança ou tempo; futuro `CRZ` precisa de pacote/isolamento próprio |
| 06 §6.3.8 | `rulesVersion`, `schemaVersion`, `rulesetHash`, replay verificável; preservar PTE-2.0 | **V3.9:** campo adicional `objectives.rulesVersion` na arena local. Não é um replay CRZ; nenhum replay remoto foi migrado |

### O que NÃO está nos anexos
- Não vieram os documentos `00-LEIA-ME.md`, `04`, `05` (biblioteca de criaturas/dados) nem `07` (simulador/calibração) referenciados em `06` e `03`.
- Logo, **não é possível confirmar** a cobertura do bestiário, a tabela de dados 5e, nem a paridade quantitativa de `CRZ-5E`/goldens completos sem esses materiais.
- A duração **dois** e a condição **dois de três** marcos **não vêm do manual**; são decisões experimentais novas e explícitas da V3.9, sujeitas à aprovação do Narrador.

## Restrições para IA e agentes de desenvolvimento
- Não copiar ativo, ícone, retrato, classe ou interface proprietária de WotR/Owlcat ou dados protegidos de 5etools para o repositório.
- Não alterar a semântica e o hash de partidas PTE-2.0/V3.4 antigas.
- Não aplicar baixa de pilha à ficha real sem dossiê de autorização V3.5 e transação específica.
- Motor puro, sem `Math.random`, sem `Date.now`, sem acesso ao Supabase, sem inferir bônus militares de descrições textuais.
- Operações com oficial/expediente/pessoal exigem checagem de Narrador e RLS; V3.9 não precisa dessas permissões porque usa apenas casas-modelo.
- Só integrar no `main` após revisão de equilíbrio, CI e homologação das dependências de PR.

## Próximo passo separado da V3.9
Abrir uma nova iniciativa `CRZ-1.0` com `RulesetConfig`, schema, hash, formas de dano auditáveis e casos T-PIL-01…10 de `02`, em pacote isolado. **Não** rotular as habilidades ou dano da V3.7 como CRZ-5E até que a implementação corresponda realmente à documentação.
