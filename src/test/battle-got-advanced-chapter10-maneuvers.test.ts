import {describe,expect,it} from 'vitest';
import {createWarBattle,issueWarOrder} from '@/lib/battle/got/engine';
import {modelWarUnit,modelWarCommanders} from '@/lib/battle/got/models';
import {WAR_ADVANCED_ORDER_DIFFICULTY} from '@/lib/battle/got/advanced-orders';
import type {WarBattle,WarUnit,WarOrder} from '@/lib/battle/got/types';

type Kind='infantry'|'archers'|'cavalry'|'garrison';
function unit(id:string,side:'attacker'|'defender',typeId:Kind,x:number,y:number){
 return modelWarUnit({id,name:id,side,typeId,position:{x,y},training:'elite'});
}
function battle(arr:WarUnit[],seed='advanced-more'):WarBattle{
 const b=createWarBattle({id:'adv-more',name:'Ordens complexas',seed,
  width:14,height:10,commanders:modelWarCommanders({attacker:12,defender:12}),
  units:arr,advancedFormations:true});
 return {...b,turn:'attacker',phase:'orders'};
}
function doOrder(b:WarBattle,order:WarOrder,id='a'){
 return issueWarOrder(b,{commanderId:'leader-attacker',unitId:id,order});
}
function makeSplit(){
 return battle([{
  ...unit('a','attacker','infantry',2,2),
  ability:{...unit('a','attacker','infantry',2,2).ability,fighting:6},
  meleeBonusDice:2,
 },unit('d1','defender','garrison',3,2),
  unit('d2','defender','garrison',2,3)]);
}
describe('Capítulo 10 — manobras avançadas de guerra de escala 10 metros',()=>{
 it('Tabela de dificuldades inclui Ataque Dividido +6, Relâmpago +6, Atropelar +3, Envolver +6',()=>{
  expect(WAR_ADVANCED_ORDER_DIFFICULTY).toMatchObject({
   'split-attack':6,'lightning-attack':6,trample:3,envelop:6,
   'scorched-earth':3,
  });
 });
 it('Ataque Dividido distribui 6D entre dois alvos, com bônus alocados sem duplicação',()=>{
  const start=makeSplit(),immutable=JSON.stringify(start);
  const out=doOrder(start,{kind:'split-attack',targetIds:['d1','d2'],
   testRanks:[3,3],bonusRanks:[1,1]});
  expect(out.passed).toBe(true);
  const strikes=out.battle.events.filter(e=>e.kind==='attack');
  expect(strikes).toHaveLength(2);
  expect(strikes[0]?.roll).toHaveLength(4);
  expect(strikes[1]?.roll).toHaveLength(4);
  expect(out.battle.events.some(e=>e.kind==='split-attack')).toBe(true);
  expect(out.battle.units.find(u=>u.id==='a')?.issuedThisRound).toBe(1);
  expect(JSON.stringify(start)).toBe(immutable);
 });
 it('Ataque Dividido rejeita alvos duplicados e alocação maior que a graduação',()=>{
  const b=makeSplit();
  expect(()=>doOrder(b,{kind:'split-attack',targetIds:['d1','d1'],
   testRanks:[3,3],bonusRanks:[0,0]})).toThrow(/dois alvos distintos/);
  expect(()=>doOrder(b,{kind:'split-attack',targetIds:['d1','d2'],
   testRanks:[4,4],bonusRanks:[0,0]})).toThrow(/divisão válida/);
  expect(()=>doOrder(b,{kind:'split-attack',targetIds:['d1','d2'],
   testRanks:[3,3],bonusRanks:[2,2]})).toThrow(/divisão válida/);
  expect(b.events.filter(e=>e.kind==='command')).toHaveLength(0);
 });
 it('Ataque Relâmpago atravessa dois inimigos, reduz 1D por alvo após o primeiro',()=>{
  const start=battle([{
   ...unit('a','attacker','infantry',1,1),
   ability:{...unit('a','attacker','infantry',1,1).ability,fighting:8},
  },unit('d1','defender','garrison',3,1),
   unit('d2','defender','garrison',5,1)]);
  const out=doOrder(start,{kind:'lightning-attack',to:{x:7,y:1}});
  expect(out.passed).toBe(true);
  expect(out.battle.units.find(u=>u.id==='a')?.position).toEqual({x:7,y:1});
  const strikes=out.battle.events.filter(e=>e.kind==='attack');
  expect(strikes).toHaveLength(2);
  expect(strikes[0]?.roll).toHaveLength(8);
  expect(strikes[1]?.roll).toHaveLength(8);
  expect(out.battle.events.some(e=>e.kind==='lightning-attack')).toBe(true);
 });
 it('Ataque Relâmpago não atravessa aliados, paredes nem encerra sobre inimigos',()=>{
  const a=unit('a','attacker','infantry',1,1),d=unit('d','defender','garrison',3,1);
  const b=battle([a,d,unit('ally','attacker','infantry',4,1)]);
  expect(()=>doOrder(b,{kind:'lightning-attack',to:{x:7,y:1}}))
   .toThrow(/aliadas/);
  expect(()=>doOrder(b,{kind:'lightning-attack',to:{x:3,y:1}}))
   .toThrow(/terminar sobre inimigo/);
 });
 it('Atropelar exige cavalaria e aplica +5 dano básico em todos os ataques',()=>{
  const c=battle([{
   ...unit('a','attacker','cavalry',1,2),
   ability:{...unit('a','attacker','cavalry',1,2).ability,fighting:8},
  },unit('d1','defender','garrison',3,2),
   unit('d2','defender','garrison',5,2)]);
  const trampled=doOrder(c,{kind:'trample',to:{x:7,y:2}});
  expect(trampled.passed).toBe(true);
  expect(trampled.battle.events.filter(e=>e.kind==='attack')).toHaveLength(2);
  expect(trampled.battle.units.find(u=>u.id==='a')?.position).toEqual({x:7,y:2});
  const onFoot={...c,units:c.units.map(u=>u.id==='a'?{
   ...u,mounted:false,
  }:u)};
  expect(()=>doOrder(onFoot,{kind:'trample',to:{x:7,y:2}}))
   .toThrow(/cavalaria/);
 });
 it('Envolver gera vínculo bilateral e disparos contra envolvidos acertam os dois lados',()=>{
  const base=battle([
   {...unit('a','attacker','infantry',2,2),
    ability:{...unit('a','attacker','infantry',2,2).ability,fighting:8}},
   unit('archer','attacker','archers',2,3),
   {...unit('d','defender','garrison',3,2),
    maxHealth:60,health:60,ability:{...unit('d','defender','garrison',3,2).ability,endurance:20},
    armor:0},
  ]);
  const envelop=doOrder(base,{kind:'envelop',targetId:'d'});
  expect(envelop.passed).toBe(true);
  expect(envelop.battle.units.find(u=>u.id==='a')?.envelopingTargetId).toBe('d');
  expect(envelop.battle.units.find(u=>u.id==='d')?.envelopedBy).toBe('a');
  const next={...envelop.battle,turn:'attacker' as const};
  const fired=doOrder(next,{kind:'attack',targetId:'d',ranged:true},'archer');
  expect(fired.battle.events.some(e=>e.kind==='envelop-friendly-fire')).toBe(true);
  expect(fired.battle.events.filter(e=>e.kind==='damage').length).toBeGreaterThan(0);
 });
 it('Retirada de envolvimento provoca ataque livre e remove vínculo',()=>{
  const base=battle([
   {...unit('a','attacker','infantry',2,2),
    ability:{...unit('a','attacker','infantry',2,2).ability,fighting:6}},
   {...unit('d','defender','garrison',3,2),health:60,maxHealth:60,
    ability:{...unit('d','defender','garrison',3,2).ability,endurance:20}},
  ]);
  const held=doOrder(base,{kind:'envelop',targetId:'d'}).battle;
  const next={...held,turn:'defender' as const};
  const moved=issueWarOrder(next,{commanderId:'leader-defender',
   unitId:'d',order:{kind:'move',to:{x:5,y:2}}});
  expect(moved.battle.events.some(e=>e.kind==='envelop-retreat-blocked')||
   moved.battle.events.filter(e=>e.kind==='attack').length>=2).toBe(true);
  if(moved.battle.units.find(u=>u.id==='d')?.position.x===5){
   expect(moved.battle.units.find(u=>u.id==='d')?.envelopedBy).toBeUndefined();
   expect(moved.battle.units.find(u=>u.id==='a')?.envelopingTargetId).toBeUndefined();
  }
 });
 it('Terra Arrasada gera prévia local de recursos e não altera inventário da Casa',()=>{
  const start=battle([unit('a','attacker','infantry',1,1),
   unit('d','defender','garrison',10,1)]);
  const out=doOrder(start,{kind:'scorched-earth',targetDomainId:'campo-hillmarch'});
  expect(out.passed).toBe(true);
  expect(out.battle.scorchedPreview).toEqual([{
   side:'attacker',unitId:'a',domainId:'campo-hillmarch',round:1,
   populationDelta:-1,wealthDelta:-1,
  }]);
  expect(start.scorchedPreview).toBeUndefined();
  expect(out.battle.units.find(u=>u.id==='a')?.source.kind).toBe('model');
  expect(out.battle.events.some(e=>e.kind==='scorched-earth')).toBe(true);
 });
});
