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

describe('Leonardo: nenhuma missiva de saída',()=>{
 it('bloqueia todos os botões de criação e respostas na interface',()=>{
  const route=source('src/routes/_authenticated/jogadores.tsx');
  const view=source('src/components/players/missivas-tab.tsx');
  expect(route).toContain('readOnly={specialBattleAccess}');
  expect(view).toContain('readOnly=false');
  expect(view).toContain('!readOnly&&!trashMode&&!data.admin&&<MailComposer');
  expect(view).toContain('!readOnly&&!trashMode&&!letter.deleted_at&&letter.publication_state');
  expect(view).toContain('!readOnly&&!trashMode&&!letter.deleted_at&&answer.author_user_id');
  expect(view).toContain('Modo consulta: Leonardo');
 });
 it('o banco impede novas missivas e respostas mesmo via RPC',()=>{
  const sql=source('drizzle/migrations/0115_leonardo_missives_readonly.sql');
  expect(sql).toContain("p.roster_house_id='espiao'");
  expect(sql).toContain("m.house_id='espiao'");
  expect(sql).toContain('auth.uid()');
  expect(sql).toContain('BEFORE INSERT OR UPDATE');
  expect(sql).toContain('ON public.campaign_letters');
  expect(sql).toContain('ON public.letter_replies');
  expect(sql).toContain("USING ERRCODE='42501'");
  expect(sql).not.toMatch(/DELETE FROM public\.campaign_letters/);
 });
});
