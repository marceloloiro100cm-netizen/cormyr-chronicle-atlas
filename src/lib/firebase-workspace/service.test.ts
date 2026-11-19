import {beforeEach,describe,it,expect,vi} from 'vitest';
const f=vi.hoisted(()=>({scope:{uid:'a',profile:'jogador',playerId:'pa',memberHouseIds:['ashkar'],editHouseIds:['ashkar']} as any,tables:{} as Record<string,any[]>,after:null as any,calls:0}));
vi.mock('../../../scripts/firebase/workspace-import.mjs',()=>({workspaceTables:new Set(),readWorkspaceTable:async(_d:any,_s:any,n:string)=>{
 if(!(n in f.tables))throw Error('workspace_source_table_missing');return f.tables[n];
}}));
vi.mock('../../../scripts/firebase/cloud-readonly-service.mjs',()=>({CloudAccessError:class extends Error{constructor(public code:string,public status=403){super(code);}},createFirebaseCloudReadonly:()=>({
 workspaceScope:async()=>{f.calls++;return f.after&&f.calls>1?f.after:f.scope;},getCalendar:async()=>({year:1522,month:0,day:1,version:1}),
 getHouse:async(_t:string,h:string)=>({state:{houseId:h,units:[]},version:7}),
})}));
import {createWorkspaceService} from './service';
const access=[{userId:'a',playerId:'pa',profile:'jogador',admin:false,active:true,requirePasswordChange:false,memberHouseIds:['ashkar'],editHouseIds:['ashkar']},
 {userId:'gm',playerId:'pg',profile:'narrador',admin:true,active:true,requirePasswordChange:false,memberHouseIds:[],editHouseIds:[]}];
const db:any={collection:(name:string)=>({doc:()=>({get:async()=>({exists:false,data:()=>undefined}),collection:(sub:string)=>({
 get:async()=>({docs:sub==='access'?access.map(v=>({data:()=>v})):[]}),where:()=>({get:async()=>({docs:[]})}),
})})})};
const run=(input:any)=>createWorkspaceService({db,auth:{},snapshotId:'a'.repeat(64)}).execute('valid-token',input);
const letter=(id:string,house:string,extra:any={})=>({id,sender_user_id:'gm',sender_player_id:'pg',sender_name:'Narrador',recipient_house_id:house,recipient_player_id:null,origin_house_id:null,subject:id,content:'real source '+id,created_at:'2026-11-01T00:00:00Z',delivered_at:'2026-11-01T00:00:00Z',deleted_at:null,publication_state:'delivered',delivery_week:2,creation_week:2,letter_number:2,letter_kind:'reservada',court_member_id:null,court_assignment:null,military_unit_id:null,batch_key:null,...extra});
beforeEach(()=>{
 f.calls=0;f.after=null;f.scope={uid:'a',profile:'jogador',playerId:'pa',memberHouseIds:['ashkar'],editHouseIds:['ashkar']};
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
 it('unknown operations never fall back to Supabase or synthetic success',async()=>{
  await expect(run({kind:'rpc',name:'arbitrary_write',args:{}})).rejects.toThrow('workspace_operation_not_implemented');
 });
});
