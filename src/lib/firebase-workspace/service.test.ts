import {beforeEach,describe,it,expect,vi} from 'vitest';
const f=vi.hoisted(()=>({scope:{uid:'a',profile:'jogador',playerId:'pa',memberHouseIds:['ashkar'],editHouseIds:['ashkar']} as any,tables:{} as Record<string,any[]>,after:null as any,calls:0,
 runtimeReady:false,liveRound:2,cloudReceipts:[] as any[],cloudLetters:[] as any[],cloudVersions:[] as any[],cloudNotes:[] as any[],hubAudit:[] as any[],events:[] as any[],economies:[] as any[],writes:[] as any[],schedule:vi.fn(),ack:vi.fn(),send:vi.fn(),batch:vi.fn(),reply:vi.fn(),
 unread:vi.fn(),cancel:vi.fn(),restore:vi.fn(),edit:vi.fn()}));
vi.mock('../../../scripts/firebase/workspace-import.mjs',()=>({workspaceTables:new Set(),readWorkspaceTable:async(_d:any,_s:any,n:string)=>{
 if(!(n in f.tables))throw Error('workspace_source_table_missing');return f.tables[n];
}}));
vi.mock('../../../scripts/firebase/cloud-readonly-service.mjs',()=>({CloudAccessError:class extends Error{constructor(public code:string,public status=403){super(code);}},createFirebaseCloudReadonly:()=>({
 workspaceScope:async()=>{f.calls++;return f.after&&f.calls>1?f.after:f.scope;},workspaceCalendar:async()=>({year:1522,month:0,day:1,festival:null,version:1}),getCalendar:async()=>({year:1522,month:0,day:1,version:1}),
 getHouse:async(_t:string,h:string)=>({state:{houseId:h,units:[]},version:7}),
})}));
vi.mock('../../../scripts/firebase/cloud-mail-service.mjs',()=>({
 CloudMailError:class extends Error{constructor(public code:string,public status=403){super(code);}},
 createFirebaseCloudMail:()=>({markRead:f.ack,send:f.send,sendBatch:f.batch,reply:f.reply,
  markUnread:f.unread,cancel:f.cancel,restore:f.restore,edit:f.edit,schedule:f.schedule}),
}));
import {createWorkspaceService} from './service';
const access=[{userId:'a',playerId:'pa',profile:'jogador',admin:false,active:true,requirePasswordChange:false,memberHouseIds:['ashkar'],editHouseIds:['ashkar']},
 {userId:'gm',playerId:'pg',profile:'narrador',admin:true,active:true,requirePasswordChange:false,memberHouseIds:[],editHouseIds:[]}];
const db:any={runTransaction:async(work:any)=>work({get:async(ref:any)=>ref.get(),
 set:(ref:any,v:any)=>f.writes.push({op:'set',v}),create:(ref:any,v:any)=>f.writes.push({op:'create',v})}),
 collection:(name:string)=>({doc:()=>({
 get:async()=>({
  exists:f.runtimeReady&&['campaignCloudRuntime','campaignMailRuntime','migrationTimeEngineStage'].includes(name),
  data:()=>name==='campaignCloudRuntime'?{status:'active',private:true,sourceSnapshotId:'a'.repeat(64),sourceSnapshotReconciled:true,applicationEnabled:true,
   mailWriteApproved:true,openRound:f.liveRound,calendarVersion:1}
   :name==='campaignMailRuntime'?{status:'active',private:true,sourceSnapshotId:'a'.repeat(64),sourceLiveReconciled:true,applicationEnabled:true,mailEnabled:true,openRound:f.liveRound,calendarVersion:1}:undefined,
 }),
 collection:(sub:string)=>({
  get:async()=>({docs:sub==='access'?access.map(v=>({data:()=>v})):[]}),
  doc:()=>({get:async()=>({exists:f.runtimeReady,data:()=>({year:1522,month:0,day:1,version:1})})}),
  limit:()=>({get:async()=>({docs:(sub==='letters'?f.cloudLetters:sub==='letterVersions'?f.cloudVersions:sub==='narratorMailNotes'?f.cloudNotes:sub==='calendarAudit'?f.hubAudit:sub==='scheduleEvents'?f.events:sub==='houseEconomies'?f.economies:sub==='letterConsequences'?[]:f.cloudReceipts).map(v=>({id:v.id,data:()=>v.data}))})}),
  where:()=>({get:async()=>({docs:[]})}),
 })
})})};
const run=(input:any)=>createWorkspaceService({db,auth:{},snapshotId:'a'.repeat(64)}).execute('valid-token',input);
const letter=(id:string,house:string,extra:any={})=>({id,sender_user_id:'gm',sender_player_id:'pg',sender_name:'Narrador',recipient_house_id:house,recipient_player_id:null,origin_house_id:null,subject:id,content:'real source '+id,created_at:'2026-11-01T00:00:00Z',delivered_at:'2026-11-01T00:00:00Z',deleted_at:null,publication_state:'delivered',delivery_week:2,creation_week:2,letter_number:2,letter_kind:'reservada',court_member_id:null,court_assignment:null,military_unit_id:null,batch_key:null,...extra});
beforeEach(()=>{
 f.calls=0;f.after=null;f.runtimeReady=false;f.liveRound=2;f.cloudReceipts=[];f.cloudLetters=[];f.cloudVersions=[];f.cloudNotes=[];f.hubAudit=[];f.events=[];f.economies=[];f.writes=[];f.schedule.mockReset();f.ack.mockReset();f.send.mockReset();f.batch.mockReset();f.reply.mockReset();
 f.unread.mockReset();f.cancel.mockReset();f.restore.mockReset();f.edit.mockReset();vi.unstubAllEnvs();
 f.scope={uid:'a',profile:'jogador',playerId:'pa',memberHouseIds:['ashkar'],editHouseIds:['ashkar']};
 f.tables={campaign_players:[{id:'pa',user_id:'a',roster_house_id:'ashkar'},{id:'pg',user_id:'gm'}],campaign_houses:[{id:'ashkar',name:'Ashkar',active:true}],
 campaign_letters:[letter('mine','ashkar'),letter('secret','other'),letter('draft','ashkar',{publication_state:'draft'})],
 letter_replies:[],letter_receipts:[],letter_rounds:[{number:2,status:'open'}],
 campaign_records:[{id:'own',house_id:'ashkar',visibility:'house',content:'own'},{id:'gm',house_id:'ashkar',visibility:'gm',content:'secret'},{id:'foreign',house_id:'other',visibility:'house'}],
 campaign_newspapers:[{id:'edition-real',state:'published',blocks:[]},{id:'private-draft',state:'draft',blocks:[]}],
 };
});
describe('real Firebase workspace boundary',()=>{
 it('only returns authorized original letters and preserves the mail filter contract',async()=>{
  const result=await run({kind:'rpc',name:'mail_page',args:{p_filters:{number:'2'}}});
  expect(result.letters.map((r:any)=>r.id)).toEqual(['mine']);expect(result.letters[0].content).toBe('real source mine');
  expect((await run({kind:'rpc',name:'mail_page',args:{p_filters:{house:'other'}}})).letters).toEqual([]);
 });
 it('never exposes narrator secrets or other houses through generic table queries',async()=>{
  const r=await run({kind:'query',table:'campaign_records',steps:[{op:'select',args:['*']}]});
  expect(r.data.map((x:any)=>x.id)).toEqual(['own']);
 });
 it('a forged house query cannot grant access',async()=>{
  await expect(run({kind:'house',houseId:'other'})).rejects.toThrow('access_denied');
 });
 it('player sees published real newspapers only, editor sees drafts and reads delivered missives only',async()=>{
  expect((await run({kind:'query',table:'campaign_newspapers',steps:[]})).data.map((x:any)=>x.id)).toEqual(['edition-real']);
  f.scope={...f.scope,uid:'editor',profile:'editor',playerId:null,memberHouseIds:[],editHouseIds:[]};
  expect((await run({kind:'query',table:'campaign_newspapers',steps:[]})).data).toHaveLength(2);
  expect((await run({kind:'query',table:'campaign_letters',steps:[]})).data.map((x:any)=>x.id)).toEqual(['mine','secret']);
  expect((await run({kind:'rpc',name:'mail_page',args:{}})).letters.map((x:any)=>x.id).sort()).toEqual(['mine','secret']);
  for(const name of ['narrator_mail_notes','campaign_letter_consequences','letter_versions'])
   expect((await run({kind:'query',table:name,steps:[]})).data).toEqual([]);
  await expect(run({kind:'rpc',name:'mail_trash_page',args:{}})).rejects.toThrow('access_denied');
  await expect(run({kind:'rpc',name:'mail_compose_options',args:{}})).rejects.toThrow('access_denied');
  await expect(run({kind:'rpc',name:'delete_campaign_letter',args:{p_id:'mine'}})).rejects.toThrow('access_denied');
 });
 it('fails closed when a source is missing or authorization changes during loading',async()=>{
  delete f.tables['campaign_newspapers'];
  await expect(run({kind:'query',table:'campaign_newspapers',steps:[]})).rejects.toThrow('workspace_source_table_missing');
  f.calls=0;f.after={...f.scope,memberHouseIds:[]};
  await expect(run({kind:'query',table:'campaign_records',steps:[]})).rejects.toThrow('access_denied');
 });
 it('rebuilds the real mail recipient directory and tolerates a House without a sheet',async()=>{
  f.scope={uid:'gm',profile:'narrador',playerId:'pg',memberHouseIds:[],editHouseIds:[]};
  f.tables['campaign_players']![0]!.name='Jogadora Ashkar';
  f.tables['campaign_players']!.push({id:'revoked',user_id:'revoked',name:'Pessoa revogada',roster_house_id:'ashkar'});
  f.tables['campaign_houses']![0]!.season=2;
  f.tables['campaign_houses']!.push({id:'no-sheet',name:'Casa sem ficha',active:true,season:2});
  f.tables['noble_house_sheets']=[{house_id:'ashkar',version:12,state:{
   court:[{id:'visible',name:'Arauto',role:'Mensageiro',private_notes:'NÃO EXPOR'},
    {id:'unresolved',npcId:'missing',name:'NÃO EXPOR'}],
   units:[{id:'u1',name:'Guardas',destroyed:false,internal:'NÃO EXPOR'},
    {id:'u2',name:'Perdas',destroyed:true}],
  }}];
  const data=await run({kind:'rpc',name:'mail_compose_options'});
  expect(data.players.some((p:any)=>p.name==='Jogadora Ashkar')).toBe(true);
  expect(data.players.some((p:any)=>p.name==='Pessoa revogada')).toBe(false);
  expect(data.houses.map((h:any)=>h.name)).toEqual(['Casa sem ficha','Ashkar'].sort((a,b)=>a.localeCompare(b,'pt-BR')));
  const empty=data.houses.find((h:any)=>h.id==='no-sheet');
  expect(empty).toMatchObject({version:null,court:[],units:[]});
  const ashkar=data.houses.find((h:any)=>h.id==='ashkar');
  expect(ashkar.court).toEqual([{id:'visible',name:'Arauto',role:'Mensageiro'}]);
  expect(ashkar.units).toEqual([{id:'u1',name:'Guardas',available:true},{id:'u2',name:'Perdas',available:false}]);
  expect(JSON.stringify(data)).not.toContain('NÃO EXPOR');
 });
 it('players only receive compose links from their currently authorized Houses',async()=>{
  f.tables['campaign_houses']![0]!.season=2;
  f.tables['campaign_houses']!.push({id:'other',name:'Outra Casa',active:true,season:2});
  f.tables['noble_house_sheets']=[];
  const data=await run({kind:'rpc',name:'mail_compose_options'});
  expect(data.houses.map((h:any)=>h.id)).toEqual(['ashkar']);
  expect(data.players.find((p:any)=>p.id==='pa').houses).toEqual(['ashkar']);
 });
 it('does not route historical player memberships into inactive or old-season recipient filters',async()=>{
  f.tables['noble_house_sheets']=[];
  const original=f.tables['campaign_houses']![0]!;
  original.season=1;
  const old=await run({kind:'rpc',name:'mail_compose_options'});
  expect(old.players.find((p:any)=>p.id==='pa')?.houses).toEqual([]);
  original.season=2;original.active=false;
  const disabled=await run({kind:'rpc',name:'mail_compose_options'});
  expect(disabled.players.find((p:any)=>p.id==='pa')?.houses).toEqual([]);
  original.active=true;
  const current=await run({kind:'rpc',name:'mail_compose_options'});
  expect(current.players.find((p:any)=>p.id==='pa')?.houses).toEqual(['ashkar']);
 });
 it('restores actual House narratives without leaking a foreign House or editorial access',async()=>{
  f.tables['campaign_houses']![0]!.details='História original Ashkar';
  f.tables['campaign_houses']!.push({id:'other',name:'Casa Estrangeira',active:true,season:2,details:'SEGREDO DA OUTRA CASA'});
  const getHouses=()=>run({kind:'query',table:'campaign_houses',steps:[{op:'select',args:['*']}]});
  const own=await getHouses();
  expect(own.data.find((h:any)=>h.id==='ashkar').details).toBe('História original Ashkar');
  expect(own.data.find((h:any)=>h.id==='other').details).toBe('');
  f.scope={...f.scope,uid:'editor',profile:'editor',playerId:null,memberHouseIds:[],editHouseIds:[]};
  const editorial=await getHouses();
  expect(editorial.data.every((h:any)=>h.details==='')).toBe(true);
  f.scope={...f.scope,uid:'gm',profile:'narrador',playerId:'pg'};
  const gm=await getHouses();
  expect(gm.data.find((h:any)=>h.id==='other').details).toBe('SEGREDO DA OUTRA CASA');
 });
 it('reconciles approved Cloud read receipts without changing imported letters',async()=>{
  // A real receipt is stored under its source-bound SHA-256 document ID.
  const {mailReceiptId}=await import('../../../scripts/firebase/cloud-mail-receipt-core.mjs');
  f.runtimeReady=true;
  f.cloudReceipts=[
   {id:mailReceiptId('a','imported','mine'),data:{viewerUid:'a',source:'imported',letterId:'mine',readAt:'2026-11-19T11:00:00Z'}},
   {id:'spoofed',data:{viewerUid:'a',source:'imported',letterId:'mine',readAt:'2026-11-19T12:00:00Z'}},
   {id:mailReceiptId('a','imported','secret'),data:{viewerUid:'a',source:'imported',letterId:'secret',readAt:'2026-11-19T13:00:00Z'}},
  ];
  const receiptRows=await run({kind:'query',table:'letter_receipts',steps:[]});
  expect(receiptRows.data).toEqual([{letter_id:'mine',user_id:'a',read_at:'2026-11-19T11:00:00Z'}]);
  expect((await run({kind:'rpc',name:'mail_page',args:{p_filters:{read:'yes'}}})).letters.map((l:any)=>l.id)).toEqual(['mine']);
  expect((await run({kind:'rpc',name:'mail_page',args:{p_filters:{read:'no'}}})).letters.map((l:any)=>l.id)).toEqual([]);
  expect(f.tables['letter_receipts']).toEqual([]);
 });
 it('includes separately approved live Firebase messages in the original filtered inbox',async()=>{
  f.runtimeReady=true;
  const id='b'.repeat(64),foreign='c'.repeat(64);
  const base={source:'firebase-cloud',sourceSnapshotId:'a'.repeat(64),
   senderUid:'gm',senderPlayerId:null,senderName:'Narrador',
   originHouseId:null,recipientKind:'house',recipientPlayerId:null,
   subject:'Aviso operacional',content:'Conteúdo real Cloud',
   createdAt:'2026-11-19T14:00:00Z',deliveredAt:'2026-11-19T14:00:00Z',
   campaignDate:'1522-01-01',creationRound:2,deliveryRound:2,
   deletedAt:null,publicationState:'delivered'};
  f.cloudLetters=[
   {id,data:{...base,id,recipientHouseId:'ashkar'}},
   {id:foreign,data:{...base,id:foreign,recipientHouseId:'other',subject:'SEGREDO'}},
  ];
  const rows=await run({kind:'query',table:'campaign_letters',steps:[]});
  expect(rows.data.map((m:any)=>m.id)).toEqual(['mine',id]);
  const page=await run({kind:'rpc',name:'mail_page',args:{p_filters:{text:'Aviso operacional'}}});
  expect(page.letters.map((m:any)=>m.id)).toEqual([id]);
  expect(JSON.stringify(page)).not.toContain('SEGREDO');
  // Editor-Chefe (19/11/2026): lê toda missiva entregue, nunca rascunho.
  f.scope={...f.scope,uid:'editor',profile:'editor',playerId:null,memberHouseIds:[],editHouseIds:[]};
  expect((await run({kind:'query',table:'campaign_letters',steps:[]})).data.map((m:any)=>m.id))
   .toEqual(['mine','secret',id,foreign]);
 });
 it('refuses a malformed approved Cloud message rather than returning a partial inbox',async()=>{
  f.runtimeReady=true;
  f.cloudLetters=[{id:'b'.repeat(64),data:{subject:'bad'}}];
  await expect(run({kind:'rpc',name:'mail_page',args:{}})).rejects.toThrow('firebase_operational_mail_integrity_failed');
  f.runtimeReady=false;
  expect((await run({kind:'rpc',name:'mail_page',args:{}})).letters.map((x:any)=>x.id)).toEqual(['mine']);
 });
 it('uses approved Cloud open round without changing the immutable archived week',async()=>{
  f.runtimeReady=true;f.liveRound=3;
  const live=await run({kind:'query',table:'letter_rounds',steps:[]});
  expect(live.data.map((r:any)=>({number:r.number,status:r.status}))).toEqual([
   {number:2,status:'closed'},{number:3,status:'open'},
  ]);
  expect(f.tables['letter_rounds']).toEqual([{number:2,status:'open'}]);
  f.runtimeReady=false;
  expect((await run({kind:'query',table:'letter_rounds',steps:[]})).data)
   .toEqual([{number:2,status:'open'}]);
 });
 it('does not trust receipts from an unapproved Cloud runtime',async()=>{
  const {mailReceiptId}=await import('../../../scripts/firebase/cloud-mail-receipt-core.mjs');
  f.cloudReceipts=[{id:mailReceiptId('a','imported','mine'),data:{viewerUid:'a',source:'imported',letterId:'mine',readAt:'2026-11-19T11:00:00Z'}}];
  expect((await run({kind:'query',table:'letter_receipts',steps:[]})).data).toEqual([]);
 });
 it('sends the original composer single-recipient letter through the approved transaction',async()=>{
  const args={p_action:'send_linked_mail',p_date:'1522-01-01',p_args:{
   p_key:'test-send-001',p_origin:'ashkar',p_targets:['narrator'],
   p_subject:'Carta ao Narrador',p_content:'Mensagem verdadeira',
   p_court:null,p_unit:null,p_role:null,p_draft:false,p_week:null,p_signed_by:null,
  }};
  await expect(run({kind:'rpc',name:'dated_mail_action',args})).rejects.toThrow('workspace_operation_not_implemented');
  vi.stubEnv('CORMYR_FIREBASE_CLOUD_MAIL_ENABLED','true');
  f.send.mockResolvedValue({id:'b'.repeat(64),duplicate:false,state:'delivered',deliveryRound:2});
  const result=await run({kind:'rpc',name:'dated_mail_action',args});
  expect(result).toEqual({ids:['b'.repeat(64)],duplicate:false,state:'delivered',week:2});
  expect(f.send).toHaveBeenCalledWith('valid-token',expect.objectContaining({
   recipientKind:'narrator',recipientHouseId:null,
   expectedCampaignDate:'1522-01-01',
  }));
  await expect(run({kind:'rpc',name:'dated_mail_action',args:{
   ...args,p_date:'1522-01-02',
  }})).rejects.toThrow('campaign_date_changed');
  await expect(run({kind:'rpc',name:'dated_mail_action',args:{
   ...args,p_args:{...args.p_args,p_targets:['h:other','narrator']},
  }})).rejects.toThrow('invalid_mail_request');
  expect(f.send).toHaveBeenCalledTimes(1);
 });
 it('uses one approved Cloud transaction for multiple House targets',async()=>{
  vi.stubEnv('CORMYR_FIREBASE_CLOUD_MAIL_ENABLED','true');
  f.batch.mockResolvedValue({ids:['b'.repeat(64),'c'.repeat(64)],duplicate:false,state:'delivered',deliveryRound:2});
  const args={p_action:'send_linked_mail',p_date:'1522-01-01',p_args:{
   p_key:'batch-abc123',p_origin:'ashkar',p_targets:['h:ashkar','h:other'],
   p_subject:'Carta conjunta',p_content:'Mesma mensagem',p_court:null,p_unit:null,
   p_role:null,p_draft:false,p_week:null,p_signed_by:null,
  }};
  const reply=await run({kind:'rpc',name:'dated_mail_action',args});
  expect(reply.ids).toHaveLength(2);expect(reply.state).toBe('delivered');
  expect(f.batch).toHaveBeenCalledTimes(1);expect(f.send).not.toHaveBeenCalled();
  const sent=f.batch.mock.calls[0]![1];
  expect(sent.map((x:any)=>x.requestKey)).toEqual(['batch-abc123_0','batch-abc123_1']);
 });
 it('connects original reply and week detection to approved Firebase mail',async()=>{
  f.runtimeReady=true;vi.stubEnv('CORMYR_FIREBASE_CLOUD_MAIL_ENABLED','true');
  expect((await run({kind:'rpc',name:'reply_delivery_week',
   args:{p_recipient:'gm'}}))).toEqual(2);
  f.reply.mockResolvedValue({id:'f'.repeat(64),duplicate:false,state:'delivered',deliveryRound:2});
  const args={p_action:'reply_weekly_message',p_date:'1522-01-01',p_args:{
   p_letter:'b'.repeat(64),p_reply:null,p_content:'Resposta',
   p_key:'safe-reply-1234',p_draft:false,p_signed_by:null,
  }};
  const result=await run({kind:'rpc',name:'dated_mail_action',args});
  expect(result).toMatchObject({ids:['f'.repeat(64)],week:2,state:'delivered'});
  expect(f.reply).toHaveBeenCalledWith('valid-token',expect.objectContaining({
   expectedCampaignDate:'1522-01-01',letterId:'b'.repeat(64),
  }));
  f.runtimeReady=false;
  expect(await run({kind:'rpc',name:'reply_delivery_week',
   args:{p_recipient:'gm'}})).toBeNull();
 });
 it('links original Mark as read to the guarded Firebase transaction only when enabled',async()=>{
  await expect(run({kind:'rpc',name:'mark_letter_read',args:{p_id:'mine'}})).rejects.toThrow('workspace_operation_not_implemented');
  vi.stubEnv('CORMYR_FIREBASE_CLOUD_MAIL_ENABLED','true');
  f.ack.mockResolvedValue({recorded:true,alreadyRecorded:false});
  expect(await run({kind:'rpc',name:'mark_letter_read',args:{p_id:'mine'}})).toEqual({recorded:true,alreadyRecorded:false});
  expect(f.ack).toHaveBeenCalledWith('valid-token',{source:'imported',letterId:'mine'});
  await expect(run({kind:'rpc',name:'mark_letter_read',args:{p_id:'mine',userId:'other'}}))
   .rejects.toThrow('invalid_receipt_request');
  // Editor-Chefe registra só a própria leitura de missivas entregues.
  f.scope={...f.scope,uid:'editor',profile:'editor',playerId:null,memberHouseIds:[],editHouseIds:[]};
  f.ack.mockClear();
  await run({kind:'rpc',name:'mark_letter_read',args:{p_id:'secret'}});
  expect(f.ack).toHaveBeenCalledWith('valid-token',{source:'imported',letterId:'secret'});
  await expect(run({kind:'rpc',name:'mark_letter_read',args:{p_id:'draft'}})).rejects.toThrow('access_denied');
 });
 it('detects a Cloud receipt source on the trusted server, never from a caller-supplied field',async()=>{
  vi.stubEnv('CORMYR_FIREBASE_CLOUD_MAIL_ENABLED','true');
  f.runtimeReady=true;
  const id='f'.repeat(64);
  f.cloudLetters=[{id,data:{
   id,source:'firebase-cloud',sourceSnapshotId:'a'.repeat(64),
   senderUid:'gm',senderPlayerId:null,senderName:'Narrador',originHouseId:null,
   recipientKind:'house',recipientHouseId:'ashkar',recipientPlayerId:null,
   subject:'Carta operacional',content:'Texto operacional',
   createdAt:'2026-11-19T16:00:00Z',deliveredAt:'2026-11-19T16:00:00Z',
   campaignDate:'1522-01-01',creationRound:2,deliveryRound:2,
   publicationState:'delivered',deletedAt:null,
  }}];
  f.ack.mockResolvedValue({recorded:true,alreadyRecorded:false});
  await run({kind:'rpc',name:'mark_letter_read',args:{p_id:id}});
  expect(f.ack).toHaveBeenCalledWith('valid-token',{source:'firebase-cloud',letterId:id});
  await expect(run({kind:'rpc',name:'mark_letter_read',args:{
   p_id:id,source:'imported',
  }})).rejects.toThrow('invalid_receipt_request');
  f.ack.mockClear();
  await expect(run({kind:'rpc',name:'mark_letter_read',args:{p_id:'secret'}}))
   .rejects.toThrow('access_denied');
  expect(f.ack).not.toHaveBeenCalled();
 });
 it('unknown operations never fall back to Supabase or synthetic success',async()=>{
  await expect(run({kind:'rpc',name:'arbitrary_write',args:{}})).rejects.toThrow('workspace_operation_not_implemented');
 });
 it('routes unread, cancel, restore and edit of own Cloud letters with server-side versions',async()=>{
  vi.stubEnv('CORMYR_FIREBASE_CLOUD_MAIL_ENABLED','true');
  f.runtimeReady=true;
  const own='e'.repeat(64),gone='d'.repeat(64),inbound='f'.repeat(64);
  const base={source:'firebase-cloud',sourceSnapshotId:'a'.repeat(64),senderPlayerId:'pa',senderName:'Jogador',
   recipientPlayerId:null,createdAt:'2026-11-19T16:00:00Z',deliveredAt:'2026-11-19T16:00:00Z',
   campaignDate:'1522-01-01',creationRound:2,deliveryRound:2,publicationState:'delivered'};
  f.cloudLetters=[
   {id:own,data:{...base,id:own,senderUid:'a',originHouseId:'ashkar',recipientKind:'narrator',recipientHouseId:null,
    subject:'Minha ordem',content:'Texto',deletedAt:null,version:2}},
   {id:gone,data:{...base,id:gone,senderUid:'a',originHouseId:'ashkar',recipientKind:'narrator',recipientHouseId:null,
    subject:'Cancelada',content:'Texto',deletedAt:'2026-11-19T17:00:00Z',removalKind:'cancelada',version:3}},
   {id:inbound,data:{...base,id:inbound,senderUid:'gm',senderPlayerId:null,originHouseId:null,recipientKind:'house',
    recipientHouseId:'ashkar',subject:'Do Narrador',content:'Texto',deletedAt:null}},
  ];
  f.cancel.mockResolvedValue({removed:true});f.restore.mockResolvedValue({restored:true});
  f.edit.mockResolvedValue({edited:true});f.unread.mockResolvedValue({recorded:false});
  await run({kind:'rpc',name:'mark_letter_unread',args:{p_id:inbound}});
  expect(f.unread).toHaveBeenCalledWith('valid-token',{source:'firebase-cloud',letterId:inbound});
  await run({kind:'rpc',name:'mark_letter_unread',args:{p_id:'mine'}});
  expect(f.unread).toHaveBeenLastCalledWith('valid-token',{source:'imported',letterId:'mine'});
  await run({kind:'rpc',name:'delete_campaign_letter',args:{p_id:own}});
  expect(f.cancel).toHaveBeenCalledWith('valid-token',{letterId:own,expectedVersion:2});
  await run({kind:'rpc',name:'restore_campaign_letter',args:{p_id:gone}});
  expect(f.restore).toHaveBeenCalledWith('valid-token',{letterId:gone,expectedVersion:3});
  await run({kind:'rpc',name:'dated_mail_action',args:{p_action:'edit_campaign_letter',p_date:'1522-01-01',
   p_args:{p_id:own,p_version:2,p_subject:'Ordem revista',p_content:'Novo texto'}}});
  expect(f.edit).toHaveBeenCalledWith('valid-token',{letterId:own,expectedVersion:2,subject:'Ordem revista',content:'Novo texto'});
  // Versão antiga, data alterada, carta histórica e carta alheia não passam.
  await expect(run({kind:'rpc',name:'dated_mail_action',args:{p_action:'edit_campaign_letter',p_date:'1522-01-01',
   p_args:{p_id:own,p_version:1,p_subject:'x',p_content:'y'}}})).rejects.toThrow('letter_version_conflict');
  await expect(run({kind:'rpc',name:'dated_mail_action',args:{p_action:'edit_campaign_letter',p_date:'1522-01-09',
   p_args:{p_id:own,p_version:2,p_subject:'x',p_content:'y'}}})).rejects.toThrow('workspace_operation_not_implemented');
  await expect(run({kind:'rpc',name:'delete_campaign_letter',args:{p_id:'mine'}})).rejects.toThrow('workspace_operation_not_implemented');
  await expect(run({kind:'rpc',name:'delete_campaign_letter',args:{p_id:'secret'}})).rejects.toThrow('access_denied');
  await expect(run({kind:'rpc',name:'restore_campaign_letter',args:{p_id:inbound}})).rejects.toThrow('access_denied');
  await expect(run({kind:'rpc',name:'delete_campaign_letter',args:{p_id:own,p_version:9}})).rejects.toThrow('invalid_mail_lifecycle_request');
  // A cancelada fica fora da caixa do jogador e aparece na própria Lixeira.
  const page=await run({kind:'rpc',name:'mail_page',args:{}});
  expect(page.letters.map((l:any)=>l.id)).not.toContain(gone);
  const trash=await run({kind:'rpc',name:'mail_trash_page',args:{}});
  expect(trash.letters.map((l:any)=>l.id)).toEqual([gone]);
 });
 it('returns replaced Cloud versions only to their author under the approved runtime',async()=>{
  f.runtimeReady=true;
  const own='e'.repeat(64);
  f.cloudLetters=[{id:own,data:{source:'firebase-cloud',sourceSnapshotId:'a'.repeat(64),id:own,senderUid:'a',senderPlayerId:'pa',
   senderName:'Jogador',originHouseId:'ashkar',recipientKind:'narrator',recipientHouseId:null,recipientPlayerId:null,
   subject:'Ordem',content:'Atual',createdAt:'2026-11-19T16:00:00Z',deliveredAt:'2026-11-19T16:00:00Z',
   campaignDate:'1522-01-01',creationRound:2,deliveryRound:2,publicationState:'delivered',deletedAt:null,version:2}}];
  f.cloudVersions=[{id:'v1',data:{letterId:own,version:1,subject:'Ordem',content:'Antigo',replacedAt:'2026-11-19T16:30:00Z'}},
   {id:'vx',data:{letterId:'x'.repeat(64),version:1,subject:'Alheia',content:'NÃO EXPOR',replacedAt:'2026-11-19T16:30:00Z'}}];
  const rows=(await run({kind:'query',table:'letter_versions',steps:[]})).data;
  expect(rows).toEqual([{id:'v1',letter_id:own,version:1,snapshot:{subject:'Ordem',content:'Antigo'},created_at:'2026-11-19T16:30:00Z'}]);
  f.runtimeReady=false;
  expect((await run({kind:'query',table:'letter_versions',steps:[]})).data).toEqual([]);
 });
 it('access check never fails on historical duplicate rows of the same login',async()=>{
  f.tables['campaign_players']!.push({id:'old-a',user_id:'a',roster_house_id:'ashkar'},{id:'old-gm',user_id:'gm'});
  const own=await run({kind:'query',table:'campaign_players',steps:[{op:'select',args:['id']},{op:'eq',args:['user_id','a']},{op:'maybeSingle',args:[]}]});
  expect(own.data).toMatchObject({id:'pa',active:true});
  f.scope={uid:'gm',profile:'narrador',playerId:'pg',memberHouseIds:[],editHouseIds:[]};
  const gm=await run({kind:'query',table:'campaign_players',steps:[{op:'eq',args:['user_id','gm']},{op:'maybeSingle',args:[]}]});
  expect(gm.data.id).toBe('pg');
  const all=await run({kind:'query',table:'campaign_players',steps:[]});
  expect(all.data.find((p:any)=>p.id==='old-gm')).toMatchObject({user_id:null,active:false});
  expect(all.data.some((p:any)=>p.id==='old-a')).toBe(true);
 });
 it('saves the private Registro do Mestre only for the Narrator under the approved runtime',async()=>{
  vi.stubEnv('CORMYR_FIREBASE_CLOUD_MAIL_ENABLED','true');
  f.runtimeReady=true;
  const note={id:'letter:mine',letter_id:'mine',reply_id:null,notes:{ordem_recebida:'Ordem',execucao:'',resultado:'',conhecimento:'',pendencia:''},updated_by:'x',updated_at:'y'};
  await expect(run({kind:'query',table:'narrator_mail_notes',steps:[{op:'upsert',args:[note,{onConflict:'id'}]}]})).rejects.toThrow('access_denied');
  f.scope={uid:'gm',profile:'narrador',playerId:'pg',memberHouseIds:[],editHouseIds:[]};
  await run({kind:'query',table:'narrator_mail_notes',steps:[{op:'upsert',args:[note,{onConflict:'id'}]}]});
  expect(f.writes.map((w:any)=>w.op)).toEqual(['set','create']);
  expect(f.writes[0].v).toMatchObject({id:'letter:mine',letterId:'mine',updatedBy:'gm',notes:{ordem_recebida:'Ordem'}});
  await expect(run({kind:'query',table:'narrator_mail_notes',steps:[{op:'upsert',args:[{...note,id:'letter:../x'}]}]})).rejects.toThrow('invalid_mail_note');
  await expect(run({kind:'query',table:'narrator_mail_notes',steps:[{op:'upsert',args:[{...note,notes:{segredo:'x'}}]}]})).rejects.toThrow('invalid_mail_note');
  await expect(run({kind:'query',table:'narrator_mail_notes',steps:[{op:'delete',args:[]}]})).rejects.toThrow('workspace_operation_not_implemented');
  f.cloudNotes=[{id:'n',data:{id:'letter:mine',letterId:'mine',replyId:null,notes:{ordem_recebida:'Nuvem'},updatedBy:'gm',updatedAt:'z'}}];
  f.tables['narrator_mail_notes']=[{id:'letter:mine',notes:{ordem_recebida:'Antigo'}},{id:'letter:secret',notes:{}}];
  const rows=(await run({kind:'query',table:'narrator_mail_notes',steps:[{op:'eq',args:['id','letter:mine']},{op:'maybeSingle',args:[]}]})).data;
  expect(rows.notes).toEqual({ordem_recebida:'Nuvem'});
 });
 it('schedules own Cloud drafts and validates court and unit links against the current sheet',async()=>{
  vi.stubEnv('CORMYR_FIREBASE_CLOUD_MAIL_ENABLED','true');
  f.runtimeReady=true;
  const id='e'.repeat(64);
  f.cloudLetters=[{id,data:{source:'firebase-cloud',sourceSnapshotId:'a'.repeat(64),id,senderUid:'a',senderPlayerId:'pa',
   senderName:'Jogador',originHouseId:'ashkar',recipientKind:'narrator',recipientHouseId:null,recipientPlayerId:null,
   subject:'Rascunho',content:'Texto',createdAt:'2026-11-19T16:00:00Z',deliveredAt:null,
   campaignDate:'1522-01-01',creationRound:2,deliveryRound:null,publicationState:'draft',deletedAt:null,version:1}}];
  f.schedule.mockResolvedValue({state:'scheduled'});
  await run({kind:'rpc',name:'schedule_letter_draft',args:{p_id:id,p_week:3}});
  expect(f.schedule).toHaveBeenCalledWith('valid-token',{letterId:id,expectedVersion:1,deliveryRound:3});
  f.tables['noble_house_sheets']=[{house_id:'ashkar',version:1,state:{court:[{id:'c1',name:'Arauto'}],units:[{id:'u1',name:'Guarda'},{id:'u2',destroyed:true}]}}];
  f.send.mockResolvedValue({id:'x',duplicate:false,state:'delivered',deliveryRound:2});
  const send=(extra:any)=>run({kind:'rpc',name:'dated_mail_action',args:{p_action:'send_linked_mail',p_date:'1522-01-01',p_args:{
   p_key:'link-test-001',p_origin:'ashkar',p_targets:['narrator'],p_subject:'Ordem',p_content:'Texto',
   p_draft:false,p_week:null,p_signed_by:null,p_court:null,p_unit:null,p_role:null,...extra}}});
  await expect(send({p_court:'ghost',p_role:'executor'})).rejects.toThrow('court_member_unavailable');
  await expect(send({p_unit:'u2'})).rejects.toThrow('unit_unavailable');
  await send({p_court:'c1',p_role:'order_recipient',p_unit:'u1'});
  expect(f.send).toHaveBeenCalledWith('valid-token',expect.objectContaining({courtMemberId:'c1',courtAssignment:'order_recipient',unitId:'u1'}));
 });
 it('shows the Firebase HUB opening history to the Narrator only, without UIDs',async()=>{
  f.hubAudit=[{id:'a1',data:{action:'launch_firebase_campaign',at:'2026-11-19T10:00:00Z',actorUid:'gm',calendar:{year:1522,month:9,day:21,festival:null}}},
   {id:'a2',data:{action:'advance_week',at:'2026-11-26T10:00:00Z',actorUid:'gm',from:{year:1522,month:9,day:21,festival:null},
    to:{year:1522,month:10,day:1,festival:null},reason:'Nova désdia'}},
   {id:'a3',data:{action:'save_draft',at:'2026-11-18T10:00:00Z'}}];
  await expect(run({kind:'rpc',name:'get_campaign_time_history',args:{p_limit:15}})).rejects.toThrow('access_denied');
  f.scope={uid:'gm',profile:'narrador',playerId:'pg',memberHouseIds:[],editHouseIds:[]};
  const h=await run({kind:'rpc',name:'get_campaign_time_history',args:{p_limit:15}});
  expect(h.map((x:any)=>x.id)).toEqual(['a2','a1']);
  expect(h[0]).toMatchObject({from:'1522-10-21',to:'1522-11-01',mode:'advance',reason:'Nova désdia'});
  expect(JSON.stringify(h)).not.toContain('gm');
 });
 it('calendar events: Narrator drafts privately, everyone reads published ones and the chronology',async()=>{
  f.runtimeReady=true;
  f.tables['campaign_letters']=[letter('mine','ashkar',{campaign_date:'1522-01-05'}),letter('secret','other',{campaign_date:'1522-01-06'})];
  f.events=[{id:'evt-a',data:{id:'evt-aaaaaaaa',version:2,draft:null,published:{date:'1522-01-10',title:'Feira',description:'Mercado'}}},
   {id:'evt-b',data:{id:'evt-bbbbbbbb',version:1,draft:{date:'1522-01-12',title:'Segredo',description:'',deleted:false},published:null}}];
  const seen=await run({kind:'rpc',name:'get_campaign_schedule_events',args:{p_year:1522,p_month:0}});
  expect(seen).toEqual([{id:'evento-evt-aaaaaaaa',date:'1522-01-10',title:'Feira',kind:'kingdom',description:'Mercado'}]);
  const chron=await run({kind:'rpc',name:'get_campaign_chronology',args:{p_year:1522,p_month:0}});
  expect(chron.events.map((e:any)=>e.id).sort()).toEqual(['evento-evt-aaaaaaaa','mail-mine']);
  await expect(run({kind:'rpc',name:'get_campaign_schedule_drafts',args:{}})).rejects.toThrow('access_denied');
  await expect(run({kind:'rpc',name:'save_campaign_schedule_event',args:{p_payload:{}}})).rejects.toThrow('access_denied');
  f.scope={uid:'gm',profile:'narrador',playerId:'pg',memberHouseIds:[],editHouseIds:[]};
  const drafts=await run({kind:'rpc',name:'get_campaign_schedule_drafts',args:{}});
  expect(drafts).toEqual([{id:'evt-bbbbbbbb',date:'1522-01-12',title:'Segredo',description:'',deleted:false,version:1,published:false}]);
  const saved=await run({kind:'rpc',name:'save_campaign_schedule_event',args:{p_payload:{id:null,version:null,date:'1522-01-20',title:'Torneio',description:'',deleted:false}}});
  expect(saved.version).toBe(1);
  expect(f.writes[0].v).toMatchObject({draft:{date:'1522-01-20',title:'Torneio',deleted:false},published:null});
  await expect(run({kind:'rpc',name:'save_campaign_schedule_event',args:{p_payload:{id:null,version:null,date:'1522-13-01',title:'x',description:'',deleted:false}}})).rejects.toThrow('invalid_event');
 });
 it('reads the operational House sheet (seeded from the import) once activated, and House-scoped consequences',async()=>{
  const {constructionStateHash}=await import('../house/firebase-construction-transaction');
  const live={houseId:'ashkar',month:24301,court:[],units:[]};
  f.tables['noble_house_sheets']=[{house_id:'ashkar',version:1,state:{houseId:'ashkar',month:24300,court:[],units:[]}}];
  f.tables['noble_house_ledger']=[];f.tables['noble_house_rule_overrides']=[];
  f.economies=[{id:'e',data:{houseId:'ashkar',status:'active',seedVerified:true,sourceSnapshotId:'a'.repeat(64),
   version:7,state:live,stateHash:constructionStateHash(live)}},
   {id:'bad',data:{houseId:'other',status:'active',seedVerified:true,sourceSnapshotId:'a'.repeat(64),version:2,state:{x:1},stateHash:'tampered'}}];
  const rows=(await run({kind:'query',table:'noble_house_sheets',steps:[{op:'select',args:['version']},{op:'eq',args:['house_id','ashkar']},{op:'single',args:[]}]})).data;
  expect(rows.version).toBe(7);
  const house=await run({kind:'house',houseId:'ashkar'});
  expect(house.version).toBe(7);expect(house.state.month).toBe(24301);
  f.tables['campaign_letter_consequences']=[{id:'c1',letter_id:'mine',house_id:'ashkar',changes:{wealth:-1},active:true,created_at:'x',explanation:'PRIVADO'},
   {id:'c2',letter_id:'secret',house_id:'other',changes:{wealth:-1},active:true,created_at:'x'}];
  const cons=(await run({kind:'query',table:'campaign_letter_consequences',steps:[]})).data;
  expect(cons.map((c:any)=>c.id)).toEqual(['c1']);
  expect(JSON.stringify(cons)).not.toContain('PRIVADO');
 });
 it('galeria e idades ainda não migradas respondem vazio só para a própria Casa',async()=>{
  expect(await run({kind:'rpc',name:'house_gallery_mail_images',args:{p_house:'ashkar'}})).toEqual([]);
  expect(await run({kind:'rpc',name:'get_house_character_ages',args:{p_house:'ashkar'}})).toEqual([]);
  await expect(run({kind:'rpc',name:'house_gallery_mail_images',args:{p_house:'other'}})).rejects.toThrow('access_denied');
 });
});
