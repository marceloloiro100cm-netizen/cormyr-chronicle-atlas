import { balances } from './engine';
import type { HouseState, Cost, Holding, Unit } from './types';

/** Only reconcile exact, historically documented legacy rows.
 * This is a preview+Narrator-confirmed operation, NOT a migration of live sheets.
 * We never silently rewrite imports or re-price other holdings. */
type Fix={house:string;id:string;description:string};
const COST=(resource:Cost['resource'],amount:number,mode:Cost['mode']='allocation'):Cost=>({resource,amount,mode});
function isCost(row:Cost[]|undefined,resource:Cost['resource'],amount:number,mode:Cost['mode']='allocation'){
 return row?.length===1&&row[0]?.resource===resource&&row[0]?.amount===amount&&row[0]?.mode===mode;
}
function legacyHolding(state:HouseState,id:string,itemId:string,resource:Cost['resource'],amount:number):Holding|undefined {
 const h=state.holdings.find(x=>x.id===id&&x.itemId===itemId);
 return h&&/^legacy(?:$|\b)/i.test(h.source)&&isCost(h.costs,resource,amount)&&!h.allocatedCosts?h:undefined;
}
function legacyUnit(state:HouseState,id:string,type:string,resource:Cost['resource'],amount:number):Unit|undefined {
 const u=state.units.find(x=>x.id===id&&x.types.length===1&&x.types[0]===type&&x.training==='trained');
 return u&&isCost(u.costs,resource,amount)&&!u.allocatedCosts?u:undefined;
}
export function legacyCostIssues(state:HouseState,houseName:string):Fix[]{
 const name=houseName.normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase().replace(/^casa\s+/,'');
 const result:Fix[]=[];
 if(name==='silversky'&&legacyHolding(state,'hold-silversky-mine','pros-basic-mine','lands',10))
   result.push({house:'Silversky',id:'hold-silversky-mine',description:'Mina: 10 Terras alocadas → 10 Riqueza alocadas'});
 if(name==='everlost'){
  if(legacyHolding(state,'hold-everlost-hall','hall','defense',10))
   result.push({house:'Everlost',id:'hold-everlost-hall',description:'Salão: 10 Defesa → 20 Defesa alocadas'});
  if(legacyHolding(state,'hold-everlost-weapons','pros-bowyer-fletcher-or-weaponsmith','wealth',6))
   result.push({house:'Everlost',id:'hold-everlost-weapons',description:'Melhoria militar: remover classificação como Armeiro; 6 Riqueza, gasto permanente, não alocação'});
 }
 if(name==='fewmerry'){
  if(legacyUnit(state,'unit-fewmerry-2','infantry','power',5))
   result.push({house:'Fewmerry',id:'unit-fewmerry-2',description:'Infantaria treinada: 5 Poder → 7 Poder alocados'});
  if(legacyUnit(state,'unit-fewmerry-3','support','power',7))
   result.push({house:'Fewmerry',id:'unit-fewmerry-3',description:'Apoio treinado: 7 Poder → 5 Poder alocados'});
 }
 if(name==='ashkar'&&legacyUnit(state,'unit-ashkar-1','support','power',7))
   result.push({house:'Ashkar',id:'unit-ashkar-1',description:'Apoio treinado: 7 Poder → 5 Poder alocados'});
 return result;
}
export function reconcileLegacyCosts(state:HouseState,houseName:string,ids:string[]):HouseState {
 const allowed=legacyCostIssues(state,houseName);
 if(!ids.length||new Set(ids).size!==ids.length||ids.some(id=>!allowed.some(row=>row.id===id)))
  throw new Error('Correção não corresponde à fonte legada ou já foi aplicada. Nenhuma ficha alterada.');
 const next=structuredClone(state);
 for(const id of ids){
  const holding=next.holdings.find(h=>h.id===id);
  const unit=next.units.find(u=>u.id===id);
  if(id==='hold-silversky-mine'&&holding)holding.costs=[COST('wealth',10)];
  if(id==='hold-everlost-hall'&&holding)holding.costs=[COST('defense',20)];
  if(id==='hold-everlost-weapons'&&holding){
   holding.costs=[COST('wealth',6,'permanent')];
   holding.itemId='legacy-military-equipment-upgrade';
   holding.category='equipment';
   holding.effects=[]; // Never inherit the effects of a different catalogue item.
   next.permanent.wealth-=6; // Transfer committed allocation into a permanent expenditure.
  }
  if(id==='unit-fewmerry-2'&&unit)unit.costs=[COST('power',7)];
  if(id==='unit-fewmerry-3'&&unit)unit.costs=[COST('power',5)];
  if(id==='unit-ashkar-1'&&unit)unit.costs=[COST('power',5)];
 }
 return next;
}
export function previewLegacyCostReconciliation(state:HouseState,houseName:string){
 const issues=legacyCostIssues(state,houseName),fixed=issues.length?reconcileLegacyCosts(state,houseName,issues.map(i=>i.id)):state;
 const before=balances(state),after=balances(fixed);
 return {issues,before,after};
}
