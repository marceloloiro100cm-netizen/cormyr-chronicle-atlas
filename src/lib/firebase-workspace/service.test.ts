import {beforeEach,describe,it,expect,vi} from 'vitest';
const f=vi.hoisted(()=>({scope:{uid:'a',profile:'jogador',playerId:'pa',memberHouseIds:['ashkar'],editHouseIds:['ashkar']} as any,tables:{} as Record<string,any[]>,after:null as any,calls:0,
 runtimeReady:false,liveRound:2,cloudReceipts:[] as any[],cloudLetters:[] as any[],ack:vi.fn(),send:vi.fn(),batch:vi.fn(),reply:vi.fn()}));
vi.mock('../../../scripts/firebase/workspace-import.mjs',()=>({workspaceTables:new Set(),readWorkspaceTable:async(_d:any,_s:any,n:string)=>{
 if(!(n in f.tables))throw Error('workspace_source_table_missing');return f.tables[n];
}}));
vi.mock('../../../scripts/firebase/cloud-readonly-service.mjs',()=>({CloudAccessError:class extends Error{constructor(public code:string,public status=403){super(code);}},createFirebaseCloudReadonly:()=>({
 workspaceScope:async()=>{f.calls++;return f.after&&f.calls>1?f.after:f.scope;},workspaceCalendar:async()=>({year:1522,month:0,day:1,festival:null,version:1}),getCalendar:async()=>({year:1522,month:0,day:1,version:1}),
 getHouse:async(_t:string,h:string)=>({state:{houseId:h,units:[]},version:7}),
})}));
vi.mock('../../../scripts/firebase/cloud-mail-service.mjs',()=>({
 CloudMailError:class extends Error{constructor(public code:string,public status=403){super(code);}},
 createFirebaseCloudMail:()=>({markRead:f.ack,send:f.send,sendBatch:f.batch,reply:f.reply}),
}));
import {createWorkspaceService} from './service';
const access=[{userId:'a',playerId:'pa',profile:'jogador',admin:false,active:true,requirePasswordChange:false,memberHouseIds:['ashkar'],editHouseIds:['ashkar']},
 {userId:'gm',playerId:'pg',profile:'narrador',admin:true,active:true,requirePasswordChange:false,memberHouseIds:[],editHouseIds:[]}];
const db:any={collection:(name:string)=>({doc:()=>({
 get:async()=>({
  exists:f.runtimeReady&&['campaignCloudRuntime','campaignMailRuntime','migrationTimeEngineStage'].includes(name),
  data:()=>name==='campaignCloudRuntime'?{status:'active',private:true,sourceSnapshotId:'a'.repeat(64),sourceSnapshotReconciled:true,applicationEnabled:true,
   mailWriteApproved:true,openRound:f.liveRound,calendarVersion:1}
   :name==='campaignMailRuntime'?{status:'active',private:true,sourceSnapshotId:'a'.repeat(64),sourceLiveReconciled:true,applicationEnabled:true,mailEnabled:true,openRound:f.liveRound,calendarVersion:1}:undefined,
 }),
 collection:(sub:string)=>({
  get:async()=>({docs:sub==='access'?access.map(v=>({data:()=>v})):[]}),
  doc:()=>({get:async()=>({exists:f.runtimeReady,data:()=>({year:1522,month:0,day:1,version:1})})}),
  limit:()=>({get:async()=>({docs:(sub==='letters'?f.cloudLetters:f.cloudReceipts).map(v=>({id:v.id,data:()=>v.data}))})}),
  where:()=>({get:async()=>({docs:[]})}),
 })
})})};
const run=(input:any)=>createWorkspaceService({db,auth:{},snapshotId:'a'.repeat(64)}).execute('valid-token',input);
const letter=(id:string,house:string,extra:any={})=>({id,sender_user_id:'gm',sender_player_id:'pg',sender_name:'Narrador',recipient_house_id:house,recipient_player_id:null,origin_house_id:null,subject:id,content:'real source '+id,created_at:'2026-11-01T00:00:00Z',delivered_at:'2026-11-01T00:00:00Z',deleted_at:null,publication_state:'delivered',delivery_week:2,creation_week:2,letter_number:2,letter_kind:'reservada',court_member_id:null,court_assignment:null,military_unit_id:null,batch_key:null,...extra});
beforeEach(()=>{
 f.calls=0;f.after=null;f.runtimeReady=false;f.liveRound=2;f.cloudReceipts=[];f.cloudLetters=[];f.ack.mockReset();f.send.mockReset();f.batch.mockReset();f.reply.mockReset();vi.unstubAllEnvs();
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
 it('player sees published real newspapers only, editor sees drafts but no missives',async()=>{
  expect((await run({kind:'query',table:'campaign_newspapers',steps:[]})).data.map((x:any)=>x.id)).toEqual(['edition-real']);
  f.scope={...f.scope,uid:'editor',profile:'editor',playerId:null,memberHouseIds:[],editHouseIds:[]};
  expect((await run({kind:'query',table:'campaign_newspapers',steps:[]})).data).toHaveLength(2);
  expect((await run({kind:'query',table:'campaign_letters',steps:[]})).data).toEqual([]);
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
  f.scope={...f.scope,uid:'editor',profile:'editor',playerId:null,memberHouseIds:[],editHouseIds:[]};
  expect((await run({kind:'query',table:'campaign_letters',steps:[]})).data).toEqual([]);
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
  }})).rejects.toThrow('mail_feature_not_yet_available');
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
   args:{p_recipient:'gm'}})).toEqual(2);
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
  f.scope={...f.scope,uid:'editor',profile:'editor',playerId:null,memberHouseIds:[],editHouseIds:[]};
  await expect(run({kind:'rpc',name:'mark_letter_read',args:{p_id:'mine'}})).rejects.toThrow('access_denied');
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
});
