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
export function rollPreview(state:HouseState,args:{status:number;testDice:number[];bonusDice:number[];modifier:number;fortuneStackDice?:number[]|undefined;specialFortuneDice?:number[]|undefined}) {
  if(!Number.isInteger(args.status)||args.status<1||args.status>10)throw new Error('Status inválido.');
  const vassalDice=(state.vassals??[]).filter(v=>v.status==='approved').length;
  const influenceDice=purchasedFortuneDice(state);
  const expected=args.status+vassalDice+influenceDice;
  if(args.testDice.length!==expected||[...args.testDice,...args.bonusDice].some(d=>!Number.isInteger(d)||d<1||d>6))throw new Error(`Registre ${expected} dados de teste (Status + ${vassalDice} brasões vassalos + ${influenceDice} comprados por Influência).`);
  const kept=[...args.testDice,...args.bonusDice].sort((a,b)=>b-a).slice(0,args.testDice.length);
  const holdings=activeHoldings(state).flatMap(h=>h.effects).filter(e=>e.kind==='fortune');
  const specials=holdings.flatMap(e=>e.fortuneDice?[e.fortuneDice]:[]);
  const expectedSpecial=specials.reduce((n,e)=>n+e.count,0);
  const rolls=args.specialFortuneDice??[];
  if(rolls.length!==expectedSpecial)throw new Error('Registre '+expectedSpecial+' dados especiais de Sorte das posses consagradas.');
  let cursor=0,specialBonus=0;
  for(const special of specials){
    const dice=rolls.slice(cursor,cursor+special.count);cursor+=special.count;
    if(dice.some(d=>!Number.isInteger(d)||d<1||d>special.sides))throw new Error('Dados especiais de Sorte fora da faixa.');
    specialBonus+=dice.reduce((sum,n)=>sum+n,0)+special.offset;
  }
  const holdingBonus=stackingBonus(holdings.reduce((n,e)=>n+(e.amount??0),0),args.fortuneStackDice??[])+specialBonus;
  const b=balances(state),modifier=fortuneModifier(b.total.law,b.total.population)+args.modifier+holdingBonus;
  const total=kept.reduce((n,d)=>n+d,0)+modifier;
  return {kept,total,modifier,outcome:fortuneOutcome(total)};
}
export function confirmFortune(state:HouseState,args:{status:number;testDice:number[];bonusDice:number[];modifier:number;resource:Resource;changes:Partial<Resources>;justification:string;fortuneStackDice?:number[]|undefined;specialFortuneDice?:number[]|undefined;resourceStackDice?:Partial<Record<Resource,number[]>>|undefined}) {
  if(state.fortunes.some(f=>f.month===state.month))throw new Error('Sorte já resolvida neste mês.');
  const p=rollPreview(state,args),changes=Object.entries(args.changes).filter(([,v])=>v!==0),positive=['Crescimento','Bênção','Dádiva'].includes(p.outcome),max=p.outcome==='Crescimento'||p.outcome==='Declínio'?1:p.outcome==='Bênção'||p.outcome==='Maldição'?3:6;
  if(!changes.length||changes.length>2)throw new Error('Escolha um ou dois recursos conforme o resultado.');
  for(const [r,v]of changes)if(!RESOURCE_KEYS.includes(r as Resource)||typeof v!=='number'||!Number.isInteger(v)||(positive?v<=0:v>=0)||Math.abs(v)>max||(changes.length===2&&Math.abs(v)>(max===6?3:1)))throw new Error('Consequências fora da faixa da tabela 6-18.');
  if(!args.justification.trim())throw new Error('Registre a decisão narrativa.');
  const effects=activeHoldings(state).flatMap(h=>h.effects);
  const next=structuredClone(state),finalChanges:Partial<Resources>={};
  for(const [key,value]of changes){const r=key as Resource,v=value??0;const relevant=effects.filter(e=>e.resource===r&&e.kind===(v>0?'gain':'mitigation'));const adjustment=stackingBonus(relevant.reduce((n,e)=>n+(e.amount??0),0),args.resourceStackDice?.[r]??[]);const final=v>0?v+adjustment:Math.min(0,v+adjustment);next.permanent[r]+=final;finalChanges[r]=final;}
  next.fortunes.push({month:state.month,mode:'roll',dice:args.testDice,bonusDice:args.bonusDice,modifier:p.modifier,result:p.total,outcome:p.outcome,resource:args.resource,changes:finalChanges,source:'Guerra dos Tronos RPG · tabela6-18; Prosperidade · Stacking Bonuses · '+args.justification+' · dados de efeitos: '+JSON.stringify({fortune:args.fortuneStackDice??[],special:args.specialFortuneDice??[],resources:args.resourceStackDice??{}})});return next;
}
export const CONVERSIONS:Partial<Record<Resource,Resource[]>>={influence:['law'],lands:['defense'],population:['power'],power:['influence','law','population'],wealth:[...RESOURCE_KEYS].filter(r=>r!=='wealth')};
export function convertResources(state:HouseState,from:Resource,to:Resource,amount:number,rushed:boolean,rate?:number):HouseState {
  if(!CONVERSIONS[from]?.includes(to))throw new Error('Conversão não permitida na tabela 6-19.');
  if(!Number.isFinite(amount)||amount<=0)throw new Error('Quantidade inválida.');
  const actions=state.actions.filter(a=>a.month===state.month&&a.type.startsWith('convert:'));
  if(actions.length>=2||actions.length===1&&!rushed)throw new Error('A segunda conversão deve ser apressada; máximo duas por mês.');
  if(rate!==undefined&&!activeHoldings(state).flatMap(h=>h.effects).some(e=>e.kind==='conversion'))throw new Error('Taxa especial exige posse ativa com efeito de conversão.');
  const ratio=rate??(from==='wealth'?(rushed?3:2):(rushed?2:1)),cost=Math.floor(amount*ratio);
  if(balances(state).available[from]<cost)throw new Error('Saldo insuficiente para conversão.');
  const next=structuredClone(state);next.permanent[from]-=cost;next.permanent[to]+=amount;next.actions.push({month:state.month,type:`convert:${from}:${to}`,notes:`Tabela 6-19 · ${cost}:${amount}${rushed?' · apressada':''}`});return next;
}