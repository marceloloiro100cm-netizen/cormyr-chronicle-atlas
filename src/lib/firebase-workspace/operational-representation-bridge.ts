/* eslint-disable @typescript-eslint/no-explicit-any -- contrato Firebase Admin e legado. */
/** Ponte do item 8 entre RPCs originais e operações Firebase auditadas. */
import type {Scope} from './service';
import type {Row} from './query';
import type {MailDataset} from '../mail/mail-page-contract';
import {canReadLetterAs,canReadReply} from '../mail/mail-page-contract';
import {dateKey} from '../calendar/harptos';
import {createRepresentationService,RepresentationError} from './operational-representation';
import {commitOperationalRecord,RecordWriteError} from './operational-record-write';
import {CloudAccessError} from '../../../scripts/firebase/cloud-readonly-service.mjs';
import {CloudMailError} from '../../../scripts/firebase/cloud-mail-service.mjs';

type Dependencies={
 db:any;auth:any;snapshotId:string;actor:Scope;token:string;
 players:()=>Promise<Row[]>;houses:()=>Promise<Row[]>;
 records:()=>Promise<Row[]>;importedRecords:()=>Promise<Row[]>;
 mail:()=>Promise<MailDataset>;calendar:()=>Promise<any>;
 cloudMail:()=>any;
};
const invalid=():never=>{throw new CloudAccessError('representation_action_invalid',400);};
const known=(err:unknown):never=>{
 if(err instanceof RepresentationError||err instanceof RecordWriteError||
    err instanceof CloudMailError)
  throw new CloudAccessError(err.code,err.status);
 throw err;
};
const only=(args:any,keys:string[])=>{
 if(!args||typeof args!=='object'||Array.isArray(args)||
    Object.keys(args).some(k=>!keys.includes(k)))invalid();
};
export function createRepresentationBridge(deps:Dependencies){
 const service=async()=>{
  if(deps.actor.profile!=='narrador')
   throw new CloudAccessError('access_denied',403);
  return createRepresentationService({db:deps.db,auth:deps.auth,
   snapshotId:deps.snapshotId,actor:deps.actor,
   importedPlayers:await deps.players() as any});
 };
 const current=async(write=false)=>{
  try{return await (await service()).identity({write});}
  catch(e){return known(e);}
 };
 return {
  async start(args:Record<string,any>){
   only(args,['p_player']);
   try{return await (await service()).start(args['p_player']);}
   catch(e){return known(e);}
  },
  async stop(args:Record<string,any>){
   only(args,[]);
   try{return await (await service()).stop();}
   catch(e){return known(e);}
  },
  async action(action:unknown,args:unknown,campaignDate?:unknown){
   if(typeof action!=='string'||
     !['read','save_record','send','reply','draft','delete'].includes(action))
    invalid();
   if(!args||typeof args!=='object'||Array.isArray(args))invalid();
   const payload=args as Record<string,any>;
   if(action==='read'){
    only(payload,[]);
    const identity=await current(false),scope=identity.scope;
    const [records,houses,ds,roster]=await Promise.all([
     deps.records(),deps.houses(),deps.mail(),deps.players(),
    ]);
    const player=roster.find(p=>p['id']===identity.playerId&&
     p['user_id']===identity.representedUid&&p['active']===true);
    if(!player)throw new CloudAccessError('representation_player_inactive',403);
    const result={
     player:{name:player['name'],user_id:identity.representedUid},
     houses:houses.filter(h=>scope.memberHouseIds.includes(h['id'] as string)),
     records:records.filter(r=>r['visibility']==='player'&&r['player_id']===scope.playerId||
       r['visibility']==='house'&&scope.memberHouseIds.includes(r['house_id'] as string)),
     letters:ds.letters.filter(l=>canReadLetterAs(ds,l,scope.uid)),
     replies:ds.replies.filter(r=>canReadReply(ds,r,scope.uid)),
     week:ds.rounds.filter(r=>r.status==='open')
      .map(r=>r.number).sort((a,b)=>b-a)[0]??null,
     expiresAt:identity.expiresAt,
    };
    const rechecked=await current(false);
    if(rechecked.sessionId!==identity.sessionId||
       rechecked.representedUid!==identity.representedUid)
     throw new CloudAccessError('representation_session_changed',409);
    return result;
   }
   const identity=await current(true);
   if(action==='save_record'){
    only(payload,['id','version','title','content','key']);
    try{
     const record=await commitOperationalRecord({
      db:deps.db,snapshotId:deps.snapshotId,actor:identity.scope,
      imported:await deps.importedRecords(),
      input:{action:'save',recordId:payload['id'],
       expectedVersion:payload['version'],title:payload['title'],
       content:payload['content'],requestKey:payload['key']},
      representation:{actorUid:deps.actor.uid,
       representedUid:identity.representedUid,
       playerId:identity.playerId,sessionId:identity.sessionId},
     });
     return {id:record['id'],version:record['version']};
    }catch(e){return known(e);}
   }
   if(action==='delete'){
    only(payload,['id','version']);
    try{
     const result=await deps.cloudMail().cancelRepresented(deps.token,{
      letterId:payload['id'],expectedVersion:payload['version'],
     });
     return {id:payload['id'],removed:result.removed};
    }catch(e){return known(e);}
   }
   if(typeof campaignDate!=='string'||
      !/^[0-9]{4}-(?:[0-9]{2}-[0-9]{2}|F-[a-z-]+)$/.test(campaignDate))
    throw new CloudAccessError('representation_date_required',400);
   const date=await deps.calendar();
   if(!date||dateKey(date)!==campaignDate)
    throw new CloudAccessError('campaign_date_changed',409);
   try{
    if(action==='reply'){
     only(payload,['letter','reply','content','key','draft']);
     if(payload['reply']!=null&&payload['reply']!=='')
      throw new CloudAccessError('representation_reply_not_supported',501);
     const result=await deps.cloudMail().replyRepresented(deps.token,{
      letterId:payload['letter'],requestKey:payload['key'],
      content:payload['content'],expectedCampaignDate:campaignDate,
      draft:payload['draft']===true,
     });
     return {id:result.id};
    }
    only(payload,['subject','content','house','key','origin']);
    const requestedOrigin=payload['origin'];
    if(requestedOrigin!==undefined&&requestedOrigin!==null&&
       typeof requestedOrigin!=='string')invalid();
    const origin=requestedOrigin||
      (identity.scope.editHouseIds.length===1?identity.scope.editHouseIds[0]:null);
    if(!origin||!identity.scope.editHouseIds.includes(origin))
     throw new CloudAccessError('representation_origin_not_authorized',403);
    if(typeof payload['house']!=='string')invalid();
    const dest=payload['house'].trim();
    if(dest===origin)invalid();
    const result=await deps.cloudMail().sendRepresented(deps.token,{
     requestKey:payload['key'],originHouseId:origin,
     recipientKind:dest?'house':'narrator',recipientHouseId:dest||null,
     subject:payload['subject'],content:payload['content'],
     expectedCampaignDate:campaignDate,draft:action==='draft',
    });
    return {id:result.id};
   }catch(e){return known(e);}
  },
 };
}
