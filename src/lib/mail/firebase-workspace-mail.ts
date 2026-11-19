/**
 * Firebase-only, read-only projection of original correspondence.
 * The original mailPage/mailTrashPage functions remain the single source
 * of filtering semantics. Nothing from this module may be called before the
 * trusted Firebase server has checked the live Auth and House scope.
 */
import {
  mailPage,mailTrashPage,
  type MailDataset,type MailFilters,type MailLetter,type MailReply,
  type MailPlayer,type MailMembership,type MailHouse,type MailRound,
} from './mail-page-contract';
import {readWorkspaceTable} from '../../../scripts/firebase/workspace-import.mjs';

export type VerifiedWorkspaceMailScope={
  uid:string;profile:'narrador'|'jogador';playerId:string|null;
  memberHouseIds:string[];
};
export type WorkspaceMailInput={page?:unknown;size?:unknown;filters?:unknown};
export type WorkspaceMailTables={
  campaign_letters:Record<string,unknown>[];
  letter_replies:Record<string,unknown>[];
  letter_receipts:Record<string,unknown>[];
  letter_rounds:Record<string,unknown>[];
  campaign_players:Record<string,unknown>[];
  house_memberships:Record<string,unknown>[];
  campaign_houses:Record<string,unknown>[];
};
const TABLES=[
  'campaign_letters','letter_replies','letter_receipts','letter_rounds',
  'campaign_players','house_memberships','campaign_houses',
] as const;
const FILTER_KEYS=new Set([
  'box','number','kind','origin','house','court','unit','answered','read',
  'text','group_house_ids',
]);
const invalid=()=>{throw Error('workspace_mail_contract_invalid');};
const str=(v:unknown)=>typeof v==='string'&&v.length>0&&v.length<=512;
const optional=(v:unknown)=>v===null||v===undefined||str(v);
const plain=(v:unknown):v is Record<string,unknown>=>
  v!==null&&typeof v==='object'&&!Array.isArray(v);
const integer=(v:unknown,min:number,max:number)=>
  typeof v==='number'&&Number.isSafeInteger(v)&&v>=min&&v<=max;

export function validateWorkspaceMailInput(input:WorkspaceMailInput){
  if(!plain(input))invalid();
  const page=input.page===undefined?0:input.page;
  const size=input.size===undefined?20:input.size;
  if(!integer(page,0,100000)||!integer(size,1,50))invalid();
  const source=input.filters===undefined?{}:input.filters;
  if(!plain(source)||Object.keys(source).some(k=>!FILTER_KEYS.has(k)))invalid();
  const filters:MailFilters={};
  for(const [key,value] of Object.entries(source)){
    if(key==='group_house_ids'){
      if(!Array.isArray(value)||value.length>30||
         value.some(id=>!str(id)||String(id).length>128))invalid();
      filters.group_house_ids=[...new Set(value as string[])];
    }else{
      if(typeof value!=='string'||value.length>256)invalid();
      filters[key]=value;
    }
  }
  return {page:page as number,size:size as number,filters};
}

export function projectWorkspaceMailTables(
  rows:WorkspaceMailTables,viewer:VerifiedWorkspaceMailScope,
):MailDataset{
  if(!viewer||!str(viewer.uid)||!['narrador','jogador'].includes(viewer.profile)||
     !Array.isArray(viewer.memberHouseIds)||
     viewer.memberHouseIds.some(id=>!str(id))||
     viewer.profile==='jogador'&&!str(viewer.playerId))invalid();
  for(const name of TABLES)
    if(!Array.isArray(rows[name])||rows[name].some(row=>!plain(row)))invalid();

  const players:MailPlayer[]=rows.campaign_players.map(p=>{
    if(!str(p.id)||!optional(p.user_id)||!optional(p.roster_house_id)||
       typeof p.active!=='boolean'||typeof p.require_password_change!=='boolean')
      invalid();
    const self=p.id===viewer.playerId&&p.user_id===viewer.uid;
    // Old roster flags must never authorize a user after Firebase revocation.
    return {id:p.id as string,user_id:p.user_id as string|null,
      roster_house_id:p.roster_house_id as string|null,
      active:self&&viewer.profile==='jogador',
      require_password_change:!self};
  });
  if(viewer.profile==='jogador'&&!players.some(p=>
      p.id===viewer.playerId&&p.user_id===viewer.uid))invalid();
  const memberships:MailMembership[]=rows.house_memberships.map(m=>{
    if(!str(m.player_id)||!str(m.house_id))invalid();
    return {player_id:m.player_id as string,house_id:m.house_id as string};
  }).filter(m=>m.player_id!==viewer.playerId||
    viewer.memberHouseIds.includes(m.house_id));
  const houses:MailHouse[]=rows.campaign_houses.map(h=>{
    if(!str(h.id)||!str(h.name))invalid();
    return {id:h.id as string,name:h.name as string};
  });
  const letters:MailLetter[]=rows.campaign_letters.map(l=>{
    if(!str(l.id)||!str(l.sender_user_id)||typeof l.subject!=='string'||
       typeof l.content!=='string'||!str(l.created_at)||
       !['delivered','scheduled','draft'].includes(String(l.publication_state))||
       !optional(l.sender_player_id)||!optional(l.sender_name)||
       !optional(l.recipient_player_id)||!optional(l.recipient_house_id)||
       !optional(l.origin_house_id))invalid();
    // Original COPY field spellings intentionally stay unchanged.
    const source=l as unknown as MailLetter;
    return {...source,
      sender_player_id:(l.sender_player_id??null) as string|null,
      sender_name:(l.sender_name??null) as string|null,
      recipient_player_id:(l.recipient_player_id??null) as string|null,
      recipient_house_id:(l.recipient_house_id??null) as string|null,
      origin_house_id:(l.origin_house_id??null) as string|null,
      delivered_at:(l.delivered_at??null) as string|null,
      deleted_at:(l.deleted_at??null) as string|null,
      creation_week:(l.creation_week??null) as number|null,
      delivery_week:(l.delivery_week??null) as number|null,
      letter_number:(l.letter_number??null) as number|null,
      letter_kind:(l.letter_kind??null) as string|null,
      court_member_id:(l.court_member_id??null) as string|null,
      court_assignment:(l.court_assignment??null) as string|null,
      military_unit_id:(l.military_unit_id??null) as string|null,
      batch_key:(l.batch_key??null) as string|null,
    };
  });
  const replies:MailReply[]=rows.letter_replies.map(rr=>{
    if(!str(rr.id)||!str(rr.letter_id)||!str(rr.author_user_id)||
       !optional(rr.recipient_user_id)||!optional(rr.author_name)||
       typeof rr.content!=='string'||!str(rr.created_at)||
       typeof rr.publication_state!=='string')invalid();
    return {...rr,author_name:(rr.author_name??null) as string|null,
      recipient_user_id:(rr.recipient_user_id??null) as string|null,
      deleted_at:(rr.deleted_at??null) as string|null,
      delivered_at:(rr.delivered_at??null) as string|null,
      delivery_week:(rr.delivery_week??null) as number|null,
      creation_week:(rr.creation_week??null) as number|null,
    } as MailReply;
  });
  const receipts=rows.letter_receipts.map(rr=>{
    if(!str(rr.letter_id)||!str(rr.user_id)||!str(rr.read_at))invalid();
    return {letter_id:rr.letter_id as string,user_id:rr.user_id as string,
      read_at:rr.read_at as string};
  });
  const rounds:MailRound[]=rows.letter_rounds.map(rr=>{
    if(!integer(rr.number,1,2147483647)||typeof rr.status!=='string')invalid();
    return {number:rr.number as number,status:rr.status as string};
  });
  return {letters,replies,receipts,players,memberships,houses,rounds,
    adminUserIds:new Set(viewer.profile==='narrador'?[viewer.uid]:[]),
    editorUserIds:new Set()};
}

export function runWorkspaceMailPage(
  rows:WorkspaceMailTables,viewer:VerifiedWorkspaceMailScope,input:WorkspaceMailInput,
){
  const {page,size,filters}=validateWorkspaceMailInput(input);
  const data=projectWorkspaceMailTables(rows,viewer);
  if(filters.box==='lixeira')return mailTrashPage(data,{uid:viewer.uid},filters,page,size);
  return mailPage(data,{uid:viewer.uid},filters,page,size);
}

/** Data never leaves the trusted server before the original ACL is applied. */
export async function loadWorkspaceMailPage(db:unknown,snapshotId:string,
  viewer:VerifiedWorkspaceMailScope,input:WorkspaceMailInput){
  if(!/^[a-f0-9]{64}$/.test(snapshotId))invalid();
  // Validate before reading private Cloud collections.
  validateWorkspaceMailInput(input);
  const results=await Promise.all(TABLES.map(name=>
    readWorkspaceTable(db,snapshotId,name)));
  const tables=Object.fromEntries(TABLES.map((name,i)=>[name,results[i]])) as WorkspaceMailTables;
  return runWorkspaceMailPage(tables,viewer,input);
}
