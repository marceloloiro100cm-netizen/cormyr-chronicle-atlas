import { balances, activeHoldings } from './engine';
import { RESOURCE_KEYS, type HouseState, type Resource, type Resources } from './types';
import { stackingBonus } from './stacking';
import { purchasedFortuneDice } from './resource-transactions';
export const FORTUNE_TABLE:[number,number,string][]=[[-Infinity,2,'Desastre'],[3,3,'Maldição'],[4,4,'Declínio'],[5,5,'Desastre'],[6,6,'Crescimento'],[7,7,'Declínio'],[8,8,'Crescimento'],[9,9,'Maldição'],[10,10,'Declínio'],[11,11,'Crescimento'],[12,12,'Dádiva'],[13,13,'Declínio'],[14,14,'Bênção'],[15,15,'Crescimento'],[16,16,'Maldição'],[17,17,'Declínio'],[18,18,'Bênção'],[19,19,'Maldição'],[20,20,'Bênção'],[21,22,'Crescimento'],[23,23,'Maldição'],[24,25,'Crescimento'],[26,27,'Bênção'],[28,28,'Dádiva'],[29,29,'Maldição'],[30,30,'Bênção'],[31,34,'Crescimento'],[35,35,'Bênção'],[36,36,'Dádiva'],[37,41,'Crescimento'],[42,Infinity,'Dádiva']];
const LAW:[number,number][]=[[0,-20],[10,-10],[20,-5],[30,-2],[40,-1],[50,0],[60,1],[70,2],[Infinity,5]];
const POP:[number,number][]=[[0,-10],[10,-5],[20,0],[30,1],[40,3],[50,1],[60,0],[70,-5],[Infinity,-10]];
export function fortuneLawModifier(law:number) {return LAW.find(([max])=>law<=max)?.[1]??0;}
export function fortunePopulationModifier(population:number) {return POP.find(([max])=>population<=max)?.[1]??0;}
export function fortuneModifier(law:number,population:number) {return fortuneLawModifier(law)+fortunePopulationModifier(population);}
export function fortuneOutcome(total:number){return FORTUNE_TABLE.find(([min,max])=>total>=min&&total<=max)?.[2]??'Resultado pendente';}
export function rollPreview(state:HouseState,args:{status:number;testDice:number[];bonusDice:number[];modifier:number;fortuneStackDice?:number[]|undefined}) {
  if(!Number.isInteger(args.status)||args.status<1||args.status>10)throw new Error('Status inválido.');
  const vassalDice=(state.vassals??[]).filter(v=>v.status==='approved').length;
  const influenceDice=purchasedFortuneDice(state);
  const expected=args.status+vassalDice+influenceDice;
  if(args.testDice.length!==expected||[...args.testDice,...args.bonusDice].some(d=>!Number.isInteger(d)||d<1||d>6))throw new Error(`Registre ${expected} dados de teste (Status + ${vassalDice} brasões vassalos + ${influenceDice} comprados por Influência).`);
  const kept=[...args.testDice,...args.bonusDice].sort((a,b)=>b-a).slice(0,args.testDice.length);
  const holdings=activeHoldings(state).flatMap(h=>h.effects).filter(e=>e.kind==='fortune');
  const holdingBonus=stackingBonus(holdings.reduce((n,e)=>n+(e.amount??0),0),args.fortuneStackDice??[]);
  const b=balances(state),sewers=activeHoldings(state).some(h=>h.itemId==='pros-sewer');
  const populationPenalty=fortunePopulationModifier(b.total.population);
  const modifier=fortuneLawModifier(b.total.law)+(sewers&&populationPenalty<0?Math.min(0,populationPenalty+2):populationPenalty)+args.modifier+holdingBonus;
  const total=kept.reduce((n,d)=>n+d,0)+modifier;
  return {kept,total,modifier,outcome:fortuneOutcome(total)};
}
export function confirmFortune(state:HouseState,args:{status:number;testDice:number[];bonusDice:number[];modifier:number;resource:Resource;changes:Partial<Resources>;justification:string;fortuneStackDice?:number[]|undefined;resourceStackDice?:Partial<Record<Resource,number[]>>|undefined}) {
  if(state.fortunes.some(f=>f.month===state.month))throw new Error('Sorte já resolvida neste mês.');
  const p=rollPreview(state,args),changes=Object.entries(args.changes).filter(([,v])=>v!==0),positive=['Crescimento','Bênção','Dádiva'].includes(p.outcome),max=p.outcome==='Crescimento'||p.outcome==='Declínio'?1:p.outcome==='Bênção'||p.outcome==='Maldição'?3:6;
  if(!changes.length||changes.length>2)throw new Error('Escolha um ou dois recursos conforme o resultado.');
  for(const [r,v]of changes)if(!RESOURCE_KEYS.includes(r as Resource)||typeof v!=='number'||!Number.isInteger(v)||(positive?v<=0:v>=0)||Math.abs(v)>max||(changes.length===2&&Math.abs(v)>(max===6?3:1)))throw new Error('Consequências fora da faixa da tabela 6-18.');
  if(!args.justification.trim())throw new Error('Registre a decisão narrativa.');
  const effects=activeHoldings(state).flatMap(h=>h.effects);
  const next=structuredClone(state),finalChanges:Partial<Resources>={};
  for(const [key,value]of changes){const r=key as Resource,v=value??0;const relevant=effects.filter(e=>e.resource===r&&e.kind===(v>0?'gain':'mitigation'));const adjustment=stackingBonus(relevant.reduce((n,e)=>n+(e.amount??0),0),args.resourceStackDice?.[r]??[]);const final=v>0?v+adjustment:Math.min(0,v+adjustment);next.permanent[r]+=final;finalChanges[r]=final;}
  next.fortunes.push({month:state.month,mode:'roll',dice:args.testDice,bonusDice:args.bonusDice,modifier:p.modifier,result:p.total,outcome:p.outcome,resource:args.resource,changes:finalChanges,source:'Guerra dos Tronos RPG · tabela6-18; Prosperidade · Stacking Bonuses · '+args.justification+' · dados de efeitos: '+JSON.stringify({fortune:args.fortuneStackDice??[],resources:args.resourceStackDice??{}})});return next;
}
export const CONVERSIONS:Partial<Record<Resource,Resource[]>>={influence:['law'],lands:['defense'],population:['power'],power:['influence','law','population'],wealth:[...RESOURCE_KEYS].filter(r=>r!=='wealth')};
/** Routes and costs are derived exclusively from active Prosperity investments. */
export function availableConversions(state:HouseState):Partial<Record<Resource,Resource[]>> {
 const routes:Partial<Record<Resource,Resource[]>>=Object.fromEntries(Object.entries(CONVERSIONS).map(([from,targets])=>[from,[...(targets??[])]]));
 const own=(id:string)=>activeHoldings(state).some(h=>h.itemId===id);
 const add=(from:Resource,to:Resource)=>{const list=routes[from]??=[];if(!list.includes(to))list.push(to);routes[from]=list;};
 if(own('pros-black-market'))add('law','wealth');
 if(own('pros-gaol'))add('population','law');
 if(own('pros-slave-market')){add('wealth','population');add('population','wealth');add('wealth','power');add('power','wealth');}
 return routes;
}
export function conversionRate(state:HouseState,from:Resource,to:Resource,rushed:boolean):number {
 if(!availableConversions(state)[from]?.includes(to))throw new Error('Conversão não permitida para esta Casa.');
 const own=(id:string)=>activeHoldings(state).some(h=>h.itemId===id);
 if(from==='wealth'&&to==='power'&&own('pros-military-academy'))return rushed?2:1;
 if(from==='law'&&to==='wealth'&&own('pros-black-market'))return 1;
 if(from==='population'&&to==='law'&&own('pros-gaol'))return rushed?2:1;
 if(own('pros-slave-market')&&((from==='wealth'&&(to==='population'||to==='power'))||((from==='population'||from==='power')&&to==='wealth')))return rushed?2:1;
 return from==='wealth'?(rushed?3:2):(rushed?2:1);
}
export function convertResources(state:HouseState,from:Resource,to:Resource,amount:number,rushed:boolean,rate?:number):HouseState {
 const ratio=conversionRate(state,from,to,rushed);
 if(rate!==undefined&&rate!==ratio)throw new Error('Taxa de conversão divergente da regra da Casa.');
 if(!Number.isInteger(amount)||amount<=0)throw new Error('Quantidade de pontos inválida.');
 const actions=state.actions.filter(a=>a.month===state.month);
 if(actions.some(a=>!a.type.startsWith('convert:')))throw new Error('A Casa já realizou outra ação mensal.');
 if(actions.length>=2)throw new Error('Limite de duas conversões por mês.');
 if((actions.length===0&&rushed)||(actions.length===1&&(!rushed||actions[0]?.notes.includes('apressada'))))throw new Error('Faça primeiro uma conversão normal e, depois, uma apressada.');
 const cost=amount*ratio;
 if(balances(state).available[from]<cost)throw new Error('Saldo insuficiente para conversão.');
 const next=structuredClone(state);next.permanent[from]-=cost;next.permanent[to]+=amount;
 next.actions.push({month:state.month,type:`convert:${from}:${to}`,notes:`Tabela 6-19 · ${cost}:${amount}${rushed?' · apressada':''}`});return next;
}
/** The Narrator records an auditable tournament with a server-rolled prize. */
export function runTournament(state:HouseState,scale:'local'|'regional'|'grand',competitions:number,roll:number,notes:string):HouseState {
 if(state.phase!=='active'||state.actions.some(a=>a.month===state.month))throw new Error('Ação mensal indisponível.');
 if(!Number.isInteger(competitions)||competitions<1||competitions>30||!notes.trim())throw new Error('Número de competições ou relato inválido.');
 const sides=scale==='local'?1:scale==='regional'?3:6;
 if(!Number.isInteger(roll)||roll<1||roll>sides)throw new Error('Dado de Influência inválido.');
 const base=scale==='local'?2:scale==='regional'?5:10,each=scale==='local'?1:scale==='regional'?2:5;
 const own=(id:string)=>activeHoldings(state).some(h=>h.itemId===id);
 const rebate=Number(own('pros-tournament-field'))+Number(own('pros-tournament-master'));
 const wealth=Math.max(0,base+each*competitions-rebate);
 const influence=roll+(own('pros-tournament-master')?2:0)+(own('pros-tournament-field--competition-culture')?3:0);
 if(balances(state).available.wealth<wealth)throw new Error('Riqueza insuficiente para realizar o torneio.');
 const next=structuredClone(state);next.permanent.wealth-=wealth;next.permanent.influence+=influence;
 next.actions.push({month:state.month,type:'Torneio',notes:`${notes.trim()} · ${scale}; ${competitions} competições; −${wealth} Riqueza; +${influence} Influência (d${sides}=${roll}; descontos ${rebate}).`});
 return next;
}
