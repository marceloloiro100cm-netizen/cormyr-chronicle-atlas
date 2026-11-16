/** Read-only Firebase House economy. All numeric projections use the
 * existing Cormyr/GoT rules in engine.ts, NEVER a secondary approximation.
 * A missing or malformed snapshot fails closed rather than substituting 0.
 */
import {balances,quote,type Balance} from './engine';
import {CORE_CATALOG} from './catalog';
import {RESOURCE_KEYS,type CatalogItem,type HouseState,type Resources} from './types';

type Raw=Record<string,unknown>;
export type QuotePreview={
  itemId:string;itemName:string;source:string;pending:string|null;
  costs:CatalogItem['costs'];discounts:{source:string;resource:string;amount:number}[];
  before:Resources;after:Resources;errors:string[];available:boolean;
};
export type EconomicSnapshot={
  houseId:string;month:number;balances:Balance;domains:{id:string;name:string}[];
};
const object=(v:unknown):v is Raw=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const text=(v:unknown):v is string=>typeof v==='string'&&v['length']>0&&v['length']<=300;
const numeric=(v:unknown):v is number=>typeof v==='number'&&
  Number.isFinite(v)&&Math.abs(v)<=100000;
const integer=(v:unknown):v is number=>numeric(v)&&Number.isSafeInteger(v);
const key=(v:unknown):v is (typeof RESOURCE_KEYS)[number]=>
  typeof v==='string'&&RESOURCE_KEYS.some(r=>r===v);
const resourceValues=(v:unknown,optional=false):boolean=>{
  if(v===undefined||v===null)return optional;
  if(!object(v))return false;
  return Object.entries(v).every(([k,n])=>key(k)&&integer(n));
};
const cost=(v:unknown):boolean=>object(v)&&key(v['resource'])&&
  (v['mode']==='allocation'||v['mode']==='permanent')&&
  integer(v['amount'])&&Number(v['amount'])>=0;
const costs=(v:unknown):boolean=>Array.isArray(v)&&
  v['length']<=100&&v['every'](cost);
const effect=(v:unknown):boolean=>object(v)&&
  typeof v['kind']==='string'&&typeof v['description']==='string'&&
  (v['amount']===undefined||numeric(v['amount']))&&
  (v['resource']===undefined||key(v['resource']))&&
  (v['target']===undefined||typeof v['target']==='string')&&
  (v['seasons']===undefined||(Array.isArray(v['seasons'])&&v['seasons'].every(
    (s:unknown)=>['winter','spring','summer','autumn'].includes(String(s)))))&&
  (v['maxResource']===undefined||(object(v['maxResource'])&&
    key(v['maxResource']['resource'])&&numeric(v['maxResource']['maximum'])));
const holding=(v:unknown):boolean=>object(v)&&
  text(v['id'])&&text(v['itemId'])&&typeof v['name']==='string'&&
  typeof v['domainId']==='string'&&typeof v['source']==='string'&&
  typeof v['status']==='string'&&
  ['active','building','destroyed','abandoned','sold','cancelled'].includes(v['status'])&&
  costs(v['costs'])&&Array.isArray(v['effects'])&&v['effects'].length<=100&&
  v['effects'].every(effect)&&resourceValues(v['allocatedCosts'],true)&&
  (v['lostAllocation']===undefined||typeof v['lostAllocation']==='boolean')&&
  (v['parentId']===undefined||typeof v['parentId']==='string');
const unit=(v:unknown):boolean=>object(v)&&
  (v['destroyed']===undefined||typeof v['destroyed']==='boolean')&&
  costs(v['costs'])&&resourceValues(v['allocatedCosts'],true);
const domain=(v:unknown):boolean=>object(v)&&
  text(v['id'])&&typeof v['name']==='string'&&v['name'].length<=300&&
  typeof v['terrain']==='string'&&
  Array.isArray(v['features'])&&v['features'].every((f:unknown)=>typeof f==='string')&&
  (v['community']===undefined||typeof v['community']==='string');
const vassal=(v:unknown):boolean=>object(v)&&
  ['proposed','approved','ended'].includes(String(v['status']))&&
  (v['influencePenalty']===undefined||numeric(v['influencePenalty']));
const consequence=(v:unknown):boolean=>object(v)&&
  typeof v['active']==='boolean'&&resourceValues(v['changes'],true);
const history=(v:unknown):boolean=>{
  if(v===undefined||v===null)return true;
  return object(v)&&typeof v['applied']==='boolean'&&
    Array.isArray(v['events'])&&v['events'].length<=200&&
    v['events'].every((e:unknown)=>object(e)&&resourceValues(e['changes']));
};
const creationBonus=(v:unknown):boolean=>object(v)&&
  key(v['resource'])&&integer(v['die'])&&Number(v['die'])>=1&&Number(v['die'])<=6;
const boundedList=(v:unknown,max:number,valid:(v:unknown)=>boolean)=>
  Array.isArray(v)&&v['length']<=max&&v['every'](valid);
const normalBalances=(v:Balance)=>
  Object.values(v).every(row=>RESOURCE_KEYS.every(r=>numeric(row[r])));

/** A complete, structurally usable HouseState is needed to invoke balances().
 * Never coerce a missing array or permanent resource to an empty/zero value.
 */
export function verifiedEconomicState(raw:Raw):HouseState|null{
  const base=object(raw['base'])?raw['base']:null;
  const permanent=object(raw['permanent'])?raw['permanent']:null;
  if(!object(raw)||raw['schemaVersion']!==1||!text(raw['houseId'])||
     !['draft','review','active'].includes(String(raw['phase']))||
     !['budget','roll','import'].includes(String(raw['method']))||
     !integer(raw['month'])||Number(raw['month'])<0||
     !object(raw['identity'])||typeof raw['identity']['region']!=='string'||
     typeof raw['regionalApplied']!=='boolean'||
     !base||!permanent||
     !RESOURCE_KEYS.every(r=>integer(base[r])&&integer(permanent[r]))||
     !boundedList(raw['domains'],100,domain)||
     !boundedList(raw['holdings'],600,holding)||
     !boundedList(raw['units'],600,unit)||
     !boundedList(raw['projects'],600,object)||
     !boundedList(raw['court'],600,object)||
     !boundedList(raw['fortunes'],600,object)||
     !boundedList(raw['actions'],600,object)||
     !boundedList(raw['importSources'],250,x=>typeof x==='string')||
     !history(raw['creationHistory'])||
     (raw['creationBonusesApplied']!==undefined&&
      typeof raw['creationBonusesApplied']!=='boolean')||
     (raw['creationBonuses']!==undefined&&!boundedList(raw['creationBonuses'],200,creationBonus))||
     (raw['mailConsequences']!==undefined&&!boundedList(raw['mailConsequences'],600,consequence))||
     (raw['vassals']!==undefined&&!boundedList(raw['vassals'],200,vassal)))
    return null;
  // Full state is only used as an input to the ORIGINAL canonical functions.
  return raw as unknown as HouseState;
}

export function calculateFirebaseHouseEconomy(raw:Raw):EconomicSnapshot|null{
  const state=verifiedEconomicState(raw);
  if(!state)return null;
  try{
    const computed=balances(state);
    if(!normalBalances(computed))return null;
    return{houseId:state.houseId,month:state.month,balances:computed,
      domains:state.domains.map(d=>({id:d.id,name:d.name}))};
  }catch{return null;}
}

const QUOTABLE=new Set(['fortification','estate','settlement']);
export const ECONOMY_QUOTE_ITEMS=CORE_CATALOG
  .filter(item=>QUOTABLE.has(item.category))
  .map(item=>({id:item.id,name:item.name,category:item.category,source:item.source}));

export function previewFirebaseHouseConstruction(
  raw:Raw,itemId:string,domainId:string,
):QuotePreview|null{
  const state=verifiedEconomicState(raw);
  const item=CORE_CATALOG.find(i=>i.id===itemId&&QUOTABLE.has(i.category));
  if(!state||!item||!state.domains.some(d=>d.id===domainId))return null;
  if(!calculateFirebaseHouseEconomy(raw))return null;
  try{
    const result=quote(item,state,domainId);
    if(!RESOURCE_KEYS.every(r=>numeric(result.before[r])&&numeric(result.after[r]))||
       !result.costs.every(c=>cost(c)))return null;
    return{
      itemId:item.id,itemName:item.name,source:item.source,
      pending:item.pending??null,costs:result.costs,
      discounts:result.discounts.map(d=>({
        source:d.source,resource:d.resource,amount:d.amount,
      })),before:result.before,after:result.after,
      errors:result.errors,
      // A quote can be possible by rules and still be NOT authorized
      // for purchase: no mutation or runtime approval is made here.
      available:result.errors.length===0&&!item.pending,
    };
  }catch{return null;}
}
