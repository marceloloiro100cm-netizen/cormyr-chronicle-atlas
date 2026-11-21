import {afterEach,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {
 DEFAULT_PRIVATE_HOUSE,privateHouseAsModel,privateHouseSchema,
 privateHouseStorageKey,loadPrivateHouse,savePrivateHouse,deletePrivateHouse,
 LEONARDO_PRIVATE_HOUSE_ID,
} from '@/lib/battle/leonardo-private-house';
import {createV3Game} from '@/lib/battle/v3/engine';

const source=(file:string)=>readFileSync(file,'utf8');
const userA='00000000-0000-4000-8000-000000000001';
const userB='00000000-0000-4000-8000-000000000002';
const house={...DEFAULT_PRIVATE_HOUSE,name:'Casa da Sombra',region:'Costa do Dragão',
 motto:'Vigilamos',description:'Hoste fictícia de treinamento'};
const cache=new Map<string,string>();
const storage={
 getItem:(key:string)=>cache.get(key)??null,
 setItem:(key:string,value:string)=>{cache.set(key,value);},
 removeItem:(key:string)=>{cache.delete(key);},
};
afterEach(()=>cache.clear());

describe('Leonardo: Casa criada para simulação',()=>{
 it('salva somente no navegador e isola os nomes de chaves por usuário',()=>{
  savePrivateHouse(storage,userA,house);
  expect(loadPrivateHouse(storage,userA)?.name).toBe(house.name);
  expect(loadPrivateHouse(storage,userB)).toBeNull();
  expect(privateHouseStorageKey(userA)).not.toBe(privateHouseStorageKey(userB));
  deletePrivateHouse(storage,userA);
  expect(loadPrivateHouse(storage,userA)).toBeNull();
 });
 it('bloqueia identidade oficial e dados de tropas inválidos',()=>{
  expect(privateHouseSchema.safeParse({...house,units:[
   {...house.units[0],count:10000},...house.units.slice(1),
  ]}).success).toBe(false);
  expect(loadPrivateHouse({getItem:()=>'{invalid'},userA)).toBeNull();
  expect(privateHouseAsModel(house).id).toBe(LEONARDO_PRIVATE_HOUSE_ID);
  expect(privateHouseAsModel(house).name).toContain('Simulação');
 });
 it('usa unidades fictícias da casa personalizada no combate Adaptado',()=>{
  const custom=privateHouseAsModel(house);
  const game=createV3Game({
   attackerHouseId:custom.id,defenderHouseId:'ashkar-model',
   attackerCommander:'purple-dragon',defenderCommander:'ashkar-raider',
   scenario:'plain-open',opponent:'ai',grid:'square',
  },[],[custom]);
  const attackers=game.battle.stacks.filter(x=>x.side==='attacker');
  expect(attackers).toHaveLength(4);
  expect(attackers[0]?.name).toBe(house.units[0].name);
  expect(attackers.every(x=>x.source.kind==='fictional')).toBe(true);
 });
});

describe('Editor-Chefe: lê Missivas entregues, sem escrever; nenhuma Ficha ou Casa',()=>{
 it('a interface de Leonardo é o Jornal mais a leitura de Missivas (19/11/2026)',()=>{
  const reader=source('src/components/players/editor-mail-reader.tsx');
  expect(source('src/components/players/players-workspace.tsx')).toContain('<EditorMailReader userId={expectedUserId}/>');
  for(const write of ['dated_mail_action','reply_weekly_message','send_linked_mail','delete_campaign_letter',
   'restore_campaign_letter','edit_campaign_letter','MailComposer','ReplyForm'])
   expect(reader).not.toContain(write);
  expect(reader).toContain("'mail_page'");
  // The broad House selector uses SQL/Firebase "house" (sender OR recipient).
  // A separate origin selector keeps exact-sender investigations available.
  expect(reader).toContain("sel('Casa envolvida','house'");
  expect(reader).toContain("sel('Casa remetente (opcional)','origin'");
  expect(reader).toContain('house:filters.house');
  expect(reader).toContain('origin:filters.origin');
  expect(reader).toContain('filters.house,filters.origin,search');

  const route=source('src/components/players/players-workspace.tsx');
  const editor=source('src/components/newspaper/NewspaperEditorialDesk.tsx');
  expect(route).toContain('<EditorialWorkspace key={approved}');
  expect(route).not.toContain('specialMailReadOnly');
  expect(route).not.toContain('<BattleLeonardoSandbox');
  expect(editor).not.toContain('onOtherModules');
  expect(editor).not.toContain('Outros módulos de Cormyr');
 });
 it('o banco nega leitura e escrita das cartas, respostas e fichas',()=>{
  const sql=source('drizzle/migrations/0116_campaign_three_access_profiles.sql');
  expect(sql).toContain('CREATE POLICY editor_no_letters');
  expect(sql).toContain('CREATE POLICY editor_no_replies');
  expect(sql).toContain('CREATE POLICY editor_no_letter_receipts');
  expect(sql).toContain('CREATE POLICY editor_no_house_records');
  expect(sql).toContain('BEFORE INSERT OR UPDATE OR DELETE');
  expect(sql).toContain("USING ERRCODE='42501'");
 });
});
