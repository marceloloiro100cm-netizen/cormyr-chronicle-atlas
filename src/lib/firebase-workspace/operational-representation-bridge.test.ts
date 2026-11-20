import {describe,it,expect,vi,beforeEach} from 'vitest';
const f=vi.hoisted(()=>({
 start:vi.fn(),stop:vi.fn(),identity:vi.fn(),
 save:vi.fn(),send:vi.fn(),reply:vi.fn(),cancel:vi.fn(),
}));
vi.mock('./operational-representation',()=>({
 RepresentationError:class extends Error{constructor(public code:string,public status=403){super(code);}},
 createRepresentationService:()=>({start:f.start,stop:f.stop,identity:f.identity}),
}));
vi.mock('./operational-record-write',()=>({
 RecordWriteError:class extends Error{constructor(public code:string,public status=403){super(code);}},
 commitOperationalRecord:(...args:unknown[])=>f.save(...args),
}));
import {createRepresentationBridge} from './operational-representation-bridge';
const actor={uid:'gm',profile:'narrador' as const,
 playerId:null,memberHouseIds:[],editHouseIds:[]};
const identity={playerId:'p1',representedUid:'u1',actorUid:'gm',
 sessionId:'s1',expiresAt:new Date(Date.now()+100000).toISOString(),
 scope:{uid:'u1',profile:'jogador' as const,playerId:'p1',
 memberHouseIds:['h1'],editHouseIds:['h1']}};
const members=[{id:'p1',user_id:'u1',name:'Casa Autorizada',
 roster_house_id:'h1',active:true,require_password_change:false},
 {id:'p2',user_id:'u2',name:'Casa Adversária',roster_house_id:'h2',
 active:true,require_password_change:false}];
const houses=[{id:'h1',name:'Casa Própria',active:true},
 {id:'h2',name:'Casa Adversária',active:true}];
const records=[
 {id:'own',title:'Próprio',content:'autorizado',visibility:'player',player_id:'p1',house_id:'h1',version:1},
 {id:'house',title:'Casa',content:'autorizado',visibility:'house',player_id:null,house_id:'h1',version:1},
 {id:'rival',title:'Segredo',content:'INFORMAÇÃO PRIVADA',visibility:'house',player_id:null,house_id:'h2',version:1},
 {id:'gm',title:'Narrador',content:'SEGREDO GM',visibility:'gm',player_id:null,house_id:'h1',version:1},
];
const letter=(id:string,to:string)=>({
 id,sender_user_id:'gm',sender_player_id:null,
 sender_name:'Narrador',recipient_player_id:null,recipient_house_id:to,
 origin_house_id:null,subject:'Carta '+id,content:'CONTEÚDO '+id,
 created_at:'2026-11-19T00:00:00Z',delivered_at:'2026-11-19T00:00:00Z',
 deleted_at:null,publication_state:'delivered',delivery_week:3,
 creation_week:3,letter_number:1,letter_kind:'reserved',court_member_id:null,
 court_assignment:null,military_unit_id:null,batch_key:null,
});
const mailData={letters:[letter('mine','h1'),letter('foreign','h2')],
 replies:[],receipts:[],players:members,adminUserIds:new Set(['gm']),
 memberships:[{player_id:'p1',house_id:'h1'},{player_id:'p2',house_id:'h2'}],
 houses:houses.map(h=>({id:h.id,name:h.name})),rounds:[{number:3,status:'open'}],
};
function bridge(a:any=actor,override:any={}){
 return createRepresentationBridge({
  db:{},auth:{},snapshotId:'a'.repeat(64),actor:a,token:'narrator-firebase-token',
  players:async()=>members,houses:async()=>houses,
  records:async()=>records,importedRecords:async()=>records,
  mail:async()=>mailData as any,
  calendar:async()=>({year:1522,month:0,day:1,festival:null}),
  cloudMail:()=>({sendRepresented:f.send,replyRepresented:f.reply,
   cancelRepresented:f.cancel}),
  ...override,
 });
}
beforeEach(()=>{
 for(const m of Object.values(f))m.mockReset();
 f.identity.mockResolvedValue(identity);
 f.start.mockResolvedValue({playerId:'p1',expiresAt:identity.expiresAt});
 f.stop.mockResolvedValue({stopped:true});
 f.save.mockResolvedValue({id:'own',version:2});
 f.send.mockResolvedValue({id:'letter-new'});
 f.reply.mockResolvedValue({id:'reply-new'});
 f.cancel.mockResolvedValue({removed:true});
});
describe('item 8, ponte de representação',()=>{
 it('não mostra registros ou missivas de outras Casas nem do Narrador',async()=>{
  const result=await bridge().action('read',{}) as unknown as {
   records:{id:string}[];houses:{id:string}[];letters:{id:string}[];
  };
  expect(result.records.map((r:any)=>r.id)).toEqual(['own','house']);
  expect(result.houses.map((r:any)=>r.id)).toEqual(['h1']);
  expect(result.letters.map((r:any)=>r.id)).toEqual(['mine']);
  expect(JSON.stringify(result)).not.toContain('INFORMAÇÃO PRIVADA');
  expect(JSON.stringify(result)).not.toContain('SEGREDO GM');
  expect(f.identity).toHaveBeenCalledTimes(2);
 });
 it('preserva identidade real em salvamento e identidade representada no registro',async()=>{
  const result=await bridge().action('save_record',{
   id:'own',version:1,title:'Novo',content:'Texto',
  });
  expect(result).toEqual({id:'own',version:2});
  expect(f.save).toHaveBeenCalledWith(expect.objectContaining({
   actor:identity.scope,representation:{
    actorUid:'gm',representedUid:'u1',playerId:'p1',sessionId:'s1',
   },
  }));
 });
 it('autoriza missiva delegada sem token do jogador e rejeita destino inexistente pelo backend',async()=>{
  const result=await bridge().action('send',{
   subject:'Tema',content:'Conteúdo',house:'h2',key:'req-key-1234',
  },'1522-01-01');
  expect(result).toEqual({id:'letter-new'});
  expect(f.send).toHaveBeenCalledWith('narrator-firebase-token',
   expect.objectContaining({originHouseId:'h1',recipientHouseId:'h2',
    recipientKind:'house',expectedCampaignDate:'1522-01-01'}));
  await expect(bridge().action('send',{subject:'Tema',content:'Texto',
   house:'h2',key:'req-key-1234'},'1522-01-02'))
   .rejects.toMatchObject({code:'campaign_date_changed'});
 });
 it('proíbe Narrador sem perfil e origem ambígua',async()=>{
  await expect(bridge({...actor,profile:'jogador'}).start({p_player:'p1'}))
   .rejects.toMatchObject({code:'access_denied'});
  f.identity.mockResolvedValue({...identity,scope:{...identity.scope,
   editHouseIds:['h1','h2']}});
  await expect(bridge().action('draft',{subject:'Teste',content:'Texto',
   house:'h2',key:'req-key-1234'},'1522-01-01'))
   .rejects.toMatchObject({code:'representation_origin_not_authorized'});
  expect(f.send).not.toHaveBeenCalled();
  await bridge().action('send',{subject:'Teste',content:'Texto',
   origin:'h2',house:'h1',key:'req-key-5678'},'1522-01-01');
  expect(f.send).toHaveBeenCalledWith('narrator-firebase-token',
   expect.objectContaining({originHouseId:'h2',recipientHouseId:'h1'}));
 });
});
