# Cormyr — importação oficial de atributos nobres para missões de espionagem

**Origem:** [Cormyr — Atributos das Casas Nobres]([fonte privada no Drive do Narrador]) · aba **Atributos das Casas**, células A1:O171.  
**Revisão observada:** 03/11/2026 18:14:40 UTC.  
**Importação original (já executada no Supabase):** registros mantidos no banco. O arquivo público `docs/espionage/sql/0087_import_cormyr_noble_stats_2026_11_03.sql` foi higienizado e mantém somente o esquema e as funções, sem as 170 fichas confidenciais.  
**Situação:** tabela de referência e RPCs instaladas no banco de produção; UI de administração e origem de missões em revisão no PR #223.

## Inventário conferido

| Verificação | Resultado |
|---|---|
| Fichas oficiais no arquivo | **170** |
| Regiões distintas | **11** |
| Casas de `house_catalog` existentes | **172** |
| Registros oficiais que correspondem a uma Casa cadastrada | **170 de 170** |
| Divergência de nome ou região | **0** |
| Divergência no somatório dos sete atributos ou orçamento | **0** |
| Divergência após a importação, comparando os 170 registros e 7 atributos com a planilha | **0** |
| Fichas operacionais preservadas (`noble_house_sheets`) | **8** |
| Missivas preservadas | **111** |
| Ledger econômico preservado | **30** |
| Agentes preservados | **4** |
| Missões ativas | **0** |

### Casas ausentes da planilha (mas presentes no cadastro)

**Montgomery**, em Veilstone, e **Obarskyr**, em Helmlands. Para estas duas, e somente na ausência de uma ficha operacional, mantém-se **Lei basal da região +10** como referência provisória. Não criar atributos fictícios em `noble_house_sheets` ou em `spy_noble_house_stats`.

### Prioridade da fonte (sem misturar bônus regionais)

1. **Casa com ficha operacional**, mesmo em rascunho: usar `balances(state).total.law` da própria Casa e seus bônus de construções realmente ativas no domínio pertinente. **Nunca** aplicar a Lei basal da região sobre a ficha.
2. **Casa sem ficha operacional mas presente no arquivo oficial**: usar o valor de **Lei exato da planilha**. Sem construções comprovadas como adquiridas, o bônus adicional de construção é **zero**.
3. **Casa sem ficha operacional e sem entrada no arquivo**: usar `regionBonus(region).law+10` como último recurso, com sinalização explícita de valor provisório.
4. **Investigação da região sem Casa-alvo**: usa só a Lei basal regional do catálogo do sistema.

**Importante:** as abas `Compras — ...` descrevem aquisições planejadas, propostas, simuladas e algumas fichas autorais oficiais. Essas abas não constituem comprovante de compra efetivamente registrada no motor econômico. Por isso nenhuma infraestrutura, recurso, atributo de jogador ou posse foi importado como ativo a partir da simulação. As fichas autorais Mareforte, Qazir e Everet estão representadas nos sete atributos da aba principal, conforme sua fonte oficial, sem reescalonamento.

### Segurança e exposição

- A tabela `public.spy_noble_house_stats` contém os 170 registros com atributos, região, hierarquia, suserania e proveniência. RLS habilitado; leitura da tabela restrita ao Narrador. Jogadores não podem consultar os atributos privados por SQL direto.
- A função `spy_public_noble_targets()` retorna apenas **ID, nome e região** dos 172 registros oficialmente revisados de `house_catalog`.
- A função `spy_narrator_noble_defense_source(text)` verifica sessão/atividade/administração e fornece ao Narrador apenas a indicação da fonte correta e o valor da Lei importada. O acesso à ficha operacional e à defesa final é feito em função de servidor adicional com rechecagem de autorização.
- O frontend dos jogadores **não recebe a Lei nem a defesa da Casa-alvo**. O Narrador pode consultar a origem e o cálculo de defesa.
- Nenhuma das 8 fichas operacionais foi substituída; nenhum lançamento econômico, missiva, construção ou calendário foi modificado.

### Gerenciamento dos agentes (adição sem efeito imediato)

As RPCs `spy_house_management(text)` e `spy_rename_agent(text,uuid,text,integer,uuid)`, do roteiro `0086_spy_house_management_REVIEW_ONLY.sql`, foram validadas num ensaio com transação revertida e depois instaladas em produção, a pedido anterior do Narrador. A primeira permite à Casa consultar seus próprios agentes; a segunda permite nomear o agente com versão de concorrência, autorização de edição e trilha de auditoria. Nenhuma renomeação, missão ou alteração de recursos foi executada na instalação. `anon` não possui permissão de EXECUTE nas funções.

### Pendências de produto

A importação e as funções privadas de gerenciamento foram instaladas no Supabase, mas o código da nova interface do PR #223 precisa de validação e incorporação antes de serem mostrados na aplicação pública. A criação e o processamento automático de missões permanecem desativados. Falta comprovação de backup restaurável para homologar o módulo transacional completo.
