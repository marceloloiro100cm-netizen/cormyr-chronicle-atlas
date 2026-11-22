/**
 * Calendário de Festivais — Cormyr, extraído do documento Festivais.docx
 * https://docs.google.com/document/d/1lSTlLoVHTnV392ZswiPj-oko_ma9pnGY/edit
 *
 * Importar apenas as 25 celebrações ausentes do catálogo anual estático.
 * EXCLUÍDOS: seis intercalares de Harptos; doze Altos Festivais de Waukeen;
 * quatro solstícios/equinócios. Permanecem exatamente onde já aparecem.
 *
 * Datas divergentes no documento (quadro inicial x narrativa):
 * - Caravançarai de Proskur: 2 x 1 de Tarsakh.
 * - Assembleia das Casas: 11 x 7 de Tarsakh.
 * - Benção Douradas: 22 x 10 de Tarsakh.
 * O quadro principal foi a autoridade adotada nesta importação.
 * - Estilhaçar consta em 15 de Ches no quadro, mas a descrição diz
 *   que a data pode variar regionalmente.
 *
 * Ressurreição Verdadeira aparece somente no quadro, sem seção descritiva.
 * Registros têm início em 1522 CV, primeiro ano do catálogo desta importação.
 */
const ROWS=[
  {
    "key": "new-years-revel",
    "month": 0,
    "day": 1,
    "durationDays": 1,
    "name": "New Year’s Revel",
    "description": "Celebração do Ano Novo de Harptos: encontros, banquetes, brindes em memória de pessoas queridas e votos para o novo ciclo. Em Cormyr, também marca a revisão de alianças e decisões entre as Casas.",
    "aliases": []
  },
  {
    "key": "vespera-midwinter",
    "month": 0,
    "day": 30,
    "durationDays": 1,
    "name": "Véspera de Midwinter",
    "description": "Vigília anterior ao Meio-Inverno, observada de modos distintos por diversas religiões, entre elas os cultos de Deep Duerra, Ibrandul, Kiaransalee e Yurtrus.",
    "aliases": []
  },
  {
    "key": "grande-revelacao",
    "month": 1,
    "day": 14,
    "durationDays": 1,
    "name": "Grande Revelação",
    "description": "Festival de música, dança, doces e encontros românticos. O clero de Lliira, Sharess e Sune organiza rodas de dança, banquetes do amor e trocas de presentes.",
    "aliases": [
      "Grand Revel",
      "Grande Revel"
    ]
  },
  {
    "key": "estilhacar",
    "month": 2,
    "day": 15,
    "durationDays": 1,
    "name": "Estilhaçar",
    "description": "Festival de Valkur ligado ao fim do gelo, à primavera e ao começo da temporada de navegação. O quadro do documento o fixa em 15 de Ches; o texto explica que o dia pode variar regionalmente.",
    "aliases": [
      "Shattering"
    ]
  },
  {
    "key": "festival-dos-mares",
    "month": 2,
    "day": 21,
    "durationDays": 10,
    "name": "Festival dos Mares",
    "description": "Fleetswake: dez dias de respeito às divindades do mar e ao comércio marítimo, com corridas de barcos, baile dos construtores navais, festividades nos portos e oferendas a Valkur e Umberlee.",
    "aliases": [
      "Fleetswake"
    ]
  },
  {
    "key": "gambito-da-rainha",
    "month": 3,
    "day": 1,
    "durationDays": 1,
    "name": "Gambito da Rainha",
    "description": "Festival do clero da Cavaleira Vermelha: banquetes, descanso da Irmandade Rubra e torneios estratégicos de lanceboard, com honrarias aos vencedores.",
    "aliases": [
      "Queen's Gambit"
    ]
  },
  {
    "key": "caravancarai-proskur",
    "month": 3,
    "day": 2,
    "durationDays": 1,
    "name": "Caravançarai de Proskur",
    "description": "Celebra a primeira grande caravana da região de Proskur após sua incorporação a Cormyr. Mercadores encenam a travessia, renovam direitos, firmam contratos e reafirmam rotas comerciais.",
    "aliases": [
      "Caravanserai de Proskur"
    ]
  },
  {
    "key": "goldenight",
    "month": 3,
    "day": 5,
    "durationDays": 1,
    "name": "Goldenight",
    "description": "Noite de ostentação comercial controlada durante Waukeentide: riquezas expostas, cofres abertos, festas patrocinadas por nobres e apresentação de mercadorias nas grandes cidades.",
    "aliases": []
  },
  {
    "key": "assembleia-das-casas",
    "month": 3,
    "day": 11,
    "durationDays": 1,
    "name": "Assembleia das Casas",
    "description": "Gala das Grandes Casas em Suzail durante Waukeentide, com apresentação de herdeiros, feitos, alianças e acordos comerciais, além de bailes e exibições militares.",
    "aliases": []
  },
  {
    "key": "cavalgada-do-vento",
    "month": 3,
    "day": 15,
    "durationDays": 1,
    "name": "Cavalgada do Vento",
    "description": "Windride, ritual dos seguidores de Shaundakul: ao amanhecer, sacerdotes recebem os ventos e atravessam os céus em formas etéreas até o pôr do sol.",
    "aliases": [
      "Windride"
    ]
  },
  {
    "key": "bencaos-douradas",
    "month": 3,
    "day": 22,
    "durationDays": 1,
    "name": "Benção Douradas",
    "description": "Encerramento cerimonial de Waukeentide em homenagem à Companhia Consorte, com bênçãos de clérigos de Waukeen, oferendas mercantis e votos de prosperidade ao reino.",
    "aliases": [
      "Bênçãos Douradas",
      "Bênção Dourada"
    ]
  },
  {
    "key": "dia-do-embelezamento",
    "month": 4,
    "day": 10,
    "durationDays": 1,
    "name": "Dia do Embelezamento",
    "description": "Festival social ligado à beleza e à convivência, apoiado por templos de Lliira, Sheela Peryroyl e Hanali Celanil. Em Cormyr, celebra a valorização da aparência.",
    "aliases": [
      "Dia da Embelezamento",
      "Dia Anual da Embelezamento"
    ]
  },
  {
    "key": "festival-das-cores",
    "month": 4,
    "day": 21,
    "durationDays": 1,
    "name": "Festival das Cores",
    "description": "Celebra resistência às ameaças dracônicas. Tecidos, pós coloridos, brincadeiras e encenações de combates relembram os dragões cromáticos e os heróis de Cormyr.",
    "aliases": [
      "Festivas das Cores"
    ]
  },
  {
    "key": "dia-do-cavaleiro",
    "month": 5,
    "day": 12,
    "durationDays": 1,
    "name": "Dia do Cavaleiro",
    "description": "Dia solene de honra à cavalaria cormyriana e a Bahamut, com renovação pública dos votos de coragem, dever e serviço ao reino.",
    "aliases": []
  },
  {
    "key": "rito-jovem-cerva",
    "month": 6,
    "day": 1,
    "durationDays": 1,
    "name": "Rito da Jovem Cerva",
    "description": "Rito de Mielikki celebrado em Zundle, em memória de uma sacerdotisa confundida com um cervo durante uma caçada. Jovens mulheres que completam o rito recebem a bênção da igreja.",
    "aliases": [
      "Rite of the Stag Lass"
    ]
  },
  {
    "key": "noite-de-lliira",
    "month": 6,
    "day": 7,
    "durationDays": 1,
    "name": "Noite de Lliira",
    "description": "Festival anual da deusa da alegria e liberdade. Cormyr celebra com música, dança nas ruas, artistas, fitas coloridas, encontros e confraternização entre nobres e plebeus.",
    "aliases": []
  },
  {
    "key": "vespera-midsummer",
    "month": 6,
    "day": 30,
    "durationDays": 1,
    "name": "Véspera de Midsummer",
    "description": "Noite de música, encontros e celebrações anteriores ao Midsummer. Devotos de Lurue e Sharess promovem festas; a corte e o povo de Cormyr organizam encontros e vigílias festivas.",
    "aliases": []
  },
  {
    "key": "danca-dos-ossos",
    "month": 7,
    "day": 9,
    "durationDays": 1,
    "name": "Dança dos Ossos",
    "description": "Celebração da caça ligada a Malar. Em Cormyr, a tradição destaca expedições nobres de caça, disciplina, habilidade, banquetes e histórias de caçadas.",
    "aliases": [
      "Dia do Osso"
    ]
  },
  {
    "key": "morte-divina",
    "month": 7,
    "day": 13,
    "durationDays": 1,
    "name": "Morte Divina",
    "description": "Dia dedicado à memória do sacrifício de Torm no Tempo das Perturbações. Cavaleiros, soldados e fiéis recordam dever, coragem e sacrifício em vigílias e homenagens.",
    "aliases": []
  },
  {
    "key": "brightswords",
    "month": 8,
    "day": 28,
    "durationDays": 1,
    "name": "Brightswords",
    "description": "Lâminas Brilhantes: celebração militar com desfiles, estandartes, armaduras polidas e demonstrações dos Dragões Púrpura, exaltando disciplina e preparação do reino.",
    "aliases": [
      "Lâminas Brilhantes"
    ]
  },
  {
    "key": "chasing-the-king",
    "month": 9,
    "day": 6,
    "durationDays": 1,
    "name": "Chasing the King",
    "description": "Costume sombrio associado ao reinado de Boldovar: um condenado recebe a chance de sobreviver à perseguição pública até o pôr do sol, recordando o passado turbulento do reino.",
    "aliases": []
  },
  {
    "key": "ressurreicao-verdadeira",
    "month": 9,
    "day": 15,
    "durationDays": 1,
    "name": "Ressurreição Verdadeira",
    "description": "Celebração datada em 15 de Marpenoth no quadro de festivais do documento. Não há descrição detalhada dessa entrada no texto fornecido.",
    "aliases": []
  },
  {
    "key": "vitoria-de-finder",
    "month": 9,
    "day": 20,
    "durationDays": 1,
    "name": "Vitória de Finder",
    "description": "Festival finderita que marca a vitória de Finder sobre o avatar de Moander. Música, dança, apresentações teatrais e obras novas celebram a força criativa da arte.",
    "aliases": []
  },
  {
    "key": "queda-da-estrela",
    "month": 9,
    "day": 22,
    "durationDays": 1,
    "name": "Queda da Estrela",
    "description": "Starfall, festa de Tymora que recorda o surgimento da deusa da boa fortuna após Tyche. Jogos de sorte, riscos simbólicos e celebrações enchem as ruas e tavernas.",
    "aliases": [
      "Starfall"
    ]
  },
  {
    "key": "noite-dos-mentirosos",
    "month": 9,
    "day": 30,
    "durationDays": 1,
    "name": "Noite dos Mentirosos",
    "description": "Liar’s Night, noite dedicada a Leira e Mask, marcada por máscaras, mentiras festivas, disfarces e tentativas de afastar a atenção indesejada dessas divindades.",
    "aliases": [
      "Liar's Night"
    ]
  }
];
export const CORMYR_DOCUMENT_FESTIVALS=Object.freeze(ROWS.map(row=>Object.freeze({
  ...row,aliases:Object.freeze([...row.aliases]),
  id:'docfest-'+row.key,date:Object.freeze({year:1522,month:row.month,day:row.day,festival:null}),
  repeat:'yearly',scope:'kingdom',region:null,notify:true,
})));
export const SOURCE_DOCUMENT='https://docs.google.com/document/d/1lSTlLoVHTnV392ZswiPj-oko_ma9pnGY/edit';
