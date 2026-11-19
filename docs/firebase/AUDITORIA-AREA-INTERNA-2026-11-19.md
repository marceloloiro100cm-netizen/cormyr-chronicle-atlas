# Auditoria da área interna (Conselho) e dos dados importados ao Firebase

Data: 19/11/2026. Escopo: revisão de código (sem acesso de leitura ao Firestore Cloud).
Nenhum dado privado, UID, texto de missiva ou hash de snapshot aparece neste documento.

## 1. Estado da área interna após o login

A interface original (PR #598) está ativa em `/firebase-access`, mas **todas as telas ainda
leem dados de demonstração** (`src/lib/visual-preview`). Nenhuma missiva, espião, missão,
vassalo ou registro real está ligado a ela. Toda gravação responde "Prévia visual: esta ação
ainda não está conectada ao Firebase".

A verificação de contagens reais no Cloud não foi possível: a identidade GitHub de leitura
(`cormyr-gh-reader`) continua recebendo **HTTP 403 do Firestore** (execução de 18/11, issue #513).

## 2. Missivas: filtros e referências

### Contrato dos filtros (validado)

`src/lib/mail/mail-page-contract.ts` reproduz literalmente as funções SQL originais
(`mail_page` 0074, `mail_trash_page` 0069, `mail_insights` 0037, `mail_overview_grouped` e
`mail_insights_grouped` 0047, `mail_recipient_read` 0037, `can_read_letter_as` 0035,
`can_read_reply` 0019) e é usado pela prévia. `src/test/mail-page-contract.test.ts` cobre:
visibilidade por perfil (Narrador, Casa A, Casa B, Editor-Chefe), Caixa (recebidas, enviadas,
cópias para mediação, programadas, rascunhos, histórico, excluídas, lixeira), Grupo de narração,
Casa destinatária, Casa remetente (inclusive "Sem vínculo"), Membro da corte, Unidade militar,
Semana, Tipo, Resposta (todas as opções do Narrador e do jogador), Minha leitura, Busca,
indicadores, recibo do destinatário e paginação. É o mesmo contrato a usar no conector Firestore.

### O que os dados importados ao Cloud permitem hoje

| Filtro / referência | Campo de origem | No estágio Cloud `migrationDomainStage/letters` |
|---|---|---|
| Caixa, Tipo, Casa destinatária, Casa remetente, Semana | `publication_state`, `letter_kind`, `recipient_house_id`, `origin_house_id`, `delivery_week`, `letter_number` | Presentes |
| Membro da corte | `court_member_id`, `court_assignment` | **Ausentes** (não copiados pelo importador tipado) |
| Unidade militar | `military_unit_id` | **Ausente** |
| Legado / destinatário histórico | `historical_recipient_name`, `historical_source` | **Ausentes** |
| Conversa e lote | `conversation_id`, `batch_key` | **Ausentes** |
| Resposta, Busca em respostas, Aguardando Casa/Narrador | `letter_replies` | **Não estão no Cloud** (estágio de histórico só no emulador) |
| Minha leitura, "lida pelo destinatário" | `letter_receipts` | **Não estão no Cloud** (só recibos novos do runtime) |
| Rodadas e período Harptos | `letter_rounds` | **Não estão no Cloud** |
| Versões, notas do Narrador, consequências | `letter_versions`, `narrator_mail_notes`, `campaign_letter_consequences` | **Não estão no Cloud** |

Achado crítico: `stage-typed-domain-emulator.mjs` envia para a quarentena *deny-all* toda carta
sem Casa e sem jogador destinatário. No modelo original esse formato **é a missiva endereçada ao
Narrador** (`mailRecipientLabel` → "Narrador"). Hoje essas cartas não aparecem para ninguém,
o que também esvazia "Recebidas" do Narrador e "Aguardando resposta do Narrador".

A leitura Cloud atual (`listMailbox`) devolve no máximo 30 cartas entregues, sem filtros, e falha
acima de 500 cartas importadas.

## 3. Espiões e missões

O importador `stage-spy-emulator.mjs` cobre 17 tabelas (agentes, histórico, melhorias, remoções,
retratos, locais, operações, segmentos, eventos, decisões, linha do tempo, dossiês, achados,
prêmios, eventos de inteligência, auditoria administrativa) e **só grava se 100% das linhas de
origem forem convertidas sem erro** (`coverageComplete` e zero `issues`). Se o estágio Cloud
`migrationSpyStage` estiver `complete`, todos os espiões e missões foram importados.

A API Cloud, porém, expõe somente:
- agentes: `id`, `codename`, `status`, `missionSuccesses`, `portraitId`;
- dossiês e achados já revelados.

A tela original também precisa de operações em curso, linha do tempo das missões, histórico do
agente, posto e Astúcia, região atual, origem do recrutamento, vagas, melhorias, remoções, rotas
regionais e alertas de contraespionagem. Nenhum desses dados é lido do Cloud ainda.

## 4. Vassalos, corte e exército

Vassalos, corte, unidades e posses fazem parte do `state` da ficha (`noble_house_sheets`), que a
ação `getHouse` devolve inteiro. Portanto **os vassalos estão presentes sempre que a ficha Cloud
os contiver**. Na cópia conciliada do repositório (29/10), Ashkar tem 1 vassalo (Qazir) e Everlost
tem 1; as demais Casas não têm vassalos e nenhuma tem corte cadastrada.

Os vínculos de NPC dos vassalos e da corte apontam para `campaign_records`, que **não estão no
Cloud**; esses vínculos não abrirão até que os registros sejam importados.

## 5. Registros da Casa, documentos, galeria e fichas de personagem

`campaign_records` e `record_versions` só têm estágio de emulador (`stage-records-emulator.mjs`).
Não há estágio Cloud nem ação de leitura: as abas Casa, Documentos, Galeria e as fichas de
personagem não têm dados reais disponíveis.

## 6. Casas

`listHouses` não devolve a região; o grupo de narração e a identidade visual devem vir do catálogo
público. O relatório de 18/11 cita 10 Casas ativas da temporada 2 no snapshot, enquanto o roster
oficial tem 8 jogadores: confirmar quais são as duas Casas adicionais antes de ligar os filtros.

## 7. Jornal e calendário

Só edições publicadas ou arquivadas são lidas. Rascunhos, encomendas das Casas, equipe, gravuras,
modelos e contagem de leituras não têm leitura Cloud. O calendário (`getCalendar`) está disponível.

## 8. Próximos passos sugeridos

1. Corrigir o importador tipado de missivas: manter as cartas ao Narrador (com
   `recipientKind: 'narrator'`) e copiar `court_member_id`, `court_assignment`,
   `military_unit_id`, `conversation_id`, `batch_key`, `historical_recipient_name` e
   `historical_source`. Exige nova importação pelo proprietário.
2. Publicar no Cloud o estágio de histórico de missivas (respostas, recibos, rodadas, versões).
3. Publicar no Cloud o estágio de registros (Casa, documentos, galeria, fichas, NPCs).
4. Criar a leitura Firestore de missivas usando `mail-page-contract.ts` no servidor (mesmos filtros,
   totais e paginação), no lugar de `listMailbox`.
5. Expor no servidor as leituras de espionagem que a tela original usa.
6. Liberar leitura à identidade GitHub (#513) para conferir as contagens reais de cada estágio.
