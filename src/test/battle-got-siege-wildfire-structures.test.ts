import {describe,expect,it} from 'vitest';
import {createWarBattle,fireWarSiegeVolley,skipWarSiege,advanceWarRound} from '@/lib/battle/got/engine';
import {makeModelSiege,warSiegeDamage} from '@/lib/battle/got/siege';
import {makeWarFortification,fortDefense,fortForUnit} from '@/lib/battle/got/fortifications';
import {igniteWarUnit,advanceWarFire} from '@/lib/battle/got/siege-fire';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import type {WarBattle,WarUnit} from '@/lib/battle/got/types';

function battle(ammo:'stone'|'oil'|'wildfire'='wildfire'){
 const engineer=modelWarUnit({id:'eng',name:'Engenheiros',side:'attacker',
  typeId:'engineers',position:{x:2,y:3}});
 const defender=modelWarUnit({id:'guard',name:'Guarnição',side:'defender',
  typeId:'garrison',position:{x:4,y:3}});
 const fort=makeWarFortification({
  id:'wall',name:'Muralha',side:'defender',kind:'tower',
  cells:[{x:4,y:3}],engineerBuilt:false,hoursBuilt:8,
  structuralHealth:5,structuralArmor:0,
 });
 const siege=makeModelSiege({id:'cat',kind:'catapult-large',side:'attacker',
  position:{x:2,y:3},engineerId:'eng',ammo});
 return {...createWarBattle({id:'siege-ch10',name:'Cerco do livro',
  seed:'siege-ch10-fire',width:12,height:7,
  commanders:modelWarCommanders({attacker:12,defender:7}),
  units:[{...engineer,ability:{...engineer.ability,warfare:12}},
   {...defender,ability:{...defender.ability,endurance:20},
    health:60,maxHealth:60,defense:0,armor:0}],
  siege:[siege],fortifications:[fort]}),turn:'attacker' as const};
}
const guard=(b:WarBattle)=>b.units.find(u=>u.id==='guard')!;
const wall=(b:WarBattle)=>b.fortifications.find(f=>f.id==='wall')!;

describe('Capítulo 10 — munições, fogo persistente e fortificações destrutíveis',()=>{
 it('catapultas aceitam pedra, óleo e fogo selvagem, com valores corretos',()=>{
  const a=battle('stone'),b=battle('oil'),c=battle('wildfire');
  expect(warSiegeDamage(a.siege[0]!)).toEqual({base:7,ignoresArmor:false});
  expect(warSiegeDamage(b.siege[0]!)).toEqual({base:7,ignoresArmor:true});
  expect(warSiegeDamage(c.siege[0]!)).toEqual({base:7,ignoresArmor:true});
  expect(()=>makeModelSiege({id:'bad',kind:'scorpion',side:'attacker',
   position:{x:1,y:1},engineerId:'eng',ammo:'wildfire'})).toThrow(/Munição especial/);
  expect(makeModelSiege({id:'pot',kind:'fire-pot',side:'attacker',
   position:{x:1,y:1},engineerId:'eng'}).ammo).toBe('oil');
 });
 it('fogo selvagem ignora VA, aplica 7 por grau e persiste por 2d6 rodadas',()=>{
  const b=battle('wildfire');
  const out=fireWarSiegeVolley(b,{commanderId:'leader-attacker',
   weaponIds:['cat'],targetId:'guard'});
  const shot=out.events.find(e=>e.kind==='siege')!;
  expect(shot.degrees).toBeGreaterThan(0);
  expect(guard(out).health).toBe(60-7*shot.degrees!);
  expect(guard(out).burning?.damagePerRound).toBe(7);
  expect(guard(out).burning?.remainingRounds).toBeGreaterThanOrEqual(2);
  expect(guard(out).burning?.remainingRounds).toBeLessThanOrEqual(12);
  const remaining=guard(out).burning!.remainingRounds;
  const orders=skipWarSiege(out);
  const next=advanceWarRound(orders);
  expect(guard(next).health).toBe(guard(out).health-7);
  expect(guard(next).burning?.remainingRounds).toBe(remaining-1);
  expect(next.events.some(e=>e.kind==='wildfire-tick')).toBe(true);
 });
 it('óleo da catapulta ignora VA mas não inicia fogo selvagem contínuo',()=>{
  const b=battle('oil');
  const shot=fireWarSiegeVolley(b,{commanderId:'leader-attacker',
   weaponIds:['cat'],targetId:'guard'});
  expect(guard(shot).burning).toBeUndefined();
  expect(guard(shot).health).toBeLessThan(60);
 });
 it('acerto estrutural abre brecha e retira bônus de Defesa sem apagar unidade',()=>{
  const b=battle('stone');
  expect(fortForUnit(b.fortifications,guard(b))).not.toBeNull();
  expect(fortDefense(wall(b))).toBe(3);
  const shot=fireWarSiegeVolley(b,{commanderId:'leader-attacker',
   weaponIds:['cat'],fortId:'wall'});
  expect(wall(shot).breached).toBe(true);
  expect(wall(shot).structuralHealth).toBe(0);
  expect(fortDefense(wall(shot))).toBe(0);
  expect(fortForUnit(shot.fortifications,guard(shot))).toBeNull();
  expect(guard(shot).health).toBe(60);
  expect(shot.events.some(e=>e.kind==='fort-breached')).toBe(true);
  expect(b.fortifications[0]?.structuralHealth).toBe(5);
 });
 it('recusa dupla seleção de alvos e fortificação aliada',()=>{
  const b=battle();
  expect(()=>fireWarSiegeVolley(b,{commanderId:'leader-attacker',
   weaponIds:['cat'],targetId:'guard',fortId:'wall'})).toThrow(/exatamente/);
  expect(()=>fireWarSiegeVolley(b,{commanderId:'leader-attacker',
   weaponIds:['cat']})).toThrow(/exatamente/);
  expect(b.siege[0]?.lastFiredRound).toBeNull();
 });
 it('persistência de fogo mantém trilha de auditoria e extingue após último tick',()=>{
  const b=battle('stone');
  const target=guard(b);
  const model:WarBattle={...b,phase:'orders'};
  const withFire=igniteWarUnit(model,target.id,'Fogo modelado',3,1);
  const reduced={...withFire,units:withFire.units.map(u=>u.id===target.id?{
   ...u,burning:{...u.burning!,remainingRounds:1},
  }:u)};
  const consume=(state:WarBattle,u:WarUnit,n:number):WarBattle=>({
   ...state,units:state.units.map(v=>v.id===u.id?{
    ...v,health:Math.max(0,v.health-n),
   }:v),
  });
  const done=advanceWarFire(reduced,consume);
  expect(guard(done).burning).toBeUndefined();
  expect(guard(done).health).toBe(57);
  expect(done.events.some(e=>e.kind==='wildfire-tick')).toBe(true);
  expect(guard(reduced).health).toBe(60);
 });
});
