/** Preview purchases using the existing canonical GoT House engine.
 * Never persists a quote, allocates resources, advances time or rolls dice.
 * The caller must already have an authorized getHouse snapshot.
 */
import {CORE_CATALOG,findItem} from './catalog';
import {quote} from './engine';
import {RESOURCE_KEYS,type HouseState} from './types';

type RecordLike=Record<string,unknown>;
const safeId=(v:unknown):v is string=>
  typeof v==='string'&&v.length>0&&v.length<=128&&
  !/[\u0000-\u001f\u007f/]/.test(v);
const record=(v:unknown):v is RecordLike=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const max=100000;
const int=(v:unknown):v is number=>Number.isSafeInteger(v)&&Math.abs(v as number)<=max;
const resources=(v:unknown):boolean=>
  record(v)&&RESOURCE_KEYS.every(k=>int(v[k]));
export class ConstructionPreviewError extends Error{
  readonly code:string;
  readonly status:number;
  constructor(code:string,status=400){
    super(code);this.name='ConstructionPreviewError';
    this.code=code;this.status=status;
  }
}
export type QuotePreviewInput={
  houseId:string;itemId:string;domainId:string;
  parentId?:string;supportId?:string;replaceId?:string;
};
function validate(input:unknown):QuotePreviewInput{
  if(!record(input)||
     Object.keys(input).some(k=>![
       'houseId','itemId','domainId','parentId','supportId','replaceId',
     ].includes(k))||
     !safeId(input['houseId'])||!safeId(input['itemId'])||
     !safeId(input['domainId'])||
     ['parentId','supportId','replaceId'].some(k=>
       input[k]!==undefined&&!safeId(input[k])))
    throw new ConstructionPreviewError('invalid_quote_request');
  return input as QuotePreviewInput;
}
function stateReady(v:unknown,houseId:string):v is HouseState{
  if(!record(v)||v['schemaVersion']!==1||v['houseId']!==houseId||
     !['draft','review','active'].includes(v['phase'] as string)||
     !['budget','roll','import'].includes(v['method'] as string)||
     typeof v['regionalApplied']!=='boolean'||
     !int(v['month'])||!resources(v['base'])||!resources(v['permanent'])||
     !record(v['identity'])||typeof v['identity']['region']!=='string'||
     !Array.isArray(v['domains'])||!Array.isArray(v['holdings'])||
     !Array.isArray(v['units'])||!Array.isArray(v['projects'])||
     !Array.isArray(v['fortunes'])||!Array.isArray(v['actions'])||
     !Array.isArray(v['court']))return false;
  if(v['domains'].length>100||v['holdings'].length>500||
     v['units'].length>400||v['fortunes'].length>500||
     v['projects'].length>500)return false;
  if(v['domains'].some(d=>!record(d)||!safeId(d['id'])||
    typeof d['terrain']!=='string'||!Array.isArray(d['features'])))return false;
  if(v['holdings'].some(h=>!record(h)||!safeId(h['id'])||
     typeof h['source']!=='string'||!Array.isArray(h['costs'])||
     !Array.isArray(h['effects'])||
     !['active','building','destroyed','abandoned','sold','cancelled']
       .includes(h['status'] as string)))return false;
  if(v['units'].some(u=>!record(u)||!Array.isArray(u['costs'])))return false;
  return true;
}
function finiteResults(v:RecordLike):boolean{
  const pairs=['before','after'] as const;
  return pairs.every(k=>resources(v[k]))&&
    Array.isArray(v['costs'])&&v['costs'].every(c=>
      record(c)&&int(c['amount'])&&RESOURCE_KEYS.includes(c['resource'] as never)&&
      ['permanent','allocation'].includes(c['mode'] as string));
}
export function previewHouseConstruction(
  state:unknown,input:unknown,houseName:string,version:number,
){
  const req=validate(input);
  if(!Number.isSafeInteger(version)||version<0||!stateReady(state,req.houseId))
    throw new ConstructionPreviewError('quote_source_unavailable',503);
  const item=findItem(req.itemId);
  if(!item)
    throw new ConstructionPreviewError('item_not_found',404);
  if(!state.domains.some(d=>d.id===req.domainId))
    throw new ConstructionPreviewError('domain_not_found',404);
  if(req.parentId&&!state.holdings.some(h=>h.id===req.parentId))
    throw new ConstructionPreviewError('parent_not_found',404);
  if(req.supportId&&!state.holdings.some(h=>h.id===req.supportId))
    throw new ConstructionPreviewError('support_not_found',404);
  if(req.replaceId&&!state.holdings.some(h=>h.id===req.replaceId))
    throw new ConstructionPreviewError('replacement_not_found',404);
  try{
    const data=quote(item,state,req.domainId,req.parentId,
      req.supportId,req.replaceId);
    if(!finiteResults(data as unknown as RecordLike))
      throw Error('invalid computed balances');
    const errors=data.errors.map(v=>String(v).slice(0,300)).slice(0,20);
    return {
      houseId:req.houseId,houseName:houseName.slice(0,180),
      sheetVersion:version,
      item:{id:item.id,name:item.name,category:item.category,
        duration:item.duration,pending:item.pending??null},
      domainId:req.domainId,domainName:
        state.domains.find(d=>d.id===req.domainId)?.name.slice(0,160)??'Domínio',
      before:data.before,after:data.after,
      costs:data.costs,
      discounts:data.discounts.slice(0,30).map(x=>({
        resource:x.resource,amount:x.amount,source:x.source.slice(0,160),
      })),
      errors,purchaseEligibleByRules:errors.length===0&&!item.pending,
      // Eligibility is ONLY a historical-snapshot preview, not a buying gate.
      readOnly:true,purchaseEnabled:false,
      snapshotReconciliationPending:true,
    };
  }catch(e){
    if(e instanceof ConstructionPreviewError)throw e;
    throw new ConstructionPreviewError('quote_source_unavailable',503);
  }
}
/** Only public catalog metadata: no snapshot documents and no internal rules. */
export const constructionChoices=CORE_CATALOG.filter(x=>[
  'fortification','estate','settlement','improvement','community','feature',
  'terrain','lifestyle','equipment','personage',
].includes(x.category)).map(x=>({
  id:x.id,name:x.name,category:x.category,
}));
