import {describe,expect,it} from 'vitest';
import {createWarBattle} from '@/lib/battle/got/engine';
import {executeWarHeroAction,makeModelWarHero} from '@/lib/battle/got/heroes';
import {makeModelWarMount} from '@/lib/battle/got/personal-mounts';
import {personalMovement} from '@/lib/battle/got/personal-combat';
import {queuePersonalDamage} from '@/lib/battle/got/personal-injuries';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import type {WarBattle} from '@/lib/battle/got/types';

function arena(input:{mounted?:boolean;trained?:boolean;entangled?:boolean}={}):WarBattle{
 const rider=makeModelWarHero({id:'rider',name:'Cavaleiro',side:'attacker',
  position:{x:2,y:2}});
 const victim=makeModelWarHero({id:'victim',name:'Vítima',side:'defender',
  position:{x:3,y:2}});
 const mount=makeModelWarMount({id:'horse',name:'Cavalo de guerra',
  trainedForWar:input.trained??true,movement:8,athletics:5});
 return createWarBattle({id:'restraint-regression',name:'Vínculos e Movimento',
  seed:'restraint-regression',width:12,height:7,
  commanders:modelWarCommanders({attacker:5,defender:5}),
  units:[
   modelWarUnit({id:'a',name:'Aliados',side:'attacker',typeId:'infantry',
    position:{x:1,y:5}}),
   modelWarUnit({id:'d',name:'Inimigos',side:'defender',typeId:'infantry',
    position:{x:9,y:5}}),
  ],
  heroes:[
   {...rider,personalPosition:{x:25,y:25},health:30,maxHealth:30,
    ...(input.mounted?{mounted:true,mount}:{}),
    ...(input.entangled?{entangledBy:'victim'}:{})},
   {...victim,personalPosition:{x:30,y:25},
    health:30,maxHealth:30,
    ...(input.entangled?{entanglingTargetId:'rider'}:{})},
  ],
 });
}
const rider=(b:WarBattle)=>b.heroes.find(h=>h.id==='rider')!;
const victim=(b:WarBattle)=>b.heroes.find(h=>h.id==='victim')!;

describe('Capítulo 9 — integridade de vínculos e mobilidade de montarias',()=>{
 it('Enredar limita a um metro também quem está montado; controle não ignora o limite',()=>{
  const start=arena({mounted:true,entangled:true});
  expect(personalMovement(rider(start))).toBe(1);
  const controlled=executeWarHeroAction(start,{heroId:'rider',
   action:{kind:'personal-control-mount'}});
  expect(()=>executeWarHeroAction(controlled,{heroId:'rider',action:{
   kind:'personal-move',toMetres:{x:27,y:25},
  }})).toThrow(/além do Movimento/);
  const moved=executeWarHeroAction(controlled,{heroId:'rider',action:{
   kind:'personal-move',toMetres:{x:26,y:25},
  }});
  expect(rider(moved).personalPosition).toEqual({x:26,y:25});
 });
 it('Atropelar enquanto Enredado não permite percorrer oito metros da montaria',()=>{
  const start=arena({mounted:true,entangled:true});
  expect(()=>executeWarHeroAction(start,{heroId:'rider',action:{
   kind:'personal-trample',toMetres:{x:30,y:25},
  }})).toThrow(/excede Movimento/);
  expect(rider(start).usedActions).toBe(0);
  expect(start.pendingPersonalTrample).toBeUndefined();
 });
 it('Controle maior de montaria não treinada não ignora limite de Enredar',()=>{
  const start=arena({mounted:true,trained:false,entangled:true});
  expect(()=>executeWarHeroAction(start,{heroId:'rider',action:{
   kind:'personal-control-mount',toMetres:{x:28,y:25},
  }})).toThrow(/além do Movimento/);
  const allowed=executeWarHeroAction(start,{heroId:'rider',action:{
   kind:'personal-control-mount',toMetres:{x:26,y:25},
  }});
  expect(rider(allowed).usedActions).toBe(1);
  expect(rider(allowed).personalPosition).toEqual({x:26,y:25});
 });
 it('Morte do agarrador liberta vítima e imobilização, mas não remove rede ou lança alojada',()=>{
  const b=arena(),held={...b,heroes:b.heroes.map(h=>
   h.id==='rider'?{...h,health:1,grapplingTargetId:'victim',
    pinningTargetId:'victim'}:
   {...h,grabbedBy:'rider',pinnedByHero:'rider',
    entangledBy:'rider',impaledBy:'rider'})};
  const snapshot=JSON.stringify(held);
  const after=queuePersonalDamage(held,{actorName:'Atacante',
   targetHeroId:'rider',damage:3,source:'personal'});
  expect(rider(after).active).toBe(false);
  expect(rider(after).grapplingTargetId).toBeUndefined();
  expect(rider(after).pinningTargetId).toBeUndefined();
  expect(victim(after).grabbedBy).toBeUndefined();
  expect(victim(after).pinnedByHero).toBeUndefined();
  expect(victim(after).entangledBy).toBe('rider');
  expect(victim(after).impaledBy).toBe('rider');
  expect(JSON.stringify(held)).toBe(snapshot);
 });
 it('Rendição do agarrador liberta a vítima, sem apagar condições físicas independentes',()=>{
  const b=arena(),held={...b,heroes:b.heroes.map(h=>
   h.id==='rider'?{...h,grapplingTargetId:'victim',
    pinningTargetId:'victim'}:
   {...h,grabbedBy:'rider',pinnedByHero:'rider',impaledBy:'rider'})};
  const surrendered=executeWarHeroAction(held,{heroId:'rider',action:{
   kind:'personal-surrender',
  }});
  expect(rider(surrendered).active).toBe(false);
  expect(victim(surrendered).grabbedBy).toBeUndefined();
  expect(victim(surrendered).pinnedByHero).toBeUndefined();
  expect(victim(surrendered).impaledBy).toBe('rider');
 });
 it('Derrota do agarrado também remove vínculos no agarrador sobrevivente',()=>{
  const b=arena(),held={...b,heroes:b.heroes.map(h=>
   h.id==='rider'?{...h,grapplingTargetId:'victim',
    pinningTargetId:'victim'}:
   {...h,health:1,grabbedBy:'rider',pinnedByHero:'rider'})};
  const after=queuePersonalDamage(held,{actorName:'Outro',
   targetHeroId:'victim',damage:3,source:'personal'});
  expect(victim(after).active).toBe(false);
  expect(rider(after).grapplingTargetId).toBeUndefined();
  expect(rider(after).pinningTargetId).toBeUndefined();
 });
});
