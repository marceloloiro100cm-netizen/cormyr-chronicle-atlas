import {RESOURCE_KEYS,RESOURCE_NAMES,type Resource,type Resources} from './types';
import type {ReportSection} from './report';

/** Leitura fiel de uma planilha de vassala. Nao cria automaticamente compras
 * nem converte linhas de custo em unidades adicionais. */
export type VassalWorkbookAsset={
 name:string;group:'Terras'|'Fortificações'|'Economia'|'Exército';
 resource:Resource;cost:number;detail?:string;
};
export type VassalWorkbookUnit={
 name:string;city:string;type:string;training:string;commander:string;
 fighting?:number;marksmanship?:number;agility?:number;athletics?:number;
 stealth?:number;cunning?:number;endurance?:number;damage:string;
 health?:number;defense?:number;armorPenalty?:number;armor?:number;
 cost?:number;attack?:string;armorText?:string;discipline?:string;tacticalRole?:string;
};
export type VassalWorkbook={
 houseId:string;name:string;suzerainId:string;region:string;lord:string;heir:string;
 motto:string;foundation:number;castle:string;city:string;source:string;
 title?:string;territorialGrantYear?:number;crestDescription?:string;
 resources:Resources;assets:VassalWorkbookAsset[];
 people:{name:string;role:string}[];units:VassalWorkbookUnit[];
 history:string[];fortune?:{law:number;population:number;maester:number};
 reviewNotes?:string[];
};

export function vassalWorkbookBalances(sheet:VassalWorkbook){
 const allocated=Object.fromEntries(RESOURCE_KEYS.map(key=>[
  key,sheet.assets.filter(item=>item.resource===key).reduce((sum,item)=>sum+item.cost,0),
 ])) as Resources;
 const available=Object.fromEntries(RESOURCE_KEYS.map(key=>[
  key,sheet.resources[key]-allocated[key],
 ])) as Resources;
 return {total:sheet.resources,allocated,available};
}

export function vassalWorkbookReport(sheet:VassalWorkbook):ReportSection[]{
 const balance=vassalWorkbookBalances(sheet);
 const listed=(group:VassalWorkbookAsset['group'])=>sheet.assets.filter(x=>x.group===group);
 const assets=(group:VassalWorkbookAsset['group']):ReportSection=>({
  title:group,headers:['Bem ou investimento','Custo','Recurso','Observação'],
  rows:listed(group).map(x=>[x.name,x.cost,RESOURCE_NAMES[x.resource],x.detail??'']),
 });
 const fortune=sheet.fortune?
  sheet.fortune.law+sheet.fortune.population+sheet.fortune.maester:null;
 const missing='Não informado';
 return [
  {title:'Identidade',headers:['Campo','Valor'],rows:[
   ['Casa',sheet.name],['Suserana',sheet.suzerainId],['Região',sheet.region],
   ['Lorde',sheet.lord||missing],['Herdeiro',sheet.heir||missing],
   ['Fortaleza',sheet.castle||missing],['Cidade de origem',sheet.city||missing],
   ['Lema',sheet.motto||missing],['Fundação CV',sheet.foundation||missing],
   ...(sheet.territorialGrantYear?[['Concessão territorial CV',sheet.territorialGrantYear]]:[]),
   ...(sheet.title?[['Título',sheet.title]]:[]),
   ...(sheet.crestDescription?[['Brasão',sheet.crestDescription]]:[]),
   ['Fonte',sheet.source],
   ['Natureza da importação','Planilha histórica; consulta sem lançamento no livro-caixa'],
  ]},
  {title:'Recursos',headers:['Recurso','Total','Alocado','Disponível'],rows:
   RESOURCE_KEYS.map(key=>[RESOURCE_NAMES[key],balance.total[key],
    balance.allocated[key],balance.available[key]])},
  assets('Terras'),
  assets('Fortificações'),
  assets('Economia'),
  assets('Exército'),
  {title:'Sorte da Casa',headers:['Fonte','Modificador'],rows:sheet.fortune?[
   ['Lei',sheet.fortune.law],['População',sheet.fortune.population],
   ['Meistre',sheet.fortune.maester],['Total',fortune??missing],
  ]:[['Modificadores de Sorte',missing]]},
  {title:'Tropas',headers:['Companhia','Tipo','Treinamento','Capitão','Cidade','Custo Poder','Ataque informado','Dano','Armadura','Saúde','Defesa','Disciplina','Função tática'],rows:
   sheet.units.map(u=>[u.name,u.type,u.training,u.commander||missing,u.city||missing,
    u.cost??missing,u.attack??missing,u.damage,
    u.armorText??u.armor??missing,u.health??missing,u.defense??missing,
    u.discipline??missing,u.tacticalRole??missing])},
  {title:'Habilidades militares',headers:['Unidade','Luta','Pontaria','Agilidade','Atletismo','Furtividade','Astúcia','Vigor'],rows:
   sheet.units.map(u=>[u.name,u.fighting??missing,u.marksmanship??missing,
    u.agility??missing,u.athletics??missing,u.stealth??missing,
    u.cunning??missing,u.endurance??missing])},
  {title:'Família e corte',headers:['Nome','Função'],rows:sheet.people.map(p=>[p.name,p.role])},
  {title:'História da casa',headers:['Evento'],rows:sheet.history.map(s=>[s])},
  {title:'Pendências de conciliação',headers:['Campo','Situação'],rows:
   (sheet.reviewNotes??[
    'A planilha não relaciona terrenos, características e povoados a domínios individuais.',
    'Três companhias constam na aba Exército; apenas Apoio treinada (-7 Poder) consta dos custos.',
   ]).map((note,i)=>['Pendência '+(i+1),note]).concat([
    ['Persistência','Consulta da planilha: não gera transações na suserana '+sheet.suzerainId+'.'],
   ])},
 ];
}
