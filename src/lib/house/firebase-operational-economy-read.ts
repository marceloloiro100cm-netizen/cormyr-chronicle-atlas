import {effectiveCloudCalendar} from '../../../scripts/firebase/cloud-operational-calendar.mjs';
import {chooseCurrentAccountAccess} from '../../../scripts/firebase/operational-account-access.mjs';
import {runtimeApprovalEnabled} from '../../../scripts/firebase/runtime-approval-policy.mjs';
/**
 * Safe, per-House operational economy read. No Firestore response bodies from
 * private documents are forwarded: only an allowlisted projection is returned.
 * Independent READ gate; purchase authorization is never enabled here.
 */
import {createHash} from 'node:crypto';
import type {Auth} from 'firebase-admin/auth';
import type {Firestore} from 'firebase-admin/firestore';
import {constructionStateHash} from './firebase-construction-transaction';
import {calculateFirebaseHouseEconomy} from './firebase-economic-readonly';
import {monthFromHarptosDate} from '@/lib/calendar/house-time-impact';
// The shared Harptos validator is JavaScript-only.
// @ts-expect-error The .mjs module has no TypeScript declaration.
import {validateHarptosDate} from '../../../scripts/firebase/stage-temporal-emulator.mjs';

const SHA=/^[a-f0-9]{64}$/;
const ID=/^[^/\u0000-\u001f\u007f]{1,128}$/;
const hash=(s:string)=>createHash('sha256').update(s).digest('hex');
const object=(v:unknown):v is Record<string,unknown>=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const safeId=(v:unknown):v is string=>typeof v==='string'&&ID.test(v);
const integer=(v:unknown,min=0,max=2147483646):v is number=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;
const reject=(code:string,status=403):never=>{
  throw new CloudEconomyReadError(code,status);
};
export class CloudEconomyReadError extends Error{
  constructor(readonly code:string,readonly status=403){
    super(code);this.name='CloudEconomyReadError';
  }
}

const ready=(v:unknown)=>object(v)&&v['status']==='complete'&&v['private']===true;
function authorize(v:unknown,uid:string,houseId:string):void{
  if(!object(v)||v['userId']!==uid||v['active']!==true||
     v['requirePasswordChange']!==false||
     !Array.isArray(v['memberHouseIds'])||
     !Array.isArray(v['editHouseIds']))
    return reject('access_denied');
  const member=v['memberHouseIds'],edit=v['editHouseIds'];
  if(member.length>250||edit.length>250||
     member.some(x=>!safeId(x))||edit.some(x=>!safeId(x)||!member.includes(x)))
    return reject('invalid_access_scope');
  if(v['profile']==='narrador'&&v['admin']===true&&
     member.length===0&&edit.length===0)return;
  if(v['profile']==='jogador'&&v['admin']===false&&
     safeId(v['playerId'])&&member.includes(houseId))return;
  return reject('access_denied');
}
function validCalendar(v:unknown):{version:number;month:number}{
  if(!object(v)||!integer(v['version'],1)||
     !integer(v['year'],1,9999)||!integer(v['month'],0,11)||
     !integer(v['day'],1,30)||
     !validateHarptosDate(v['year'],v['month'],v['day'],v['festival']??null))
    return reject('calendar_unavailable',503);
  return {
    version:v['version'],
    month:monthFromHarptosDate({year:v['year'],month:v['month']}),
  };
}
function runtimeReady(v:unknown,snapshotId:string,calendarVersion:number){
  return object(v)&&v['status']==='active'&&v['private']===true&&
    v['sourceSnapshotId']===snapshotId&&
    v['sourceSnapshotReconciled']===true&&
    v['applicationEnabled']===true&&
    runtimeApprovalEnabled(v,'constructionReadApproved')&&
    v['constructionSeededVerified']===true&&
    v['calendarVersion']===calendarVersion;
}
function brief(v:unknown,max=160):string{
  return typeof v==='string'?v.slice(0,max):'';
}
/** A fixed output shape prevents notes, identities, audits and other Houses
 * from leaking through the browser even if schema changes in Firestore. */
function projectEconomy(state:Record<string,unknown>,houseId:string,
  version:number,sourceSheetVersion:number,calendarMonth:number){
  const computed=calculateFirebaseHouseEconomy(state);
  if(!computed||computed.houseId!==houseId||
     computed.month!==calendarMonth||state['phase']!=='active')
    return reject('operational_economy_unavailable',503);
  const holdings=state['holdings'];
  const projects=state['projects'];
  if(!Array.isArray(holdings)||!Array.isArray(projects))
    return reject('operational_economy_unavailable',503);
  // The canonical economic validator checks costs; project identity and
  // lifecycle must also be complete before the UI presents operational facts.
  const holdingStatuses=new Set([
    'active','building','destroyed','abandoned','sold','cancelled',
  ]);
  const projectStatuses=new Set(['building','completed','cancelled']);
  if(holdings.some(h=>!object(h)||!safeId(h['id'])||
      !safeId(h['itemId'])||!safeId(h['domainId'])||
      typeof h['name']!=='string'||!h['name'].trim()||
      !holdingStatuses.has(String(h['status'])))||
     projects.some(p=>!object(p)||!safeId(p['id'])||
      !safeId(p['holdingId'])||typeof p['name']!=='string'||
      !p['name'].trim()||!projectStatuses.has(String(p['status']))||
      !integer(p['start'],0,10000000)||
      !integer(p['duration'],0,10000000)||
      !integer(p['modifier'],-10000,10000)))
    return reject('operational_economy_unavailable',503);
  const domainNames=new Map(computed.domains.map(d=>[d.id,d.name]));
  const holdingNames=new Map(holdings.map(h=>[h.id,h.name]));
  const result={
    houseId,version,sourceSheetVersion,calendarMonth,
    readOnly:true as const,
    balances:{
      total:computed.balances.total,
      allocated:computed.balances.allocated,
      committed:computed.balances.committed,
      available:computed.balances.available,
    },
    holdingsTotal:holdings.length,projectsTotal:projects.length,
    holdings:holdings.slice(0,100).map(h=>({
      id:brief(h.id,128),itemId:brief(h.itemId,128),
      name:brief(h.name),domainId:brief(h.domainId,128),
      domainName:brief(domainNames.get(h.domainId)??'Domínio não identificado'),
      status:brief(h.status,32),
    })),
    projects:projects.slice(0,100).map(p=>({
      id:brief(p.id,128),name:brief(p.name),
      holdingId:brief(p.holdingId,128),
      holdingName:brief(holdingNames.get(p.holdingId)??'Posse não identificada'),
      status:brief(p.status,32),
      start:p.start,duration:p.duration,modifier:p.modifier,
    })),
    partial:holdings.length>100||projects.length>100,
  };
  // Require finite numbers and a conservative authenticated payload size.
  if(!result.projects.every(p=>integer(p.start,0,10000000)&&
      integer(p.duration,0,10000000)&&integer(p.modifier,-10000,10000))||
     Buffer.byteLength(JSON.stringify(result),'utf8')>120000)
    return reject('operational_economy_unavailable',503);
  return result;
}
export function createFirebaseOperationalEconomyRead({
  db,auth,snapshotId,projectId,enabled=false,env=process.env,
}:{
  db:Firestore;auth:Auth;snapshotId:string;projectId:string;
  enabled?:boolean;env?:NodeJS.ProcessEnv;
}){
  if(enabled!==true||projectId!=='cormyr'||!SHA.test(snapshotId)||
     env['FIRESTORE_EMULATOR_HOST']||env['FIREBASE_AUTH_EMULATOR_HOST']||
     typeof db?.runTransaction!=='function'||
     typeof auth?.verifyIdToken!=='function'||typeof auth?.getUser!=='function')
    return reject('operational_economy_read_disabled',503);
  const domain=db.collection('migrationDomainStage').doc(snapshotId);
  const accessRoot=db.collection('migrationAuthStage').doc(snapshotId);
  const time=db.collection('migrationTimeEngineStage').doc(snapshotId);
  const noble=db.collection('migrationNobleHouseStage').doc(snapshotId);
  const runtime=db.collection('campaignCloudRuntime').doc(snapshotId);

  return {
    async getHouse(idToken:string,houseId:unknown){
      if(!safeId(houseId))return reject('invalid_house',400);
      if(typeof idToken!=='string'||idToken.length<10||idToken.length>10000)
        return reject('authentication_required',401);
      let uid:string;
      try{
        const token=await auth.verifyIdToken(idToken,true);
        if(!safeId(token?.uid))return reject('authentication_required',401);
        const user=await auth.getUser(token.uid);
        if(user.uid!==token.uid||user.disabled===true)
          return reject('authentication_required',401);
        uid=token.uid;
      }catch{return reject('authentication_required',401);}
      return db.runTransaction(async tx=>{
        const refs=[
          domain,accessRoot,time,noble,
          domain.collection('access').doc(uid),
          time.collection('calendar').doc('current'),
          runtime,
          domain.collection('houses').doc(hash('house:'+houseId)),
          noble.collection('sheets').doc(hash('noble-sheet:'+houseId)),
          runtime.collection('houseEconomies').doc(hash('house:'+houseId)),
        ];
        const [docs,overlay]=await Promise.all([
          Promise.all(refs.map(ref=>tx.get(ref))),
          tx.get(runtime.collection('accountAccess').doc(uid)),
        ]);
        authorize(chooseCurrentAccountAccess(uid,docs[4]?.data(),
          overlay.exists?overlay.data():null,docs[6]?.data()),uid,houseId);
        if(!docs.slice(0,4).every(d=>d.exists&&ready(d.data())))
          return reject('migration_stage_not_ready',503);
        const calendar=validCalendar(effectiveCloudCalendar(docs[5]?.data(),docs[6]?.data(),snapshotId));
        if(!runtimeReady(docs[6]?.data(),snapshotId,calendar.version))
          return reject('operational_economy_read_unapproved',503);
        const house=docs[7]?.data();
        if(!docs[7]?.exists||!object(house)||
           house['sourceId']!==houseId||house['active']!==true||
           house['season']!==2)
          return reject('house_unavailable',404);
        const sheet=docs[8]?.data();
        if(!docs[8]?.exists||!object(sheet)||sheet['houseId']!==houseId||
           !integer(sheet['version'])||!object(sheet['state'])||
           sheet['state']['houseId']!==houseId)
          return reject('house_sheet_unavailable',503);
        const op=docs[9]?.data();
        if(!docs[9]?.exists||!object(op)||
           op['houseId']!==houseId||op['status']!=='active'||
           op['private']!==true||op['sourceSnapshotId']!==snapshotId||
           op['sourceReconciled']!==true||op['seedVerified']!==true||
           op['sourceSheetVersion']!==sheet['version']||
           !integer(op['version'])||!object(op['state']))
          return reject('operational_economy_unavailable',503);
        try{
          const sourceHash=constructionStateHash(sheet['state']);
          const currentHash=constructionStateHash(op['state']);
          if(op['sourceStateHash']!==sourceHash||
             op['stateHash']!==currentHash||
             (op['version']===0&&currentHash!==sourceHash))
            return reject('operational_economy_unavailable',503);
          return projectEconomy(op['state'],houseId,
            op['version'],sheet['version'],calendar.month);
        }catch(e){
          if(e instanceof CloudEconomyReadError)throw e;
          return reject('operational_economy_unavailable',503);
        }
      });
    },
  };
}

