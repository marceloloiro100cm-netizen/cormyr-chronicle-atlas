import { balances, unitStats, TRAINING, UNIT_TYPES } from './engine';
import { campaignMonth } from './regions';
import { RESOURCE_KEYS, RESOURCE_NAMES, SKILLS, SKILL_NAMES, type HouseState, type CatalogItem } from './types';

export type ReportLedger={action:string;explanation:string;rule:string;created_at:string;campaign_month?:number;actor?:string;version?:number};
export type ReportSection={title:string;headers:string[];rows:(string|number)[][]};
const statusNames:Record<string,string>={active:'Ativa',building:'Em construção',destroyed:'Destruída',abandoned:'Abandonada',sold:'Vendida',cancelled:'Cancelada',completed:'Concluído',draft:'Rascunho',review:'Em revisão'};
export function houseReport(state:HouseState,name:string,catalog:CatalogItem[]=[],ledger:ReportLedger[]=[]):ReportSection[] {
 const b=balances(state),label=(id:string)=>catalog.find(i=>i.id===id)?.name??id;
 const local=(id:string)=>state.domains.find(d=>d.id===id)?.name??'Sem domínio';
 const costs=(entries:HouseState['holdings'][number]['costs'])=>entries.map(c=>`${c.amount} ${RESOURCE_NAMES[c.resource]} (${c.mode==='allocation'?'alocação':'permanente'})`).join('; ');
 return [
  {title:'Identidade',headers:['Campo','Valor'],rows:[['Casa',name],['Calendário',campaignMonth(state.month)],['Estado',statusNames[state.phase]??state.phase],['Região',state.identity.region],['Lema',state.identity.motto],['Fundação CV',state.identity.foundation??'Não informada'],['Método',state.method],['Orçamento autorizado',state.budget??'Não definido']]},
  {title:'Recursos',headers:['Recurso','Total','Alocado','Em obras','Disponível','Ganhos/perdas permanentes'],rows:RESOURCE_KEYS.map(r=>[RESOURCE_NAMES[r],b.total[r],b.allocated[r],b.committed[r],b.available[r],b.permanent[r]])},
  {title:'Domínios',headers:['Nome','Terreno','Características','Comunidade','Notas'],rows:state.domains.map(d=>[d.name,label(d.terrain),d.features.map(label).join(', '),label(d.community??''),d.notes])},
  {title:'Posses',headers:['Nome','Domínio','Estado','Custos finais','Custos originais','Descontos','Fonte / versão'],rows:state.holdings.map(h=>[h.name,local(h.domainId),statusNames[h.status]??h.status,costs(h.costs),h.originalCosts?costs(h.originalCosts):'Não registrado na versão anterior',(h.discounts??[]).map(d=>`${d.source}: ${d.amount} ${RESOURCE_NAMES[d.resource]}`).join('; '),h.source+' / '+h.ruleVersion])},
  {title:'Benefícios',headers:['Posse','Estado','Benefício'],rows:state.holdings.flatMap(h=>h.effects.map(e=>[h.name,statusNames[h.status]??h.status,e.description]))},
  {title:'Tropas',headers:['Nome','Tipos','Treinamento','Efetivo atual / máximo','Baixas','Saúde atual / máxima','Defesa','Disciplina','XP disponível','Local','Situação'],rows:state.units.map(u=>[u.name,u.types.map(id=>UNIT_TYPES.find(t=>t.id===id)?.name??id).join(' / '),TRAINING[u.training as keyof typeof TRAINING]?.name??u.training,`${Math.max(0,u.strength-u.casualties)} / ${u.strength}`,u.casualties,`${u.health} / ${unitStats(u).maxHealth}`,unitStats(u).defense,unitStats(u).discipline,u.xp,local(u.domainId),u.situation])},
  {title:'Habilidades militares',headers:['Unidade',...SKILLS.map(s=>SKILL_NAMES[s])],rows:state.units.map(u=>[u.name,...SKILLS.map(s=>u.skills[s])])},
  {title:'Projetos',headers:['Nome','Início','Duração meses','Previsão','Estado','Dados','Modificador'],rows:state.projects.map(p=>[p.name,campaignMonth(p.start),p.duration,campaignMonth(p.start+p.duration+p.modifier),statusNames[p.status]??p.status,p.dice.join(', '),p.modifier])},
  {title:'Família e corte',headers:['Nome','Função','NPC vinculado','Notas'],rows:state.court.map(m=>[m.name,m.role,m.npcId??'',m.notes])},
  {title:'Sorte e ações',headers:['Período','Tipo','Resultado / ação','Dados','Modificador','Consequências'],rows:[...state.fortunes.map(f=>[campaignMonth(f.month),f.mode==='roll'?'Rolagem de Sorte':'Alternativa sem rolagem',f.outcome,f.dice.join(', '),f.modifier,RESOURCE_KEYS.filter(r=>f.changes[r]!==undefined).map(r=>`${RESOURCE_NAMES[r]}: ${f.changes[r]}`).join('; ')]),...state.actions.map(a=>[campaignMonth(a.month),'Ação',a.type,'','',a.notes])]},
  {title:'História da casa',headers:['Evento'],rows:state.identity.history.map(e=>[e])},
  {title:'Histórico de operações',headers:['Versão','Data real','Calendário','Operação','Autor','Justificativa','Regra'],rows:ledger.map(l=>[l.version??'',l.created_at,l.campaign_month===undefined?'Não registrado':campaignMonth(l.campaign_month),l.action,l.actor??'',l.explanation,l.rule])},
  {title:'Conciliação',headers:['Pendência'],rows:state.pending.map(p=>[p])},
 ];
}