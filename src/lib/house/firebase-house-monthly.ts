/**
 * Monthly House processing in the Firebase runtime, using the ORIGINAL
 * canonical engine (`advance`): projects whose duration ended become
 * completed and the House sheet moves to the official month.
 *
 * Runs once per House in its own transaction, with optimistic version,
 * idempotent month target and an immutable audit. Imported sheets are
 * never touched; only operational House economies change.
 */
import {createHash} from 'node:crypto';
import type {Firestore} from 'firebase-admin/firestore';
import {advance} from './engine';
import {constructionStateHash} from './firebase-construction-transaction';
import {verifiedEconomicState} from './firebase-economic-readonly';
import {monthFromHarptosDate} from '../calendar/house-time-impact';
import type {HouseState} from './types';
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
export type MonthlyResult={houseId:string;status:'processed'|'already_current'|'invalid_state'|'ahead_of_calendar'|'conflict';
  from?:number;to?:number;completedProjects?:number};

/** Pure step, exported for tests: returns the advanced state or null. */
export function monthlyStep(state:HouseState,target:number):{state:HouseState;completed:number}|null{
  if(!Number.isSafeInteger(target)||state.month>target||target-state.month>120)return null;
  const before=new Set(state.projects.filter(p=>p.status==='completed').map(p=>p.holdingId+':'+p.start));
  const next=JSON.parse(JSON.stringify(advance(state,target))) as HouseState;
  const completed=next.projects.filter(p=>p.status==='completed'&&!before.has(p.holdingId+':'+p.start)).length;
  return {state:next,completed};
}

export async function processMonthlyHouseEffects({db,snapshotId,actorUid,calendar,now=()=>new Date().toISOString()}:{
  db:Firestore;snapshotId:string;actorUid:string;
  calendar:{year:number;month:number;version:number};now?:()=>string;
}):Promise<{target:number;results:MonthlyResult[]}>{
  const target=monthFromHarptosDate(calendar);
  const runtime=db.collection('campaignCloudRuntime').doc(snapshotId);
  const economies=await runtime.collection('houseEconomies').limit(51).get();
  if(economies.docs.length>50)throw Error('too_many_house_economies');
  const results:MonthlyResult[]=[];
  for(const doc of economies.docs){
    const houseId=String(doc.data()?.['houseId']??'');
    const result=await db.runTransaction(async tx=>{
      const fresh=await tx.get(doc.ref);
      const v=fresh.data();
      const state=v&&v['status']==='active'&&v['seedVerified']===true&&v['sourceSnapshotId']===snapshotId&&
        v['stateHash']===constructionStateHash(v['state'])?verifiedEconomicState(v['state']):null;
      if(!v||!state||!Number.isSafeInteger(v['version']))return {houseId,status:'invalid_state'} as MonthlyResult;
      if(state.month===target)return {houseId,status:'already_current'} as MonthlyResult;
      if(state.month>target)return {houseId,status:'ahead_of_calendar'} as MonthlyResult;
      const step=monthlyStep(state,target);
      if(!step)return {houseId,status:'invalid_state'} as MonthlyResult;
      const at=now(),version=(v['version'] as number)+1;
      const afterHash=constructionStateHash(step.state);
      tx.update(doc.ref,{state:step.state,stateHash:afterHash,version,
        monthlyProcessedTo:target,lastMonthlyProcessingAt:at,updatedAt:at});
      tx.create(runtime.collection('houseMonthlyAudits').doc(hash('monthly:'+houseId+':'+target)),{
        action:'monthly_house_effects',houseId,actorUid,fromMonth:state.month,toMonth:target,
        completedProjects:step.completed,beforeStateHash:v['stateHash'],afterStateHash:afterHash,
        version,calendarVersion:calendar.version,sourceSnapshotId:snapshotId,at});
      return {houseId,status:'processed',from:state.month,to:target,completedProjects:step.completed} as MonthlyResult;
    }).catch(()=>({houseId,status:'conflict'} as MonthlyResult));
    results.push(result);
  }
  // The pending counter only clears when every operational House is current.
  // Depois de uma volta no tempo, Casas à frente do calendário já têm os
  // efeitos do mês aplicados: não há pendência a cobrar (Hub V2.1).
  if(results.every(r=>r.status==='processed'||r.status==='already_current'||r.status==='ahead_of_calendar'))
    await runtime.update({pendingHouseEffectMonths:0,houseMonthlyProcessedTo:target});
  return {target,results};
}
