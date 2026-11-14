/**
 * Pure Hub Temporal engine (port of 0060 publish_campaign_time_change and
 * 0065 preview_house_time_impacts / apply_calendar_months). No I/O: the
 * service feeds current state and persists the returned writes atomically.
 */
import {createHash} from 'node:crypto';
import {previewTimeChange,absoluteMonth,monthOfCalendar,calendarOrdinal,
  TimeError} from './harptos-core.mjs';
import {applyNobleHouseOperation} from './noble-house-core.mjs';

export {TimeError};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const UINT=/^[0-9]{1,6}$/,SINT=/^-?[0-9]{1,6}$/;
const FESTIVAL_MONTH={midwinter:0,greengrass:3,midsummer:6,shieldmeet:6,highharvestide:8,'feast-moon':10};
const fail=(code,m)=>{throw new TimeError(code,m);};
// jsonb ->> semantics: text of scalars, JSON text of containers, NULL for null.
const txt=v=>v==null?null:typeof v==='object'?JSON.stringify(v):String(v);
const isObj=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const RULE='Lote 9 · reconciliacao absoluta e atomica de meses de Harptos; sem renda/fortuna automatica';

export const requireNarratorScope=raw=>{
  if(!raw||raw.active!==true||raw.profile!=='narrador'||raw.admin!==true||raw.requirePasswordChange===true)
    fail('denied','Somente o Narrador altera o calendário');
};

function sheetStructureOk(houseId,state){
  return isObj(state)&&txt(state.schemaVersion)==='1'&&txt(state.houseId)===houseId&&
    UINT.test(txt(state.month)??'')&&Array.isArray(state.holdings)&&Array.isArray(state.projects);
}
const buildingProjectBad=p=>
  !UINT.test(txt(p.start)??'')||!UINT.test(txt(p.duration)??'')||
  !SINT.test(txt(p.modifier)??'0')||p.holdingId==null;
const dueDate=p=>Number(txt(p.start))+Number(txt(p.duration))+Number(txt(p.modifier)??'0');

/** Port of preview_house_time_impacts (read only). */
export function previewHouseTimeImpacts({calendar,targetDate,houses}){
  const base=monthOfCalendar(calendar),target=absoluteMonth(targetDate);
  if(Math.abs(target-base)>120)fail('invalid','Salto temporal superior a 120 meses');
  const items=[];
  const c={eligible:0,ahead:0,drafts:0,invalid:0,synced:0,projects:0};
  for(const h of [...houses].sort((a,b)=>a.houseId.localeCompare(b.houseId))){
    let disposition,houseMonth=null,due=0;
    const st=h.state;
    if(!sheetStructureOk(h.houseId,st)){disposition='invalid';c.invalid++;}
    else{
      houseMonth=Number(txt(st.month));
      if(st.phase==='active'&&st.projects.some(p=>isObj(p)&&p.status==='building'&&buildingProjectBad(p))){
        disposition='invalid';c.invalid++;
      }else if(st.phase!=='active'){disposition='draft';c.drafts++;}
      else if(target<=base){disposition='historical';c.synced++;}
      else if(houseMonth>=target){
        if(houseMonth>base){disposition='ahead';c.ahead++;}else{disposition='aligned';c.synced++;}
      }else{
        disposition='advance';c.eligible++;
        due=st.projects.filter(p=>isObj(p)&&p.status==='building'&&!buildingProjectBad(p)&&
          UINT.test(txt(p.start)??'')&&dueDate(p)<=target).length;
        c.projects+=due;
      }
    }
    items.push({house_id:h.houseId,version:h.version,month:houseMonth,status:disposition,project_candidates:due});
  }
  return {calendar_version:calendar.version,base_month:base,target_month:target,total:items.length,
    eligible:c.eligible,ahead:c.ahead,drafts:c.drafts,invalid:c.invalid,aligned_or_historical:c.synced,
    project_candidates:c.projects,houses:items,backdated:target<base};
}

/** Pure project/holding reconciliation of one active house sheet. */
export function reconcileSheetState(state,targetMonth){
  let holdings=state.holdings,projects=state.projects,finished=0,cancelled=0;
  for(let round=1;round<=projects.length+1;round++){
    let changed=false;const next=[];
    for(let p of projects){
      if(isObj(p)&&p.status==='building'){
        if(buildingProjectBad(p))fail('invalid_sheet','Projeto sem duracao/inicio valido; revisao necessaria');
        if(dueDate(p)<=targetMonth){
          const holdingId=txt(p.holdingId);
          const h=holdings.find(v=>isObj(v)&&txt(v.id)===holdingId);
          const hs=h===undefined?undefined:h.status;
          if(h===undefined||(hs!=null&&hs!=='building'&&hs!=='active')){
            p={...p,status:'cancelled'};cancelled++;changed=true;
          }else if(hs==='active'){
            p={...p,status:'completed'};finished++;changed=true;
          }else{
            const parentId=txt(h.parentId);
            if(!parentId){p={...p,status:'completed'};finished++;changed=true;}
            else{
              const parent=holdings.find(v=>isObj(v)&&txt(v.id)===parentId);
              if(parent!==undefined&&parent.status==='active'){p={...p,status:'completed'};finished++;changed=true;}
            }
            if(p.status==='completed')
              holdings=holdings.map(v=>isObj(v)&&txt(v.id)===holdingId?{...v,status:'active'}:v);
          }
        }
      }
      next.push(p);
    }
    projects=next;
    if(!changed)break;
  }
  return {state:{...state,month:targetMonth,projects,holdings},finished,cancelled};
}

/** Port of apply_calendar_months: one noble-house ledger operation per active house. */
export function reconcileHouseMonths({calendar,delta,houses,advanceLedger,actorUid,newKey,now}){
  if(!Number.isInteger(delta)||delta<=0)return [];
  if(delta>120)fail('invalid','Avanço mensal superior a 120 meses');
  const target=monthOfCalendar(calendar)+delta;
  if(target>9999*12+11)fail('invalid','Ano destino excede Harptos');
  const actor={role:'narrador',uid:actorUid,memberHouseIds:new Set(),editHouseIds:new Set()};
  const writes=[];
  for(const h of [...houses].sort((a,b)=>a.houseId.localeCompare(b.houseId))){
    if(!sheetStructureOk(h.houseId,h.state))fail('invalid_sheet','Casa com ficha temporal invalida; revise antes de avancar');
    if(h.state.phase!=='active')continue;
    const start=Number(txt(h.state.month));
    if(start>=target)continue;
    if(advanceLedger.has(h.houseId+':'+target))
      fail('conflict','Casa ja possui lancamento temporal para o mes; verifique o historico');
    const r=reconcileSheetState(h.state,target);
    const op=applyNobleHouseOperation({actor,now,currentSheet:{state:h.state,version:h.version},existingLedger:null,
      request:{houseId:h.houseId,operationKey:newKey(h.houseId),action:'calendar_advance',version:h.version,
        state:r.state,
        explanation:'Hub Temporal · mes absoluto '+start+' → '+target+' · obras concluidas '+r.finished+
          ' · projetos cancelados '+r.cancelled,
        rule:RULE}});
    writes.push({houseId:h.houseId,sheet:op.sheet,ledger:op.ledger});
  }
  return writes;
}

function targetParts(date){
  const year=Number(date.slice(0,4));
  if(date.slice(5,7)==='F-'){const f=date.slice(7);return {year,month:FESTIVAL_MONTH[f],day:30,festival:f};}
  return {year,month:Number(date.slice(5,7))-1,day:Number(date.slice(8,10)),festival:null};
}
const signatureOf=r=>createHash('sha256').update(JSON.stringify({
  version:r.version,mode:r.mode,date:r.date??null,count:r.count??1,
  reason:r.reason??'',backdate:r.allowBackdate===true})).digest('hex');

/** Port of publish_campaign_time_change. Returns everything to persist. */
export function planTimeChange({calendar,existingOp,request,actorUid,houses,advanceLedger,newKey,now}){
  const r=request||{};
  if(!actorUid||typeof r.key!=='string'||!UUID.test(r.key)||!Number.isInteger(r.version))
    fail('invalid','Identificação, versão e chave temporal obrigatórias');
  const reason=r.reason??'';
  if(typeof reason!=='string')fail('invalid','Justificativa inválida');
  const signature=signatureOf(r);
  if(existingOp){
    if(existingOp.actor!==actorUid||existingOp.requestHash!==signature)
      fail('conflict','Chave temporal já utilizada com outros parâmetros');
    return {duplicate:true,result:{...existingOp.afterState,duplicate:true,operationKey:r.key}};
  }
  if(!calendar)fail('invalid','Calendário oficial indisponível');
  if(calendar.version!==r.version)fail('conflict','Calendário alterado; recarregue antes de salvar');
  const preview=previewTimeChange({calendar,mode:r.mode,date:r.date??null,count:r.count??1,
    allowBackdate:r.allowBackdate===true,houseSheets:houses});
  const fromDate=preview.from,toDate=preview.to,delta=preview.month_delta;
  if(calendarOrdinal(toDate)<calendarOrdinal(fromDate)&&(r.allowBackdate!==true||reason.trim().length<10))
    fail('invalid','Retrocesso exige autorização expressa e justificativa de dez caracteres');
  const houseWrites=reconcileHouseMonths({calendar,delta,houses,advanceLedger,actorUid,newKey,now});
  const at=now||new Date().toISOString();
  const t=targetParts(toDate);
  const saved={...calendar,year:t.year,month:t.month,day:t.day,festival:t.festival,autoAdvance:false,
    version:calendar.version+1,updatedAt:at,updatedBy:actorUid,publishedAt:at};
  const trimmed=reason.trim();
  const calendarAudit={actor:actorUid,beforeState:calendar,afterState:saved,
    reason:'Hub Temporal · '+r.mode+' · operação '+r.key+(trimmed?' · '+trimmed.slice(0,500):''),createdAt:at};
  const operation={id:r.key,actor:actorUid,requestHash:signature,expectedVersion:r.version,mode:r.mode,
    fromDate,toDate,beforeState:calendar,afterState:saved,reason:trimmed.slice(0,500),createdAt:at};
  return {duplicate:false,calendar:saved,operation,calendarAudit,houseWrites,preview,
    scheduleReason:'Publicação temporal '+r.key,
    result:{...saved,duplicate:false,operationKey:r.key}};
}
