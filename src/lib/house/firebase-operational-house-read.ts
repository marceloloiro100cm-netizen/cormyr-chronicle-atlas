/**
 * Firebase Cloud — authorized read-only projection of a reconciled House
 * operational economy. Never return raw state, audit, access docs or UID.
 * Construction write approval and read approval are independent gates.
 */
import {createFirebaseCloudReadonly}
  from '../../../scripts/firebase/cloud-readonly-service.mjs';
import {constructionStateHash} from './firebase-construction-transaction';
import {calculateFirebaseHouseEconomy,verifiedEconomicState} from './firebase-economic-readonly';
import {monthFromHarptosDate} from '@/lib/calendar/house-time-impact';
import {RESOURCE_KEYS,type Resource,type Resources} from './types';
import type {Auth} from 'firebase-admin/auth';
import type {Firestore} from 'firebase-admin/firestore';

const SHA=/^[a-f0-9]{64}$/;
const text=(value:unknown,max=160):string|null=>
  typeof value==='string'&&value.trim()?value.trim().slice(0,max):null;
const object=(value:unknown):value is Record<string,unknown>=>
  !!value&&typeof value==='object'&&!Array.isArray(value);
const number=(value:unknown):value is number=>
  typeof value==='number'&&Number.isSafeInteger(value)&&value>=0&&value<=2147483646;
const status=['active','building','destroyed','abandoned','sold','cancelled'];
const projectStatus=['building','completed','cancelled'];

export class CloudEconomyReadError extends Error{
  constructor(readonly code:string,readonly status=503){
    super(code);this.name='CloudEconomyReadError';
  }
}
const fail=(code:string,status=503):never=>{throw new CloudEconomyReadError(code,status);};
export type OperationalEconomyView={
  available:true;readOnly:true;houseId:string;houseName:string;
  version:number;sourceSheetVersion:number;calendarVersion:number;
  month:number;updatedAt:string|null;
  balances:{total:Resources;allocated:Resources;committed:Resources;available:Resources};
  holdings:{id:string;name:string;status:string;domainName:string}[];
  holdingsTotal:number;holdingsTruncated:boolean;
  projects:{id:string;name:string;status:string;holdingName:string;
    start:number|null;duration:number|null}[];
  projectsTotal:number;projectsTruncated:boolean;
};
export type OperationalEconomyUnavailable={available:false;readOnly:true};
export type OperationalEconomyResponse=OperationalEconomyView|OperationalEconomyUnavailable;

function sanitizedEconomy(source:Record<string,unknown>,stateRaw:unknown,
  houseName:string,version:number,sourceSheetVersion:number,
  calendarVersion:number,updatedAt:unknown):OperationalEconomyView|null{
  const state=object(stateRaw)?verifiedEconomicState(stateRaw):null;
  if(!state||state.phase!=='active')return null;
  const economy=calculateFirebaseHouseEconomy(stateRaw as Record<string,unknown>);
  if(!economy)return null;
  // Do not infer missing or invalid holdings and projects.
  if(state.holdings.some(h=>!h.id||!h.name||!status.includes(h.status)||
    typeof h.domainId!=='string')||
     state.projects.some(p=>!p.id||!p.name||!p.holdingId||
       !projectStatus.includes(p.status)))return null;
  const domainName=new Map(state.domains.map(d=>[d.id,d.name]));
  const holdingName=new Map(state.holdings.map(h=>[h.id,h.name]));
  const holdings=state.holdings.slice(0,100).map(h=>({
    id:h.id,name:h.name.slice(0,160),status:h.status,
    domainName:(domainName.get(h.domainId)??'Domínio não identificado').slice(0,160),
  }));
  const projects=state.projects.slice(0,75).map(p=>({
    id:p.id,name:p.name.slice(0,160),status:p.status,
    holdingName:(holdingName.get(p.holdingId)??'Posse não identificada').slice(0,160),
    start:number(p.start)?p.start:null,
    duration:number(p.duration)?p.duration:null,
  }));
  const toResourceRow=(value:Resources):Resources=>
    Object.fromEntries(RESOURCE_KEYS.map(k=>[k,value[k]])) as Resources;
  return {
    available:true,readOnly:true,houseId:state.houseId,
    houseName:houseName.slice(0,160),version,sourceSheetVersion,
    calendarVersion,month:state.month,
    updatedAt:typeof updatedAt==='string'&&Number.isFinite(Date.parse(updatedAt))
      ?updatedAt:null,
    balances:{
      total:toResourceRow(economy.balances.total),
      allocated:toResourceRow(economy.balances.allocated),
      committed:toResourceRow(economy.balances.committed),
      available:toResourceRow(economy.balances.available),
    },
    holdings,holdingsTotal:state.holdings.length,
    holdingsTruncated:state.holdings.length>100,
    projects,projectsTotal:state.projects.length,
    projectsTruncated:state.projects.length>75,
  };
}
type Options={
  db:Firestore;auth:Auth;snapshotId:string;projectId:string;
  enabled?:boolean;env?:NodeJS.ProcessEnv;
};
export function createFirebaseOperationalHouseRead({
  db,auth,snapshotId,projectId,enabled=false,env=process.env,
}:Options){
  if(!enabled||projectId!=='cormyr'||!SHA.test(snapshotId)||
     env['FIRESTORE_EMULATOR_HOST']||env['FIREBASE_AUTH_EMULATOR_HOST']||
     typeof auth?.verifyIdToken!=='function'||typeof db?.collection!=='function')
    fail('firebase_operational_economy_read_disabled');
  const permission=createFirebaseCloudReadonly({
    db,auth,snapshotId,projectId,enabled:true,env,
  });
  const timeStage=db.collection('migrationTimeEngineStage').doc(snapshotId);
  const runtimeRef=db.collection('campaignCloudRuntime').doc(snapshotId);
  return {
    async summary(idToken:string,houseId:unknown):Promise<OperationalEconomyResponse>{
      // Must authorize FIRST, even when runtime/seed is not provisioned.
      const house=await permission.getHouse(idToken,houseId) as {
        id:string;name:string;version:number;state:unknown;
      };
      if(!number(house.version)||!object(house.state))
        fail('house_source_unavailable');
      const opRef=runtimeRef.collection('houseEconomies').doc(
        // The operational ID must match the write service's SHA-256 scheme.
        (await import('node:crypto')).createHash('sha256')
          .update('house:'+house.id).digest('hex'));
      const [time,calendar,runtime,op]=await Promise.all([
        timeStage.get(),timeStage.collection('calendar').doc('current').get(),
        runtimeRef.get(),opRef.get(),
      ]);
      if(!time.exists||time.data()?.status!=='complete'||
         time.data()?.private!==true)return {available:false,readOnly:true};
      const date=calendar.data();
      if(!calendar.exists||!date||!number(date.version)||
         !number(date.year)||date.year===0||
         !number(date.month)||date.month>11||
         !number(date.day)||date.day===0||date.day>30)
        return {available:false,readOnly:true};
      const cfg=runtime.data();
      if(!runtime.exists||cfg?.status!=='active'||cfg.private!==true||
         cfg.sourceSnapshotId!==snapshotId||
         cfg.sourceSnapshotReconciled!==true||
         cfg.applicationEnabled!==true||
         cfg.constructionReadApproved!==true||
         cfg.constructionSeededVerified!==true||
         cfg.calendarVersion!==date.version)
        return {available:false,readOnly:true};
      const v=op.data();
      if(!op.exists||!object(v)||v['status']!=='active'||v['private']!==true||
         v['sourceSnapshotId']!==snapshotId||v['sourceReconciled']!==true||
         v['seedVerified']!==true||v['houseId']!==house.id||
         v['sourceSheetVersion']!==house.version||!number(v['version'])||
         !object(v['state']))return {available:false,readOnly:true};
      let origin:string,actual:string,month:number;
      try{
        origin=constructionStateHash(house.state);
        actual=constructionStateHash(v['state']);
        month=monthFromHarptosDate({year:date.year,month:date.month});
      }catch{return {available:false,readOnly:true};}
      if(v['sourceStateHash']!==origin||v['stateHash']!==actual||
         (v['version']===0&&actual!==origin)||
         v['state']['houseId']!==house.id||
         v['state']['month']!==month)
        return {available:false,readOnly:true};
      const projection=sanitizedEconomy(house.state,v['state'],house.name,
        v['version'],house.version,date.version,v['updatedAt']);
      if(!projection)return {available:false,readOnly:true};
      return projection;
    },
  };
}
