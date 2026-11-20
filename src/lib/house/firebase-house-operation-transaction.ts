/**
 * Item 4b: gravação transacional da parte já pura de houseOperation.
 * A API recusa TODAS as demais ações até existir paridade do motor 4a.
 * Nunca grava no snapshot importado ou modifica fichas de outra Casa.
 */
import {createHash,randomInt} from 'node:crypto';
import type {Auth} from 'firebase-admin/auth';
import type {Firestore} from 'firebase-admin/firestore';
import {operationSchema} from './schemas';
import {applyHouseDomainOperation,applyHouseNonEconomicOperation,
 applyHouseEconomicOperation,applyHouseMilitaryOperation,
 applyHouseCreationOperation,applyHouseDiceOperation,HOUSE_DICE_ACTIONS,
 type HouseDiceAction,HOUSE_CREATION_ACTIONS,
 type HouseCreationAction,HOUSE_ECONOMIC_ACTIONS,
 HOUSE_MILITARY_ACTIONS,type HouseMilitaryAction,
 HOUSE_NON_ECONOMIC_ACTIONS,requireHouseOperationRole,requireHouseOperationPhase,
 needsHouseOperationCalendar,type HouseNonEconomicAction,
 type HouseEconomicAction} from './operation-core';
import {verifiedEconomicState,calculateFirebaseHouseEconomy}
 from './firebase-economic-readonly';
import {constructionStateHash} from './firebase-construction-transaction';
import {effectiveCloudCalendar} from '../../../scripts/firebase/cloud-operational-calendar.mjs';
import {chooseCurrentAccountAccess} from '../../../scripts/firebase/operational-account-access.mjs';
// @ts-expect-error: módulo temporal canônico sem declaração TypeScript
import {validateHarptosDate,harptosKey} from '../../../scripts/firebase/stage-temporal-emulator.mjs';
import {monthFromHarptosDate} from '@/lib/calendar/house-time-impact';

const SHA=/^[a-f0-9]{64}$/;
const ID=/^[^/\u0000-\u001f\u007f]{1,128}$/;
const DOMAINS=new Set(['domain','domain_edit','domain_delete']);
const ECONOMICS=new Set<string>([...HOUSE_ECONOMIC_ACTIONS,...HOUSE_MILITARY_ACTIONS,...HOUSE_CREATION_ACTIONS,...HOUSE_DICE_ACTIONS]);
const OPERATIONS=new Set([...DOMAINS,...HOUSE_NON_ECONOMIC_ACTIONS,...HOUSE_ECONOMIC_ACTIONS,...HOUSE_MILITARY_ACTIONS,...HOUSE_CREATION_ACTIONS,...HOUSE_DICE_ACTIONS]);
const hash=(v:string)=>createHash('sha256').update(v).digest('hex');
const valid=(v:unknown):v is string=>typeof v==='string'&&ID.test(v);
const integer=(v:unknown):v is number=>Number.isSafeInteger(v)&&
 (v as number)>=0&&(v as number)<2147483647;
const fail=(code:string,status=403):never=>{throw new HouseOperationError(code,status);};
const ready=(doc:{exists:boolean;data:()=>Record<string,unknown>|undefined})=>
 doc.exists&&doc.data()?.['status']==='complete'&&doc.data()?.['private']===true;

type RuntimeRoot={status?:string;private?:boolean;sourceSnapshotId?:string;
 sourceSnapshotReconciled?:boolean;applicationEnabled?:boolean;
 houseOpsWriteApproved?:boolean;calendarVersion?:number};
type SourceSheet={houseId?:string;version?:number;
 state?:Record<string,unknown>};
type EconomyDoc={houseId?:string;status?:string;private?:boolean;
 sourceSnapshotId?:string;sourceReconciled?:boolean;seedVerified?:boolean;
 sourceSheetVersion?:number;sourceStateHash?:string;stateHash?:string;
 version?:number;state?:Record<string,unknown>};
type PriorReceipt={requestFingerprint?:string;actorUid?:string;houseId?:string;
 action?:string;version?:number;ledgerId?:string};
export class HouseOperationError extends Error{
 constructor(readonly code:string,readonly status=403){super(code);this.name='HouseOperationError';}
}
export type HouseOperationResult={houseId:string;version:number;
 action:string;duplicate:boolean;ledgerId:string};
export type HouseOperationOptions={db:Firestore;auth:Auth;snapshotId:string;
 projectId:string;enabled?:boolean;env?:NodeJS.ProcessEnv;clock?:()=>string};
export function createFirebaseHouseOperation({
 db,auth,snapshotId,projectId,enabled=false,env=process.env,
 clock=()=>new Date().toISOString(),
}:HouseOperationOptions){
 if(enabled!==true||projectId!=='cormyr'||!SHA.test(snapshotId)||
   env['FIRESTORE_EMULATOR_HOST']||env['FIREBASE_AUTH_EMULATOR_HOST']||
   typeof db?.runTransaction!=='function'||typeof auth?.verifyIdToken!=='function'||
   typeof auth?.getUser!=='function')fail('house_operations_disabled',503);
 const source=db.collection('migrationDomainStage').doc(snapshotId);
 const authStage=db.collection('migrationAuthStage').doc(snapshotId);
 const timeStage=db.collection('migrationTimeEngineStage').doc(snapshotId);
 const nobleStage=db.collection('migrationNobleHouseStage').doc(snapshotId);
 const root=db.collection('campaignCloudRuntime').doc(snapshotId);
 async function execute(token:string,raw:unknown):Promise<HouseOperationResult>{
  if(typeof token!=='string'||token.length<10||token.length>10000)
    fail('authentication_required',401);
  let uid='';
  try{
    const decoded=await auth.verifyIdToken(token,true);
    if(!valid(decoded?.uid))fail('authentication_required',401);
    const user=await auth.getUser(decoded.uid);
    if(user.uid!==decoded.uid||user.disabled===true)
      fail('authentication_required',401);
    uid=decoded.uid;
  }catch{throw new HouseOperationError('authentication_required',401);}
  if(!raw||typeof raw!=='object'||Array.isArray(raw)||
    Object.keys(raw).some(k=>!['houseId','version','key','action','args','explanation'].includes(k)))
    fail('invalid_house_operation',400);
  const parsed=operationSchema.safeParse(raw);
  if(!parsed.success||!parsed.data||!valid(parsed.data.houseId))
    throw new HouseOperationError('invalid_house_operation',400);
  const {houseId,version,key,action,args,explanation}=parsed.data;
  if(!OPERATIONS.has(action))
    fail('house_operation_not_implemented',501);
  if(Buffer.byteLength(JSON.stringify(args),'utf8')>14000)
    fail('house_operation_too_large',413);
  // Gerado uma única vez por tentativa, fora do callback que o Firestore pode repetir.
  const trustedDice=HOUSE_DICE_ACTIONS.includes(action as HouseDiceAction)
   ?Array.from({length:100},()=>randomInt(1,7)):[];
  const requestFingerprint=constructionStateHash({uid,houseId,version,key,
    action,args,explanation});
  const houseRef=source.collection('houses').doc(hash('house:'+houseId));
  const sheetRef=nobleStage.collection('sheets').doc(hash('noble-sheet:'+houseId));
  const economyRef=root.collection('houseEconomies').doc(hash('house:'+houseId));
  const eventId=hash('house-operation:'+uid+':'+key);
  const eventRef=root.collection('houseOperationRequests').doc(eventId);
  const ledgerRef=root.collection('houseOperationLedger').doc(eventId);
  const auditRef=root.collection('houseOperationAudits').doc(eventId);
  const actorRef=source.collection('access').doc(uid);
  const overlayRef=root.collection('accountAccess').doc(uid);
  const calendarRef=timeStage.collection('calendar').doc('current');
  return db.runTransaction(async tx=>{
   // Todas as leituras devem ocorrer antes de qualquer escrita.
   const docs=await Promise.all([
    tx.get(source),tx.get(authStage),tx.get(timeStage),tx.get(nobleStage),
    tx.get(root),tx.get(actorRef),tx.get(overlayRef),tx.get(houseRef),
    tx.get(sheetRef),tx.get(economyRef),tx.get(eventRef),tx.get(calendarRef),
   ]);
   if(!docs.slice(0,4).every(ready))fail('house_stage_unavailable',503);
   const cfg=docs[4].data() as RuntimeRoot|undefined;
   if(!docs[4].exists||cfg?.status!=='active'||cfg?.private!==true||
     cfg?.sourceSnapshotId!==snapshotId||cfg?.sourceSnapshotReconciled!==true||
     cfg?.applicationEnabled!==true||cfg?.houseOpsWriteApproved!==true)
     fail('house_operations_not_approved',503);
   let access;
   try{access=chooseCurrentAccountAccess(uid,docs[5].data(),
     docs[6].exists?docs[6].data():null,cfg);}
   catch{fail('invalid_access_scope',403);}
   const narrator=access?.profile==='narrador'&&access?.admin===true&&
     Array.isArray(access.memberHouseIds)&&access.memberHouseIds.length===0&&
     Array.isArray(access.editHouseIds)&&access.editHouseIds.length===0;
   const player=access?.profile==='jogador'&&access?.admin===false&&
     valid(access.playerId)&&Array.isArray(access.memberHouseIds)&&
     Array.isArray(access.editHouseIds)&&
     access.memberHouseIds.includes(houseId)&&access.editHouseIds.includes(houseId);
   if(access?.userId!==uid||access?.active!==true||
     access?.requirePasswordChange!==false||
     !(narrator||player))fail('house_access_denied',403);
   if(!docs[7].exists||docs[7].data()?.['sourceId']!==houseId||
     docs[7].data()?.['active']!==true||docs[7].data()?.['season']!==2)
     fail('house_not_available',404);
   if(!docs[8].exists||docs[8].data()?.['houseId']!==houseId||
     !integer(docs[8].data()?.['version'])||!docs[8].data()?.['state']||
     docs[8].data()?.['state']?.['houseId']!==houseId)
     throw new HouseOperationError('house_sheet_unavailable',503);
   const original=docs[8].data() as SourceSheet|undefined;
   const economy=docs[9].data() as EconomyDoc|undefined;
   if(!original||!original.state||!integer(original.version))
     throw new HouseOperationError('house_sheet_unavailable',503);
   if(!docs[9].exists||!economy||economy.houseId!==houseId||
     economy.status!=='active'||economy.private!==true||
     economy.sourceSnapshotId!==snapshotId||
     economy.sourceReconciled!==true||economy.seedVerified!==true||
     economy.sourceSheetVersion!==original.version||
     economy.sourceStateHash!==constructionStateHash(original.state)||
     !integer(economy.version)||!economy.state||
     economy.state?.['houseId']!==houseId||
     economy.stateHash!==constructionStateHash(economy.state)||
     (economy.version===0&&economy.stateHash!==economy.sourceStateHash))
      throw new HouseOperationError('house_economy_unreconciled',503);
   if(!cfg)throw new HouseOperationError('house_operations_not_approved',503);
   const c=effectiveCloudCalendar(docs[11].data(),cfg,snapshotId);
   if(!integer(c?.version)||c.version<1||
     !Number.isSafeInteger(c?.year)||!Number.isSafeInteger(c?.month)||
     !Number.isSafeInteger(c?.day)||
     !validateHarptosDate(c.year,c.month,c.day,c.festival??null)||
     cfg.calendarVersion!==c.version)
      fail('house_calendar_unavailable',503);
   if(docs[10].exists){
    const old=docs[10].data() as PriorReceipt|undefined;
    if(!old||old.requestFingerprint!==requestFingerprint||
      old.actorUid!==uid||old.houseId!==houseId||old.action!==action)
      throw new HouseOperationError('house_operation_key_conflict',409);
    if(!integer(old.version)||!valid(old.ledgerId))
      throw new HouseOperationError('house_operation_receipt_invalid',503);
    return {houseId,version:old.version,action,
      duplicate:true,ledgerId:old.ledgerId};
   }
   if(!economy||!economy.state||!integer(economy.version))
     throw new HouseOperationError('house_economy_unreconciled',503);
   if(version!==economy.version)
    fail('house_version_conflict',409);
   const state=verifiedEconomicState(economy.state);
   if(!state)throw new HouseOperationError('house_economy_unreconciled',503);
   try{
    requireHouseOperationRole(action,narrator);
    requireHouseOperationPhase(state,action);
   }catch{throw new HouseOperationError('house_operation_forbidden',403);}
   if(needsHouseOperationCalendar(state,action)&&
     state.month!==monthFromHarptosDate({year:c.year,month:c.month}))
      fail('house_calendar_conflict',409);
   let candidate:{state:typeof state;rule:string;explanation?:string};
   try{
    candidate=DOMAINS.has(action)
     ?applyHouseDomainOperation(state,action as 'domain'|'domain_edit'|'domain_delete',args)
     :ECONOMICS.has(action)
      ?HOUSE_DICE_ACTIONS.includes(action as HouseDiceAction)
       ?applyHouseDiceOperation(state,action as HouseDiceAction,args,{
          admin:narrator,key,dice:trustedDice,
          playerId:player&&valid(access?.['playerId'])?access.playerId:null,
        })
       :HOUSE_CREATION_ACTIONS.includes(action as HouseCreationAction)
        ?applyHouseCreationOperation(state,action as HouseCreationAction,args,
          {admin:narrator,mayBuyAttributes:narrator||
           Array.isArray(access?.['attrHouseIds'])&&access['attrHouseIds'].includes(houseId),
           explanation})
       :HOUSE_MILITARY_ACTIONS.includes(action as HouseMilitaryAction)
        ?applyHouseMilitaryOperation(state,action as HouseMilitaryAction,args,
          {admin:narrator,key,explanation})
        :applyHouseEconomicOperation(state,action as HouseEconomicAction,args,
          {admin:narrator,key,explanation})
      :applyHouseNonEconomicOperation(state,action as HouseNonEconomicAction,
        args,explanation);
   }catch{throw new HouseOperationError('house_rule_rejected',409);}
   const next=JSON.parse(JSON.stringify(candidate.state));
   if(!verifiedEconomicState(next))
    throw new HouseOperationError('house_operation_result_invalid',503);
   const previous=calculateFirebaseHouseEconomy(state);
   const after=calculateFirebaseHouseEconomy(next);
   if(!previous||!after)throw new HouseOperationError('house_operation_balance_mismatch',503);
   if(!ECONOMICS.has(action)&&
      JSON.stringify(previous.balances)!==JSON.stringify(after.balances))
     fail('house_operation_balance_mismatch',503);
   // Operações econômicas sempre têm o antes e o depois preservados no ledger.
   // Não é permitido agravar um déficit em qualquer recurso sem decisão
   // administrativa explícita de correção (que fica auditada como tal).
   if(ECONOMICS.has(action)&&!['correct','fortune','admin_edit'].includes(action)&&
      Object.keys(after.balances.available).some(k=>{
       const resource=k as keyof typeof after.balances.available;
       const before=previous.balances.available[resource];
       const value=after.balances.available[resource];
       return value<0&&value<before;
      }))fail('house_operation_insufficient_resources',409);
   const updatedAt=clock();
   if(!Number.isFinite(Date.parse(updatedAt)))fail('invalid_server_clock',503);
   const nextVersion=economy.version+1;
   const ledgerId=eventId;
   const output:HouseOperationResult={houseId,version:nextVersion,
     action,duplicate:false,ledgerId};
   const campaignDate=harptosKey(c.year,c.month,c.day,c.festival??null);
   tx.update(economyRef,{state:next,stateHash:constructionStateHash(next),
     version:nextVersion,lastHouseOperationId:eventId,updatedAt});
   tx.create(ledgerRef,{id:ledgerId,houseId,action,actorUid:uid,
     version:nextVersion,explanation:candidate.explanation??explanation,rule:candidate.rule,
     campaignMonth:state.month,campaignDate,created_at:updatedAt,
     before:previous.balances.total,after:after.balances.total,
     beforeBalances:previous.balances,afterBalances:after.balances,
     beforeTreasury:state.treasury??0,afterTreasury:next.treasury??0,
     requestKeyDigest:hash(key)});
   tx.create(auditRef,{eventId,actorUid:uid,houseId,action,
     previousVersion:economy.version,nextVersion,
     beforeStateHash:economy.stateHash,afterStateHash:constructionStateHash(next),
     requestFingerprint,sourceSnapshotId:snapshotId,createdAt:updatedAt});
   tx.create(eventRef,{actorUid:uid,houseId,action,version:nextVersion,
     requestFingerprint,ledgerId,createdAt:updatedAt});
   return output;
  });
 }
 return {execute};
}
