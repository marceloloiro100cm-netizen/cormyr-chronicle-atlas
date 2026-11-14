/**
 * Pure rules for Narrator representation (port of 0025 start/stop/action) and
 * private GM content access. No I/O.
 */
import {recordScopeOf,canReadRecord,applyRecordSave} from './record-core.mjs';

export class PrivateGmError extends Error {
  constructor(code,message){super(message);this.name='PrivateGmError';this.code=code;}
}
const fail=(code,m)=>{throw new PrivateGmError(code,m);};
export const SESSION_MS=30*60*1000;
export const ACTIONS=new Set(['read','save_record','send','reply','draft','delete']);

export const requireNarrator=raw=>{
  if(!raw||raw.active!==true||raw.profile!=='narrador'||raw.admin!==true||raw.requirePasswordChange===true)
    fail('denied','Acesso restrito ao Narrador');
};

/** start_campaign_representation: returns the session doc and audit entry. */
export function startRepresentation({actorUid,player,playerAccess,now}){
  const at=now||new Date();
  if(!player||player.active!==true||!player.userId||player.requirePasswordChange===true)
    fail('invalid','Jogador inativo ou não autorizado');
  if(!playerAccess||playerAccess.admin===true||playerAccess.profile==='narrador')
    fail('denied','Não representar outra conta administrativa');
  return {
    session:{actor:actorUid,playerId:player.id,startedAt:at.toISOString(),
      expiresAt:new Date(at.getTime()+SESSION_MS).toISOString()},
    audit:{actor:actorUid,targetPlayer:player.id,action:'representation_start',details:{},createdAt:at.toISOString()},
  };
}

export function stopRepresentation({actorUid,session,now}){
  if(!session)return {audit:null};
  return {audit:{actor:actorUid,targetPlayer:session.playerId,action:'representation_stop',details:{},
    createdAt:(now||new Date()).toISOString()}};
}

/** Active, unexpired session and still-valid represented player; else denied. */
export function requireSession({session,player,playerAccess,now}){
  const at=now||new Date();
  if(!session||Date.parse(session.expiresAt)<=at.getTime()||!player||player.active!==true||
     player.requirePasswordChange===true||!player.userId)
    fail('denied','Representação expirada ou jogador inativo');
  return recordScopeOf(player.userId,playerAccess);
}

/** Native actions: read and save_record. Others need an injected handler. */
export function readAs({scope,player,houses,records}){
  return {player,houses:houses.filter(h=>scope.memberHouseIds.has(h.sourceId)),
    records:records.filter(r=>canReadRecord(scope,r)).map(({content,...rest})=>({...rest,content}))};
}

export function saveRecordAs({scope,record,args}){
  const r=applyRecordSave({actor:scope,record,version:args&&args.version,title:args&&args.title,content:args&&args.content});
  return r;
}

export function auditFor({actorUid,player,action,args,resultId,now}){
  const a=args||{};
  return {actor:actorUid,targetPlayer:player.id,action:'representation_'+action,
    details:{entity:a.id??a.letter??resultId??null},createdAt:(now||new Date()).toISOString()};
}
