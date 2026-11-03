# Adendo de balanceamento — Defesa de Espionagem de Casas sem ficha

**Decisão do Narrador:** 03/11/2026. **Escopo:** PR #223 (não publicado).

## Regra final para o cálculo

1. **Investigar uma região:** dificuldade basal da Lei regional pública (`regionBonus(region).law`). Não envolve defesa de Casa.
2. **Investigar Casa com ficha criada:** Lei efetiva da **própria Casa** calculada por `balances(sheet.state).total.law` + bônus de posses defensivas ativas e aplicáveis ao domínio/ação. Não adicionar bônus basal regional e **não somar +10**. A ficha existente em `draft`, `review` ou `active` conta como ficha — sua aprovação não determina o fallback.
3. **Investigar Casa sem ficha criada:** `Lei NPC = Lei basal da região da Casa + 10`; não presumir construções, equipamentos, bonificações extras ou porcentagens. O +10 representa um valor inicial de Lei de segurança do NPC, **não** um incremento em outra Lei. Uma Casa com ficha não pode ser reclassificada como sem ficha só porque o acesso à ficha falhou.
4. Uma região desconhecida ou cadastro divergente produz revisão pendente, nunca Lei 0 presumida. O resultado de defesa só pode ser consultado por autorização narratorial; atacantes podem ver nome, região e se a Casa é alvo elegível, não sua Lei nem sua defesa oculta.

Implementação pura: `src/lib/espionage/spy-house-target-defense.ts`. Regressão: `src/test/espionage-npc-defense.test.ts`.

## Valores de referência: 11 regiões

| Região | Lei basal regional | Casa NPC sem ficha (Lei +10) |
|---|---:|---:|
| Crownlands | 20 | 30 |
| Elfhold | 15 | 25 |
| Helmlands | 10 | 20 |
| Shieldmark | 10 | 20 |
| Swordmarch | 10 | 20 |
| Ferlin | 10 | 20 |
| Veilstone | 5 | 15 |
| Horselands | 5 | 15 |
| Volkumburgh | 5 | 15 |
| Dragon Coast | 0 | 10 |
| Stonelands | 0 | 10 |

## Evidência do ambiente vivo (apenas leitura)

- `house_catalog`: **172 Casas**, com `public_reviewed=true`, em 11 regiões (161 classificadas como `noble`, 10 `major`, 1 `royal`).
- `noble_house_sheets`: **8 fichas** (incluindo duas em rascunho); portanto há 164 nomes do catálogo sem ficha independente no momento, salvo mudança posterior.
- Amostras dos componentes brutos de Lei nas fichas atuais: Ashkar 30, Erdenor 30, Everlost 40, Fewmerry 22, Silversky 27; Goldfin 21 pontos permanentes, Harcourt 30 permanentes em rascunho, Grantass 2 pontos de base. **Não tomar valores brutos como substitutos do cálculo `balances`**, que também pode incluir eventos, história, vínculos, etc.
- **Inconsistência cartográfica a revisar:** `campaign_houses` e `house_catalog` põem Silversky em Horselands, mas `state.identity.region` da ficha indica Dragon Coast. Usar território oficial aprovado para seleção, e não trocar automaticamente a região.
- A tabela `house_catalog` possui RLS/grants de leitura específicos; a lista prévia de alvos da UI usa apenas `campaign_houses`, razão pela qual NPCs do catálogo necessitam de **projeção autenticada e auditada de ID/nome/região** antes de serem selecionáveis. Não liberar acesso ao JSON privado de arquivo.

## Avaliação de balanceamento

**Pontos favoráveis:** a defesa NPC não fica em zero mesmo nas regiões de Lei 0; valor previsível, regionalmente diferenciado; não obriga criação de 164 fichas; o investimento real dos jogadores em Lei e posses defensivas permanece relevante.

**Riscos:** não há paridade necessária com Casas de jogador. Um NPC típico de Dragon Coast tem 10, enquanto uma Casa com Lei 30 teria valor três vezes maior; em Horselands o NPC típico tem 15, e valores de Lei das fichas podem chegar à ordem de 40. Uma Casa de jogador com Lei excepcionalmente baixa (p.ex. base 2) **não** recebe o piso NPC. Isso é coerente com a regra escolhida, mas precisa ser consciente. Casas `major` e `royal` sem ficha também teriam apenas a defesa regional+10; o Narrador pode autorizar um ajuste específico posterior, mas **nenhuma majoração automática** foi adicionada.

**Conclusão:** `+10` é um **padrão inicial defensável para NPC comuns**, não um balanceamento probabilístico comprovado. A adequação absoluta exige confrontar o valor contra a escala real de resultados de espionagem (Astúcia/dados, qualidades e contramedidas), com resultados de sessões e sem inventar probabilidades. Recomendação: manter +10, registrar exceções de Casas especiais pelo Narrador apenas após justificar no lore, e revisar o padrão após uma amostra de missões concluídas.

## Limites de entrega deste PR

O cálculo foi implementado de forma testável, mas o servidor de adjudicação, a exposição segura do catálogo de 172 Casas e as operações de missões continuam sujeitos ao gate de homologação. **Não alterar o banco de produção nem anunciar liberação total de missões.**
