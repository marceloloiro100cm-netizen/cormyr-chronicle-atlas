# Auditoria da Gestão Militar da Casa — 31/10/2026

## Objetivo e critério

A seção **Gestão militar da Casa**, abaixo das unidades, deve exibir exclusivamente investimentos cujo **efeito próprio explícito** modifique pelo menos uma das seguintes dimensões: **defesa/ataque/armadura/baixas/disciplina/habilidades de unidades; recrutamento, mobilização ou custo de tipos de unidades; fortificações com Defesa de unidade; armamentos e logística diretamente associados a cerco ou navios de guerra**.

**Não basta** usar nome de cunho militar, melhorar Sorte, aumentar Poder/Riqueza/Lei, produzir matéria-prima, mitigar perdas econômicas decorrentes de batalha, proteger contra espionagem individual ou **ser pré-requisito civil** para uma melhoria militar. A posse civil fica na Economia/Patrimônio e pode ser comprada normalmente ali; apenas sua melhoria militar recebe card.

**Fonte inspecionada:** `src/lib/house/prosperity-catalog.json` (173 entradas), `src/lib/house/catalog.ts` (fortificações do livro básico), `src/lib/house/engine.ts` (efeitos e requisitos), e lista anterior `MILITARY_HOLDINGS`. Catálogo Prosperidade: **28** itens aprovados e **145** não selecionados (18 que apareciam indevidamente e 127 que já estavam fora). Fortificações básicas: **5** incluídas. Armamentos de cerco continuam no painel próprio e não são duplicados como posses neste bloco.

## Resultado

| Classificação | Quantidade |
|---|---:|
| Itens antes da auditoria | 51 |
| Mantidos — efeitos militares próprios | 33 |
| Removidos — civis, pré-requisitos ou efeitos indiretos | 18 |
| Novos itens adicionados | 0 |

## Itens mantidos

| # | Posse / construção | Efeito militar justificando o card |
|---:|---|---|
| 1 | Torre (`tower`) | +3 de Defesa para unidades estacionadas. |
| 2 | Salão (`hall`) | +4 de Defesa para unidades estacionadas. |
| 3 | Castelo pequeno (`small-castle`) | +6 de Defesa para unidades estacionadas. |
| 4 | Castelo (`castle`) | +8 de Defesa para unidades estacionadas. |
| 5 | Castelo superior (`superior-castle`) | +12 de Defesa para unidades estacionadas. |
| 6 | Produção de Alcatrão (`pros-charcoal--tar-works`) | Reduz em 1 o custo de unidades navais Ships. |
| 7 | Cães de Rastreamento (`pros-dog-kennels--scouting-hounds`) | Batedores: +2B em Sobrevivência (Rastreamento) e +1 de dano corpo a corpo. |
| 8 | Cães de Guerra (`pros-dog-kennels--war-hounds`) | Unidades elegíveis equipadas com cães: +1B no ataque corpo a corpo e +2 de dano. |
| 9 | Armadilheiros (`pros-fur-trade--trappers`) | Reduz em 2 o custo de unidades Guerrilheiras. |
| 10 | Cavalos de Guerra (`pros-horse-husbandry--war-horse-herds`) | Reduz em 2 o custo de Cavalaria. |
| 11 | Estaleiros (`pros-timber--ship-yards`) | Reduz em 2 o custo de unidades navais Ships. |
| 12 | Festivais Marciais (`pros-festivals--martial-festivals`) | Plebeus recrutados começam com −3 de Disciplina. |
| 13 | Arqueiro/Flecheiro ou Armeiro (`pros-bowyer-fletcher-or-weaponsmith`) | Unidades recebem +1 de dano em Pontaria (Arqueiro) ou Luta (Armeiro). |
| 14 | Pedreiro (`pros-stonemason`) | +1 em Guerra ligado às comunidades e fortificações da Casa; reduz o prazo das fortificações. |
| 15 | Construtor Naval (`pros-shipwright`) | Reduz em 2 o custo de Navios de Guerra. |
| 16 | Treinamento Militar (`pros-bailiffs--military-training`) | Oficiais atuam como Guarnição Treinada na área designada, consumindo 1 Lei. |
| 17 | Engenheiro (`pros-engineer`) | +1 de Defesa para unidades em fortificações da Casa; reduz prazos de construções militares. |
| 18 | Engenheiro de Cerco (`pros-engineer--siege-engineer`) | Reduz em 1 Riqueza o custo de máquinas e torres de cerco. |
| 19 | Engenheiro Comandante (`pros-engineer--engineer-commander`) | Subcomandante de Engenheiros com Guerra 4; custo de Engenheiros −1. |
| 20 | Mestre de Armas (`pros-master-of-arms`) | Primeira melhoria de 1 Riqueza gratuita para cada unidade e +1 na rolagem de sobreviventes. |
| 21 | Mestre de Campo (`pros-master-of-arms--field-master`) | Subcomandante com Guerra 4 e −1 no custo de seu tipo de unidade especializado. |
| 22 | Preparado para Cerco (`pros-master-of-arms--prepared-for-siege`) | Unidades estacionadas recebem +1 de Absorção de Armadura e suprimentos para seis meses de cerco. |
| 23 | Irmandade Guerreira (`pros-abbey--warrior-brotherhood`) | Reduz em 1 o custo de Cruzados; a Abadia concede +2 de Defesa a uma unidade. |
| 24 | Esportes Sangrentos (`pros-gambling-dens--bloodsports`) | Reduz em 2 Poder o custo de Plebeus recrutados. |
| 25 | Prisão (`pros-gaol`) | Reduz em 2 o custo de Criminosos ou Guarnição; em guerra funciona como Salão. |
| 26 | Carcereiros (`pros-gaol--jailors`) | Carcereiros atuam como Guarnição Treinada, com Percepção e Astúcia +1. |
| 27 | Academia Militar (`pros-military-academy`) | Reduz em 1 a perda de habilidades das unidades causada por dano de Guerra. |
| 28 | Treinamento Amplo (`pros-military-academy--broad-training`) | Uma ação da Casa acrescenta uma quarta habilidade disponível a uma unidade. |
| 29 | Treinamento Fundamental (`pros-military-academy--core-training`) | Todas as unidades recebem +1 na habilidade escolhida conforme decisão do Narrador. |
| 30 | Docas Secas (`pros-port--drydocks`) | Navios de Guerra ignoram até 2 pontos de penalidade em Unidades e Baixas. |
| 31 | Gangues de Rua (`pros-street-gangs`) | Reduz em 2 o custo de Plebeus recrutados. |
| 32 | Capangas de Prontidão (`pros-street-gangs--thugs-at-the-ready`) | Mobiliza uma unidade de Criminosos Treinados em 1d6 horas para conflitos de grande escala. |
| 33 | Estalagem Comercial (`pros-trading-inn`) | Na defesa, funciona como fortificação e concede +2 de Defesa a uma unidade. |

## Itens retirados da Gestão Militar (sem excluir do patrimônio)

| # | Posse retirada | Motivo |
|---:|---|---|
| 1 | Carvoaria (`pros-charcoal`) | Sorte e custo de artesãos; somente Produção de Alcatrão reduz o custo naval. |
| 2 | Canis (`pros-dog-kennels`) | Sorte, Mestre da Caça e preço pessoal de cães; melhorias específicas trazem bônus às tropas. |
| 3 | Cães de Guarda (`pros-dog-kennels--guard-dogs`) | Dificulta sabotagem e espionagem; não melhora atributos, dano ou baixas de unidades. |
| 4 | Comércio de Peles (`pros-fur-trade`) | Somente Sorte; o desconto para Guerrilheiros pertence aos Armadilheiros. |
| 5 | Criação de Cavalos (`pros-horse-husbandry`) | Sorte, Riqueza e cavalos pessoais; a redução de custo da Cavalaria está em Cavalos de Guerra. |
| 6 | Exploração Madeireira (`pros-timber`) | Somente Sorte; o desconto a unidades navais está nos Estaleiros. |
| 7 | Festivais Anuais (`pros-annual-festivals`) | Bônus sociais de Intriga; nenhuma unidade beneficiada diretamente. |
| 8 | Festivais Sazonais (`pros-seasonal-festivals`) | Mitigação de População e Intriga; Festivais Marciais é a melhoria militar. |
| 9 | Festivais Mensais (`pros-monthly-festivals`) | População e Intriga; Festivais Marciais é a melhoria militar. |
| 10 | Oficiais de Justiça (`pros-bailiffs`) | Contatos, Lei e perdas administrativas da guerra; Treinamento Militar forma guarnição. |
| 11 | Treinamento Investigativo (`pros-bailiffs--investigative-training`) | Proteção contra assassinos, espiões e sabotadores; não é bônus a unidade ou combate de massa. |
| 12 | Magistrado (`pros-magistrate`) | Mitiga perdas de Lei após derrota; não altera a batalha nem atributos das unidades. |
| 13 | Abadia (`pros-abbey`) | Sorte e ganhos de recursos; a Irmandade Guerreira é a melhoria defensiva. |
| 14 | Casas de Jogo (`pros-gambling-dens`) | Ganhos de Poder/Riqueza e penalidade de Lei; Esportes Sangrentos reduz custo das tropas. |
| 15 | Porto (`pros-port`) | Somente bônus de Sorte; Docas Secas reduz penalidades dos Navios de Guerra. |
| 16 | Mercado (`pros-marketplace`) | Bônus de Riqueza e comércio; não concede efeito próprio às unidades. |
| 17 | Mercado de Escravos (`pros-slave-market`) | Conversão de recursos; não concede efeito próprio ao combate ou às unidades. |
| 18 | Escravos Soldados (`pros-slave-market--soldier-slaves`) | Ganho econômico após captura/vitória; não melhora luta, defesa, recrutamento ou dano da unidade. |

## Regras de apresentação, integridade e compras

- O resumo do card mostra **o benefício militar próprio**, não uma descrição civil genérica. A descrição integral, efeitos adicionais, custos e requisitos da fonte permanecem no card expandido.
- Uma melhoria militar continua visível mesmo quando sua posse principal é civil (por exemplo, Armadilheiros requer Comércio de Peles). A dependência aparece **apenas no detalhe do card**, que encaminha a compra da posse principal ao setor de Economia; a compra da melhoria continua bloqueada até cumprir requisitos.
- O controle **Não adquirido / Em construção / ativo com nome** e o botão **Comprar / Sem recursos / Pré-requisitos pendentes** permanecem; continuam usando a mesma cotação e fluxo transacional do Patrimônio, sem débito alternativo.
- Posses civis existentes, como Carvoaria e Comércio de Peles, **não foram apagadas nem alteradas**, e seus recursos e projetos seguem preservados. A alteração é apenas de classificação da área e da permissão de renomear por este módulo.
- A listagem não presume que todo efeito do suplemento esteja automatizado no motor da batalha. Bônus dependentes de decisões explícitas do Narrador, escolha de especialização ou atualização de regras permanecem descritos sem criar modificadores arbitrários.

## Verificações automatizadas

`src/test/house-military-assets.test.tsx` deve verificar o conjunto completo de 33, ausência dos 18 civis, presença de melhorias militares dependentes, descrição dos pré-requisitos, funcionamento da compra e preservação das posses existentes.
