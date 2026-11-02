import {RESOURCE_KEYS,RESOURCE_NAMES} from './types';
import type {ReportSection} from './report';

/** Only public, reviewed catalogue fields; never treats lore as a mechanical sheet. */
export type VassalArchiveProfile = {
 id:string;name:string;region:string;lordName:string;castle:string;city:string;
 motto:string;founding:string;title:string;description:string;symbol:string;colors:string;
 crest:string|null;
};
const stringValue=(value:unknown):string=>typeof value==='string'?value.trim():'';
export function readVassalArchiveProfile(row:{
 id:string;name:string;region:string;public_reviewed:boolean;archive_data:unknown;
} | null | undefined):VassalArchiveProfile|null {
 if(!row?.public_reviewed)return null;
 const a=row.archive_data && typeof row.archive_data==='object'&&!Array.isArray(row.archive_data)
  ?row.archive_data as Record<string,unknown>:{};
 return {
  id:row.id,name:row.name,region:row.region,
  lordName:stringValue(a['leader']),castle:stringValue(a['castle']),
  city:stringValue(a['city']),motto:stringValue(a['motto']),
  founding:stringValue(a['founding']),title:stringValue(a['titles']),
  description:stringValue(a['description']),symbol:stringValue(a['symbol']),
  colors:stringValue(a['colors']),crest:stringValue(a['crest'])||null,
 };
}
/** Matches the same report-section contract as a player's full PDF without inventing
 * seven resource totals, military units or possessions for an archival-only house. */
export function vassalArchiveReport(profile:VassalArchiveProfile):ReportSection[]{
 const absent='Não cadastrado na ficha mecânica';
 const missing=(title:string,headers:string[]):ReportSection=>({title,headers,
  rows:[[absent,...headers.slice(1).map(()=>'-')]]});
 return [
  {title:'Identidade',headers:['Campo','Valor'],rows:[
   ['Casa',profile.name],['Região',profile.region],['Lorde ou Lady',profile.lordName||absent],
   ['Fortaleza',profile.castle||absent],['Cidade',profile.city||absent],
   ['Lema',profile.motto||absent],['Fundação',profile.founding||absent],
   ['Título',profile.title||absent],['Brasão / símbolo',profile.symbol||absent],
   ['Cores',profile.colors||absent],['Descrição histórica',profile.description||absent],
   ['Origem','Catálogo histórico público de Cormyr — sem ficha mecânica importada'],
  ]},
  {title:'Recursos',headers:['Recurso','Total','Alocado','Em obras','Disponível','Ganhos / perdas permanentes'],
   rows:RESOURCE_KEYS.map(k=>[RESOURCE_NAMES[k],absent,'-','-','-','-'])},
  missing('Domínios',['Nome','Terreno','Características','Comunidade','Notas']),
  missing('Posses',['Nome','Domínio','Estado','Custos finais','Custos originais','Descontos','Fonte / versão']),
  missing('Benefícios',['Posse','Estado','Benefício']),
  missing('Fortificações',['Nome','Domínio','Estado','Regras']),
  missing('Economia',['Nome','Domínio','Estado','Efeitos']),
  missing('Tropas',['Nome','Tipo','Treinamento','Efetivo','Saúde','Defesa','Disciplina']),
  missing('Habilidades militares',['Unidade','Atributos']),
  missing('Projetos',['Nome','Estado','Previsão']),
  missing('Família e corte',['Nome','Função','Notas']),
  missing('Histórico de operações',['Versão','Operação','Data','Justificativa']),
 ];
}
