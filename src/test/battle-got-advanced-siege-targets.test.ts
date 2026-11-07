import {describe,it,expect} from 'vitest';
import {createWarBattle,fireWarSiegeVolley} from '@/lib/battle/got/engine';
import {makeModelSiege} from '@/lib/battle/got/siege';
import {makeWarFortification,fortDefense} from '@/lib/battle/got/fortifications';
import {makeModelWarHero} from '@/lib/battle/got/heroes';
import {modelWarUnit,modelWarCommanders} from '@/lib/battle/got/models';
import type {WarSiegeKind,WarSiegeAmmo} from '@/lib/battle/got/siege';

function start(input:{kind?:WarSiegeKind;ammo?:WarSiegeAmmo;fort?:boolean;hero?:boolean}={}){
 const engineer=modelWarUnit({id:'engineer',name:'Sapadores',
  side:'attacker',position:{x:1,y:2},typeId:'engineers'});
 const foe=modelWarUnit({id:'foe',name:'Defensores',
  side:'defender',position:{x:5,y:2},typeId:'garrison'});
 const fort=input.fort?makeWarFortification({
  id:'wall',name:'Muro de pedras',kind:'temporary',side:'defender',
  cells:[{x:5,y:2}],engineerBuilt:false,hoursBuilt:6,
  structuralDifficulty:1,structuralHealth:10,structuralArmor:2,
 }):undefined;
 const siege=makeModelSiege({id:'gun',kind:input.kind??'catapult-medium',
  side:'attacker',position:{x:1,y:3},engineerId:'engineer',
  ...(input.ammo?{ammo:input.ammo}:{})});
 const heroes=input.hero?[{...makeModelWarHero({id:'hero',name:'Cavaleiro',
  side:'defender',position:{x:5,y:3}}),defense:0,armor:0,
  health:30,maxHealth:30}]:[];
 const b=createWarBattle({id:'siege-advanced',name:'Cerco avançado',
  seed:'cerco-estrutural',width:12,height:7,units:[
   engineer,{...foe,armor:0,defense:0,health:60,maxHealth:60,
    ability:{...foe.ability,endurance:20}},
  ],commanders:modelWarCommanders({attacker:12,defender:8}),
  fortifications:fort?[fort]:[],heroes,siege:[siege]});
 return {...b,turn:'attacker' as const};
}
describe('Capítulo 10 — disparos de cerco contra muralhas e personagens',()=>{
 it('catapulta pode abrir brecha sem alterar uma fortificação oficial',()=>{
  const b=start({fort:true}),before=JSON.stringify(b);
  const hit=fireWarSiegeVolley(b,{commanderId:'leader-attacker',
   weaponIds:['gun'],fortId:'wall'});
  const wall=hit.fortifications.find(f=>f.id==='wall')!;
  expect(wall.breached).toBe(true);
  expect(wall.structuralHealth).toBe(0);
  expect(fortDefense(wall)).toBe(0);
  expect(hit.events.some(e=>e.kind==='fort-breached')).toBe(true);
  expect(b.fortifications[0]!.structuralHealth).toBe(10);
  expect(JSON.stringify(b)).toBe(before);
 });
 it('não permite disparar duas vezes no mesmo intervalo de recarga',()=>{
  const b=start({kind:'catapult-small'});
  const fired=fireWarSiegeVolley(b,{commanderId:'leader-attacker',
   weaponIds:['gun'],targetId:'foe'});
  const repeated={...fired,turn:'attacker' as const,phase:'siege' as const,
   siegeCompleted:{attacker:false,defender:false}};
  expect(()=>fireWarSiegeVolley(repeated,{commanderId:'leader-attacker',
   weaponIds:['gun'],targetId:'foe'})).toThrow(/recarregar/);
 });
 it('Fogo selvagem ignora armadura, inflige dano e mantém duração de 2d6 rodadas',()=>{
  const b=start({kind:'fire-pot',ammo:'wildfire'});
  const fired=fireWarSiegeVolley(b,{commanderId:'leader-attacker',
   weaponIds:['gun'],targetId:'foe'});
  const enemy=fired.units.find(u=>u.id==='foe')!;
  expect(enemy.burning).toBeDefined();
  expect(enemy.burning!.remainingRounds).toBeGreaterThanOrEqual(2);
  expect(enemy.burning!.remainingRounds).toBeLessThanOrEqual(12);
  expect(fired.events.some(e=>e.kind==='wildfire-ignite')).toBe(true);
 });
 it('escorpião ataca herói com −1D em Guerra e exatamente 10 pontos de dano antes do VA',()=>{
  const b=start({kind:'scorpion',hero:true});
  const fired=fireWarSiegeVolley(b,{commanderId:'leader-attacker',
   weaponIds:['gun'],targetHeroId:'hero'});
  expect(fired.events.find(e=>e.kind==='siege-hero')?.degrees).toBeGreaterThan(0);
  expect(fired.heroes.find(h=>h.id==='hero')?.health).toBe(20);
  expect(()=>fireWarSiegeVolley(b,{commanderId:'leader-attacker',
   weaponIds:['gun'],fortId:'wall'})).toThrow(/indisponível/);
 });
 it('escorpião não pode usar disparo contra personagem e fortificação ao mesmo tempo',()=>{
  const b=start({kind:'scorpion',hero:true,fort:true});
  expect(()=>fireWarSiegeVolley(b,{commanderId:'leader-attacker',
   weaponIds:['gun'],targetHeroId:'hero',fortId:'wall'}))
   .toThrow(/único alvo/);
 });
});
