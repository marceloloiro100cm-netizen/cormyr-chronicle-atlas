/* eslint-disable @typescript-eslint/no-explicit-any -- fronteira dos serviços Firestore Admin. */
/** Contrato RPC da representação, itens 8. Nenhum login secundário. */
import type {Scope} from './service';
import {startRepresentation,stopRepresentation,loadRepresentation,
 RepresentationError} from './operational-representation';
import {commitOperationalRecord,RecordWriteError} from './operational-record-write';
import {projectOperationalRecords} from './operational-records';
import {CloudMailError} from '../../../scripts/firebase/cloud-mail-service.mjs';
import {canReadLetterAs,canReadReply} from '../mail/mail-page-contract';
import {parseDate} from '../calendar/harptos';

export class RepresentationRpcError extends Error{
 constructor(readonly code:string,readonly status=400){super(code);}
}
const fail=(code:string,status=400):never=>{
 throw new RepresentationRpcError(code,status);
};
type Input={
 db:any;snapshotId:string;actor:Scope;token:string;name:string;args:Record<string,any>;
 players:()=>Promise<Record<string,any>[]>;
 rows:(name:string)=>Promise<Record<string,any>[]>;
 operationalRecords:()=>Promise<any[]>;
 mail:()=>Promise<any>;
 cloudMail:()=>any;
};
const visible=(scope:Scope,row:Record<string,any>)=>scope.profile==='jogador'&&(
 row['visibility']==='player'&&row['player_id']===scope.playerId||
 row['visibility']==='house'&&scope.memberHouseIds.includes(row['house_id']));

export async function representationRpc(input:Input){
 const {db,snapshotId,actor,token,name,args,players,rows}=input;
 if(actor.profile!=='narrador')fail('access_denied',403);
 if(!args||typeof args!=='object'||Array.isArray(args))
  fail('invalid_representation_action');
 const context={db,snapshotId,actor,players:await players()};
 try{
  if(name==='start_campaign_representation'){
   if(Object.keys(args).some(k=>k!=='p_player'))fail('invalid_representation_action');
   return await startRepresentation(context,args['p_player']);
  }
  if(name==='stop_campaign_representation'){
   if(Object.keys(args).length)fail('invalid_representation_action');
   return await stopRepresentation(context);
  }
  if(name!=='campaign_representation_action')fail('invalid_representation_action');
  if(Object.keys(args).some(k=>!['p_action','p_args'].includes(k))||
     typeof args['p_action']!=='string'||
     !args['p_args']||typeof args['p_args']!=='object'||
     Array.isArray(args['p_args']))
   fail('invalid_representation_action');
  const action=args['p_action'],a=args['p_args'] as Record<string,any>;
  if(Object.keys(a).length>20||Buffer.byteLength(JSON.stringify(a),'utf8')>24000)
   fail('invalid_representation_action');
  const current=await loadRepresentation(context);
  const subject=current.scope,representedUid=subject.uid;
  if(action==='read'){
   if(Object.keys(a).length)fail('invalid_representation_action');
   const [archive,houseRows,ds]=await Promise.all([
    rows('campaign_records'),rows('campaign_houses'),input.mail(),
   ]);
   const recordRows=process.env['CORMYR_FIREBASE_RECORDS_ENABLED']==='true'
    ?projectOperationalRecords(subject,archive,await input.operationalRecords())
    :archive.filter(row=>visible(subject,row));
   const owned=houseRows.filter(h=>h['active']===true&&h['season']===2&&
    subject.memberHouseIds.includes(h['id']));
   const letters=ds.letters.filter((l:any)=>canReadLetterAs(ds,l,representedUid));
   const permitted=new Set(letters.map((l:any)=>l.id));
   const replies=ds.replies.filter((r:any)=>permitted.has(r.letter_id)&&
    canReadReply(ds,r,representedUid));
   const week=ds.rounds.filter((r:any)=>r.status==='open').map((r:any)=>r.number)
    .filter((n:unknown)=>Number.isSafeInteger(n)).sort((a:number,b:number)=>b-a)[0]??null;
   const after=await loadRepresentation(context);
   if(after.session.nonce!==current.session.nonce||
      JSON.stringify(after.scope)!==JSON.stringify(subject))
    fail('access_denied',403);
   return {player:{name:current.player['name']??'Jogador',user_id:representedUid},
    houses:owned.map(h=>({id:h['id'],name:h['name'],region:h['region']??null,
     crest:h['crest']??null,lord_name:h['lord_name']??null,
     castle:h['castle']??null})),
    records:recordRows,letters,replies,week};
  }
  if(action==='save_record'){
   if(Object.keys(a).some(k=>!['id','version','title','content'].includes(k)))
    fail('invalid_representation_action');
   const saved=await commitOperationalRecord({
    db,snapshotId,actor:subject,imported:await rows('campaign_records'),
    input:{action:'save',recordId:a['id'],expectedVersion:a['version'],
     title:a['title'],content:a['content']},
    representation:{realActorUid:actor.uid,sessionNonce:current.session.nonce},
   });
   return {id:saved['id'],version:saved['version']};
  }
  if(!['send','draft','reply','delete'].includes(action))
   fail('invalid_representation_action');
  if(process.env['CORMYR_FIREBASE_CLOUD_MAIL_ENABLED']!=='true')
   fail('representation_mail_disabled',501);
  if(action==='delete'){
   if(Object.keys(a).some(k=>!['letter','version'].includes(k))||
      typeof a['letter']!=='string'||!Number.isSafeInteger(a['version']))
    fail('invalid_representation_action');
   return input.cloudMail().cancelRepresented(token,{
    letterId:a['letter'],expectedVersion:a['version'],
   });
  }
  const date=a['campaignDate'];
  if(typeof date!=='string'||!parseDate(date))
   fail('invalid_representation_date');
  if(action==='reply'||a['letter']!==undefined){
   if(Object.keys(a).some(k=>!['letter','reply','content','key','draft','campaignDate'].includes(k)))
    fail('invalid_representation_action');
   if(a['reply']!==null&&a['reply']!==undefined&&a['reply']!=='')
    fail('mail_feature_not_yet_available',501);
   if(typeof a['letter']!=='string'||typeof a['content']!=='string'||
      typeof a['key']!=='string')fail('invalid_representation_action');
   return input.cloudMail().replyRepresented(token,{
    letterId:a['letter'],content:a['content'],requestKey:a['key'],
    draft:action==='draft'||a['draft']===true,expectedCampaignDate:date,
   });
  }
  if(Object.keys(a).some(k=>!['origin','house','subject','content','key','campaignDate'].includes(k)))
   fail('invalid_representation_action');
  const origin=a['origin'];
  if(typeof origin!=='string'||!subject.editHouseIds.includes(origin)||
     typeof a['house']!=='string'||typeof a['subject']!=='string'||
     typeof a['content']!=='string'||typeof a['key']!=='string')
   fail('invalid_representation_action');
  return input.cloudMail().sendRepresented(token,{
   requestKey:a['key'],originHouseId:origin,
   recipientKind:a['house']?'house':'narrator',
   recipientHouseId:a['house']||null,
   subject:a['subject'],content:a['content'],
   draft:action==='draft',expectedCampaignDate:date,
  });
 }catch(error){
  if(error instanceof RepresentationError||error instanceof RecordWriteError||
     error instanceof CloudMailError)
   throw new RepresentationRpcError(error.code,error.status);
  throw error;
 }
}
