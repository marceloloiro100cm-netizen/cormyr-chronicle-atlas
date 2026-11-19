/**
 * Firebase-only, read-only projection of original correspondence.
 * The original mailPage/mailTrashPage functions remain the single source
 * of filtering semantics. Nothing from this module may be called before the
 * trusted Firebase server has checked the live Auth and House scope.
 */
import {
  mailPage,mailTrashPage,canReadLetterAs,canReadReply,
  type MailDataset,type MailFilters,type MailLetter,type MailReply,
  type MailPlayer,type MailMembership,type MailHouse,type MailRound,
} from './mail-page-contract';
import {readWorkspaceTable} from '../../../scripts/firebase/workspace-import.mjs';

export type VerifiedWorkspaceMailScope={
  /** 'editor' = Editor-Chefe: leitura de missivas entregues, sem Casa. */
  uid:string;profile:'narrador'|'jogador'|'editor';playerId:string|null;
  memberHouseIds:string[];
};
export type WorkspaceMailInput={page?:unknown;size?:unknown;filters?:unknown};
type WorkspaceMailSourceField =
  'id'|'user_id'|'roster_house_id'|'active'|'require_password_change'|
  'player_id'|'house_id'|'name'|'sender_user_id'|'sender_player_id'|
  'sender_name'|'recipient_player_id'|'recipient_house_id'|'origin_house_id'|
  'subject'|'content'|'created_at'|'publication_state'|'delivered_at'|
  'deleted_at'|'creation_week'|'delivery_week'|'letter_number'|'letter_kind'|
  'court_member_id'|'court_assignment'|'military_unit_id'|'batch_key'|
  'letter_id'|'author_user_id'|'author_name'|'recipient_user_id'|
  'read_at'|'number'|'status';
export type WorkspaceMailRow=Record<string,unknown> &
  Partial<Record<WorkspaceMailSourceField,unknown>>;
export type WorkspaceMailTables={
  campaign_letters:WorkspaceMailRow[];
  letter_replies:WorkspaceMailRow[];
  letter_receipts:WorkspaceMailRow[];
  letter_rounds:WorkspaceMailRow[];
  campaign_players:WorkspaceMailRow[];
  house_memberships:WorkspaceMailRow[];
  campaign_houses:WorkspaceMailRow[];
};
const TABLES=[
  'campaign_letters','letter_replies','letter_receipts','letter_rounds',
  'campaign_players','house_memberships','campaign_houses',
] as const;
const FILTER_KEYS=new Set([
  'box','number','kind','origin','house','court','unit','answered','read',
  'text','group_house_ids',
]);
const invalid=():never=>{throw Error('workspace_mail_contract_invalid');};
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
  const rawFilters=input.filters;
  const source:Record<string,unknown>=rawFilters===undefined?{}:
    plain(rawFilters)?rawFilters:invalid();
  if(Object.keys(source).some(k=>!FILTER_KEYS.has(k)))invalid();
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
  if(!viewer||!str(viewer.uid)||!['narrador','jogador','editor'].includes(viewer.profile)||
     !Array.isArray(viewer.memberHouseIds)||
     viewer.memberHouseIds.some(id=>!str(id))||
     viewer.profile==='jogador'&&!str(viewer.playerId)||
     // O Editor-Chefe nunca carrega identidade de jogador nem Casa.
     viewer.profile==='editor'&&(viewer.playerId!==null||viewer.memberHouseIds.length>0))invalid();
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
    editorUserIds:new Set(viewer.profile==='editor'?[viewer.uid]:[])};
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


/**
 * Original, viewer-authorized filter metadata for the real Council.
 * Source of every option is the SAME immutable archive and server-side ACL
 * as mail_page. Never include private text or another House's hidden letters.
 */
export function projectWorkspaceMailOptions(
  rows:WorkspaceMailTables,viewer:VerifiedWorkspaceMailScope,
){
  const data=projectWorkspaceMailTables(rows,viewer);
  const visible=data.letters.filter(l=>canReadLetterAs(data,l,viewer.uid));
  const visibleIds=new Set(visible.map(l=>l.id));
  const replies=data.replies.filter(r=>visibleIds.has(r.letter_id)&&
    canReadReply(data,r,viewer.uid));
  const houseNames=new Map(data.houses.map(h=>[h.id,h.name]));
  const named=(houseId:string|null,partId:string|null)=>
    houseId&&partId?houseId+':'+partId:null;
  const courts=new Map<string,string>(),units=new Map<string,string>(),weeks=new Set<number>();
  const idsSafe=(value:string)=>value.length<=128&&
    !/[\\/\u0000-\u001f]/.test(value);
  for(const letter of visible){
    for(const n of [letter.letter_number,letter.delivery_week]){
      if(typeof n==='number'&&Number.isSafeInteger(n)&&n>=0)weeks.add(n);
    }
    for(const [key,map] of [
      [named(letter.origin_house_id,letter.court_member_id),courts],
      [named(letter.origin_house_id,letter.military_unit_id),units],
    ] as const){
      if(!key||!idsSafe(key))continue;
      const [houseId,id]=key.split(':',2);
      map.set(key,(houseNames.get(houseId??'')??'Casa histórica')+
        ' · vínculo '+String(id??'').slice(-8));
    }
  }
  for(const reply of replies)for(const n of [reply.delivery_week,reply.creation_week]){
    if(typeof n==='number'&&Number.isSafeInteger(n)&&n>=0)weeks.add(n);
  }
  const pairs=(items:Map<string,string>)=>[...items].sort((a,b)=>
    a[1].localeCompare(b[1],'pt-BR')).map(([id,label])=>({id,label}));
  return {readOnly:true,verifiedViewerScope:true,
    houses:data.houses.filter(h=>idsSafe(h.id)&&h.name.length<=256)
      .sort((a,b)=>a.name.localeCompare(b.name,'pt-BR'))
      .map(h=>({id:h.id,label:h.name})),
    weeks:[...weeks].sort((a,b)=>b-a),
    courts:pairs(courts),units:pairs(units),
    rounds:data.rounds.filter(r=>Number.isSafeInteger(r.number))
      .map(r=>({number:r.number,status:r.status})),
  };
}
export async function loadWorkspaceMailOptions(db:unknown,snapshotId:string,
  viewer:VerifiedWorkspaceMailScope){
  if(!/^[a-f0-9]{64}$/.test(snapshotId))invalid();
  const results=await Promise.all(TABLES.map(name=>
    readWorkspaceTable(db,snapshotId,name)));
  const rows=Object.fromEntries(TABLES.map((name,i)=>[name,results[i]])) as WorkspaceMailTables;
  return projectWorkspaceMailOptions(rows,viewer);
}

/**
 * Read-only source headers for the ORIGINAL, immutable Council presentation.
 * Live Firebase Auth/House scope must be checked BEFORE this function is called.
 * Mail bodies and cross-House user IDs are never returned in this bootstrap.
 */
export function projectWorkspaceMailContext(
  rows:WorkspaceMailTables,viewer:VerifiedWorkspaceMailScope,
){
  const data=projectWorkspaceMailTables(rows,viewer);
  const letters=data.letters.filter(letter=>
    canReadLetterAs(data,letter,viewer.uid));
  const visible=new Set(letters.map(letter=>letter.id));
  const nonempty=(v:unknown,max=200):v is string=>
    typeof v==='string'&&v.length>0&&v.length<=max;
  const nullable=(v:unknown)=>nonempty(v)?v:null;
  const currentPlayer=rows.campaign_players.find(p=>p.id===viewer.playerId&&
    p.user_id===viewer.uid);
  const name=nonempty(currentPlayer?.name)?currentPlayer.name:
    viewer.profile==='narrador'?'Narrador':'Jogador';
  const houses=rows.campaign_houses.map(h=>{
    const privileged=viewer.profile==='narrador'||
      viewer.memberHouseIds.includes(String(h.id));
    return {
      id:h.id,name:h.name,active:h.active===true,
      season:h['season']??null,region:nonempty(h['region'])?h['region']:'',
      details:privileged&&typeof h['details']==='string'?h['details']:'',
      castle:nullable(h['castle']),crest:nullable(h['crest']),
      lord_name:privileged?nullable(h['lord_name']):null,
    };
  });
  const players=rows.campaign_players.map(p=>{
    const own=p.id===viewer.playerId&&p.user_id===viewer.uid;
    return {
      id:p.id,
      user_id:viewer.profile==='narrador'?nullable(p.user_id):
        own?viewer.uid:null,
      name:own&&nonempty(p.name)?p.name:
        viewer.profile==='narrador'&&nonempty(p.name)?p.name:
        'Jogador da campanha',
      roster_house_id:nullable(p.roster_house_id),
      active:viewer.profile==='narrador'?p.active===true:own,
      require_password_change:viewer.profile==='narrador'
        ?p.require_password_change===true:!own,
    };
  });
  const members=rows.house_memberships.filter(m=>
    viewer.profile==='narrador'||
      m.player_id===viewer.playerId&&
      viewer.memberHouseIds.includes(String(m.house_id)))
    .map(m=>({player_id:m.player_id,house_id:m.house_id,
      // The archived member's old edit permission is NEVER a Cloud grant.
      can_edit:false,can_edit_attributes:false}));
  return {
    readOnly:true,verifiedViewerScope:true,
    viewer:{uid:viewer.uid,profile:viewer.profile,
      playerId:viewer.playerId,name},
    houses,players,members,
    // Minimal original headers: no arbitrary source columns or body text.
    letters:letters.map(l=>({
      id:l.id,sender_user_id:l.sender_user_id,
      sender_player_id:l.sender_player_id,sender_name:l.sender_name,
      recipient_house_id:l.recipient_house_id,
      recipient_player_id:l.recipient_player_id,
      origin_house_id:l.origin_house_id,
      subject:l.subject,content:'',created_at:l.created_at,
      delivered_at:l.delivered_at,deleted_at:l.deleted_at,
      creation_week:l.creation_week,delivery_week:l.delivery_week,
      letter_number:l.letter_number,letter_kind:l.letter_kind,
      court_member_id:l.court_member_id,court_assignment:l.court_assignment,
      military_unit_id:l.military_unit_id,batch_key:l.batch_key,
      publication_state:l.publication_state,
    })),
    replies:data.replies.filter(reply=>visible.has(reply.letter_id)&&
      canReadReply(data,reply,viewer.uid)).map(r=>({
      id:r.id,letter_id:r.letter_id,author_user_id:r.author_user_id,
      author_name:r.author_name,recipient_user_id:r.recipient_user_id,
      content:'',publication_state:r.publication_state,
      created_at:r.created_at,delivered_at:r.delivered_at,
      deleted_at:r.deleted_at,delivery_week:r.delivery_week,
      creation_week:r.creation_week,
    })),
    receipts:data.receipts.filter(rr=>
      visible.has(rr.letter_id)&&
      (viewer.profile==='narrador'||rr.user_id===viewer.uid)),
    rounds:data.rounds,
    catalog:houses.map(h=>({id:h.id,name:h.name})),
  };
}
export async function loadWorkspaceMailContext(db:unknown,snapshotId:string,
  viewer:VerifiedWorkspaceMailScope){
  if(!/^[a-f0-9]{64}$/.test(snapshotId))invalid();
  const results=await Promise.all(TABLES.map(name=>
    readWorkspaceTable(db,snapshotId,name)));
  const rows=Object.fromEntries(TABLES.map((name,i)=>
    [name,results[i]])) as WorkspaceMailTables;
  return projectWorkspaceMailContext(rows,viewer);
}
