import { balances } from './engine';
import { reconciliationPreview, type ReconciliationRecord } from './reconciliation';
import { RESOURCE_KEYS, type Resources, type HouseState } from './types';
import { regionBonus } from './regions';
const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
export function selectedSourceTotals(record:ReconciliationRecord,houseId:string,houseName:string,origin:string):Resources {
 if(record.house_id!==houseId)throw new Error('Fonte de outra casa.');
 const candidate=reconciliationPreview(record,houseName).candidates.find(c=>c.origin===origin&&c.origin.endsWith('· Total'));
 if(!candidate?.houseName||norm(candidate.houseName)!==norm(houseName))throw new Error('Identidade do bloco não confirmada.');
 if(RESOURCE_KEYS.some(k=>candidate.values[k]===null))throw new Error('Total incompleto.');
 if(/#(?:REF!|DIV\/0!|VALUE!|N\/A|NAME\?)/i.test(record.content))throw new Error('Fonte contém erro de planilha; requer conciliação.');
 return Object.fromEntries(RESOURCE_KEYS.map(k=>[k,candidate.values[k]])) as Resources;
}
export function confirmedSourceTotals(record:ReconciliationRecord,houseName:string):Resources {
 const p=reconciliationPreview(record,houseName);
 if(!p.identity.nome||norm(p.identity.nome)!==norm(houseName))throw new Error('Identidade da fonte não confirmada.');
 const rows=p.candidates.filter(c=>c.origin.endsWith('· Total')&&RESOURCE_KEYS.every(k=>c.values[k]!==null));
 const distinct=[...new Map(rows.map(c=>[JSON.stringify(c.values),c.values])).values()];
 if(distinct.length!==1)throw new Error('Totais ausentes ou divergentes; decisão do Narrador necessária.');
 if(/#(?:REF!|DIV\/0!|VALUE!|N\/A|NAME\?)/i.test(record.content))throw new Error('Fonte contém erro de planilha; requer conciliação.');
 const values=distinct[0];if(!values)throw new Error('Totais indisponíveis.');
 return Object.fromEntries(RESOURCE_KEYS.map(k=>[k,values[k]])) as Resources;
}
export function linkSourceTotals(state:HouseState,totals:Resources,source:string):HouseState {
 if(state.importSources.some(s=>s.startsWith('record:')))throw new Error('Casa já vinculada a uma fonte.');
 const next=structuredClone(state);
 // Source totals are already final: never include the regional bonus twice.
 // Account for the whole current sheet including historic events and player bonuses.
 const oldTotals=balances(state).total;
 next.importSources.push(source);
 next.method='import';next.regionalApplied=false;
 for(const k of RESOURCE_KEYS){
  if(!Number.isFinite(totals[k])||totals[k]<0||totals[k]>100000)throw new Error('Total inválido.');
  next.permanent[k]+=totals[k]-(oldTotals[k]-(state.regionalApplied?regionBonus(state.identity.region)[k]:0));
 }
 if(RESOURCE_KEYS.some(k=>balances(next).available[k]<0))throw new Error('Totais não cobrem compras atuais; conciliação necessária.');
 next.pending=[...new Set([...next.pending,'Fonte vinculada: totais conferidos; posses, tropas, equipamentos e eventos legados ainda não conciliados.'])];
 return next;
}