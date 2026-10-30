export const MONTHS = ['Hammer', 'Alturiak', 'Ches', 'Tarsakh', 'Mirtul', 'Kythorn', 'Flamerule', 'Eleasis', 'Eleint', 'Marpenoth', 'Uktar', 'Nightal'] as const;
export const FESTIVALS = [
  {id:'midwinter', name:'Midwinter · Meio do Inverno', month:0},
  {id:'greengrass', name:'Greengrass · Relva Verde', month:3},
  {id:'midsummer', name:'Midsummer · Meio do Verão', month:6},
  {id:'shieldmeet', name:'Shieldmeet · Encontro dos Escudos', month:6},
  {id:'highharvestide', name:'Highharvestide · Grande Colheita', month:8},
  {id:'feast-moon', name:'Feast of the Moon · Festa da Lua', month:10},
] as const;
export type CampaignDate = {year:number; month:number; day:number; festival:string|null};
export function dateKey(d:CampaignDate):string {
  return `${String(d.year).padStart(4,'0')}-${d.festival?'F-'+d.festival:String(d.month+1).padStart(2,'0')+'-'+String(d.day).padStart(2,'0')}`;
}
export function parseDate(value:string|null|undefined):CampaignDate|null {
  const m=/^(\d{4})-(?:(\d{2})-(\d{2})|F-([a-z-]+))$/.exec(value??'');
  if(!m)return null;
  const year=Number(m[1]); if(year<1)return null;
  if(m[4]){const f=FESTIVALS.find(f=>f.id===m[4]);return f&&(f.id!=='shieldmeet'||year%4===0)?{year,month:f.month,day:30,festival:f.id}:null;}
  const month=Number(m[2])-1,day=Number(m[3]);return month>=0&&month<12&&day>=1&&day<=30?{year,month,day,festival:null}:null;
}
export function formatDate(value:string|null|undefined):string {
  const d=parseDate(value);return d?`${d.festival?FESTIVALS.find(f=>f.id===d.festival)!.name:`${d.day} de ${MONTHS[d.month]}`} · ${d.year} CV`:'Sem data de campanha';
}
/** Label shown to players from the published shared Harptos date and campaign week. */
export function formatCampaignWeek(d:CampaignDate & {published_week?:number|null}):string {
  const period=d.festival
    ?(FESTIVALS.find(f=>f.id===d.festival)?.name??'Festival')
    :`${Math.floor((d.day-1)/10)+1}ª désdia`;
  const week=Number.isInteger(d.published_week)&&Number(d.published_week)>0
    ?`Semana ${d.published_week} · `:'';
  return `${week}${period} · ${MONTHS[d.month]} · ${d.year} CV`;
}

export type CalendarEvent={id:string;date:string;title:string;kind:'kingdom'|'season'|'mail';description?:string};
const WAUKEEN = [[15,'Cold Counting'],[1,"Grandmasster’s March"],[10,'Great Weave'],[4,'High Coin'],[8,'Springsheen'],[14,'Coinswarm'],[12,'Goldensun'],[17,'Bountiful Harvest'],[21,'Brightbuckle'],[10,"Coin’s Rest"],[25,'Darkcoin'],[29,'Audit']] as const;
export function annualEvents(year:number):CalendarEvent[]{
  const events:CalendarEvent[]=FESTIVALS.filter(f=>f.id!=='shieldmeet'||year%4===0).map(f=>({id:f.id,date:dateKey({year,month:f.month,day:30,festival:f.id}),title:f.name,kind:'kingdom',description:EVENT_DETAILS[f.id]+' Dia intercalar, fora das désdias.'}));
  MONTHS.forEach((_,month)=>{
    [[1,'Seeing Justice'],[13,'Right Hand'],[22,'Maimed Hand']].forEach(([day,title])=>events.push({id:`tyr-${month}-${day}`,date:dateKey({year,month,day:Number(day),festival:null}),title:`Tyr · ${title}`,kind:'kingdom',description:EVENT_DETAILS[String(title)]??''}));
    const [day,title]=WAUKEEN[month]!;
    for(let n=day;n<=(month===1?6:day);n++)events.push({id:`waukeen-${month}-${n}`,date:dateKey({year,month,day:n,festival:null}),title:`Waukeen · ${title}`,kind:'kingdom',description:EVENT_DETAILS[title]??''});
  });
  ([[2,19,'Equinócio da primavera'],[5,20,'Solstício de verão'],[8,21,'Equinócio do outono'],[11,20,'Solstício de inverno']] as const).forEach(([month,day,title])=>events.push({id:`season-${month}`,date:dateKey({year,month,day,festival:null}),title,kind:'season'}));
  return events;
}

// Campaign customs supplied in the implementation brief.
export const EVENT_DETAILS:Record<string,string>={"midwinter": "em Cormyr: renovação de alianças entre famílias nobres, anúncios da Coroa e dos Dragões Púrpuras, planejamento político e militar do ano", "greengrass": "dia de bênção das colheitas pelos sacerdotes de Chauntea, música e banquetes ao ar livre da nobreza e plebe", "midsummer": ": Shieldmeet (dia de tratados abertos, renovação de pactos, torneios reais e petições públicas ao Rei; marcado em Cormyr pela memória sombria do massacre dos Magos de Guerra na Fortaleza Real em 1396 CV", "shieldmeet": "dia de tratados abertos, renovação de pactos, torneios reais e petições públicas ao Rei; marcado em Cormyr pela memória sombria do massacre dos Magos de Guerra na Fortaleza Real em 1396 CV", "highharvestide": "festa da colheita, cobrança de impostos em alimentos pelas casas nobres, partida de caravanas e assinatura de tratados antes do inverno", "feast-moon": "festival solene de tributo aos ancestrais, heróis caídos e reis passados; procissões com tochas nos cemitérios e cerimônia da família real no mausoléu de Suzail", "Seeing Justice": "Abertura formal de sessões de julgamento nos tribunais reais de Suzail, leitura de leis reais e petições de camponeses e mercadores.", "Right Hand": "Cerimônias militares da Ordem do Dragão Púrpura, juramentos de novos soldados/cavaleiros sob o olhar de Tyr e execução de sentenças importantes.", "Maimed Hand": "Julgamentos de traição, corrupção e crimes contra a Coroa, penitências públicas e concessão do \"Perdão da Mão Cortada\" pelo Rei ou Lordes locais.", "Cold Counting": "Balanço de inverno de guildas e tesoureiros nobres; juros reduzidos em Suzail.", "Grandmasster’s March": "Semana de feiras móveis, procissões com moedas douradas e redução temporária de tarifas em Suzail, Marsember e Arabel.", "Great Weave": "Feira têxtil de tecelões, alfaiates, sedas de Marsember e lãs das Stonelands.", "High Coin": "Reabertura oficial das grandes rotas de caravanas após o degelo e assinatura de contratos comerciais.", "Springsheen": "Festival de joalheiros, ourives e artesãos de luxo em Suzail; encomendas de joias e armas ornamentadas pela nobreza.", "Coinswarm": "Grande feira popular de rua, leilões de mercadorias exóticas e jogos de azar onde nobres jogam pequenas moedas ao povo.", "Goldensun": "Ápice do comércio marítimo no Lago dos Dragões (Suzail e Marsember), chegada de frotas mercantes e leilões de especiarias.", "Bountiful Harvest": "Celebração conjunta de Waukeen e Chauntea com feiras de grãos, frutas, cervejas e vinhos.", "Brightbuckle": "Feira de armeiros, ferreiros, seleiros e equipamentos para caravanas e exércitos em Arabel e fortalezas reais.", "Coin’s Rest": "Fechamento de grandes contratos anuais, quitação de dívidas e renegociação de empréstimos entre casas nobres e guildas.", "Darkcoin": "Dia de doações a orfanatos, veteranos de guerra e obras públicas para afastar a má sorte no comércio do ano seguinte.", "Audit": "Auditoria anual de cofres reais, guildas e casas nobres antes do fim do ano, seguida pelo Banquete das Balanças Douradas."};
export const MONTH_DETAILS=[["O Fundo do Inverno", "Inverno"], ["A Garra do Inverno", "Inverno"], ["A Garra dos Sóis Poentes", "Primavera"], ["A Garra das Tempestades", "Primavera"], ["O Derretimento", "Primavera"], ["O Tempo das Flores", "Verão"], ["O Tempo do Fogo", "Verão"], ["O Sol Alto", "Verão"], ["O Desbotar", "Outono"], ["Queda das Folhas", "Outono"], ["O Apodrecimento", "Outono"], ["A Descida", "Inverno"]] as const;
