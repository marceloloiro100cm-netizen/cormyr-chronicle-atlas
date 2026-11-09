import {getHarptosOrdinal} from '@/lib/calendar/temporal-engine';
import {parseDate} from '@/lib/calendar/harptos';
import type {SpyManagement} from './spy-management.functions';

export type SpyChronicleEntry={
 id:string;agentId:string;dateKey:string;
 kind:'history'|'travel'|'mission';label:string;detail:string;
};
const labels:Record<string,string>={
 recruited:'Recrutamento',mission_success:'Missão bem-sucedida',
 mission_failure:'Missão fracassada',escaped:'Fuga',captured:'Prisão',
 dead:'Morte em operação',promoted:'Promoção',
 upgrade_purchased:'Equipamento adquirido',retired:'Baixa do agente',
};
/** Linha do tempo composta apenas dos eventos que o usuário já pode consultar. */
export function buildSpyChronicle(data:SpyManagement):SpyChronicleEntry[]{
 const entries:SpyChronicleEntry[]=data.history.map(h=>({
  id:'h:'+h.id,agentId:h.agentId,dateKey:h.dateKey,kind:'history',
  label:labels[h.eventType]??h.eventType,
  detail:[h.detail,h.targetName??''].filter(Boolean).join(' · '),
 }));
 for(const o of data.operations){
  if(o.departureKey&&parseDate(o.departureKey)){
   entries.push({id:'start:'+o.id,agentId:o.assetId,dateKey:o.departureKey,
    kind:'mission',label:'Missão iniciada',
    detail:(o.targetHouseName??o.targetId)+
     (o.status==='cancelled'?' · posteriormente encerrada':'')});
  }
  if(o.status!=='cancelled'&&o.arrivalKey&&parseDate(o.arrivalKey)&&
   ['operating','pending_narrator_review','returning','completed'].includes(o.status)){
   entries.push({id:'arrival:'+o.id,agentId:o.assetId,dateKey:o.arrivalKey,
    kind:'travel',label:'Chegada ao destino',
    detail:o.targetHouseName??o.targetId});
  }
  if(o.status!=='cancelled'&&o.investigationEndKey&&
   parseDate(o.investigationEndKey)&&
   ['pending_narrator_review','returning','completed'].includes(o.status)){
   entries.push({id:'conclusion:'+o.id,agentId:o.assetId,dateKey:o.investigationEndKey,
    kind:'mission',label:'Prazo de investigação concluído',
    detail:o.targetHouseName??o.targetId});
  }
 }
 return entries.filter(e=>Boolean(parseDate(e.dateKey))).sort((a,b)=>
  getHarptosOrdinal(b.dateKey)-getHarptosOrdinal(a.dateKey)||
  a.id.localeCompare(b.id));
}
export function filterSpyChronicle(entries:readonly SpyChronicleEntry[],
 agentId:string,kind:'all'|'history'|'travel'|'mission',search:string){
 const query=search.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('pt-BR').trim();
 const lower=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'')
  .toLocaleLowerCase('pt-BR');
 return entries.filter(e=>(!agentId||e.agentId===agentId)&&
  (kind==='all'||e.kind===kind)&&
  (!query||lower(e.label+' '+e.detail).includes(query)));
}
