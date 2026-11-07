import {describe,expect,it} from 'vitest';
import {createWarBattle} from '@/lib/battle/got/engine';
import {executeWarHeroAction,makeModelWarHero} from '@/lib/battle/got/heroes';
import {resolvePendingPersonalDamage} from '@/lib/battle/got/personal-injuries';
import {makeModelWarMount} from '@/lib/battle/got/personal-mounts';
import {equipModelWarHero} from '@/lib/battle/got/personal-weapons';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import type {WarBattle} from '@/lib/battle/got/types';

function arena(opts:{manual?:boolean;distance?:number;weapon?:'longsword'|'greatsword';
 ranged?:'longbow'|'light-crossbow'|'heavy-crossbow';mounted?:boolean;hp?:number}={}):WarBattle{
 const raw=makeModelWarHero({id:'a-hero',name:'A',side:'attacker',position:{x:2,y:2}});
 const attacker=equipModelWarHero(raw,{melee:opts.weapon??'longsword',ranged:opts.ranged??'longbow'});
 const enemy=makeModelWarHero({id:'d-hero',name:'D',side:'defender',position:{
  x:Math.floor((25+(opts.distance??1))/10),y:2,
 }});
 return createWarBattle({id:'advanced-personal',name:'Combate pessoal avançado',
  seed:'advanced-ch9',width:12,height:7,
  commanders:modelWarCommanders({attacker:7,defender:7}),
  units:[
   modelWarUnit({id:'a',name:'A',side:'attacker',typeId:'infantry',position:{x:1,y:5}}),
   modelWarUnit({id:'d',name:'D',side:'defender',typeId:'infantry',position:{x:9,y:5}}),
  ],
  manualMitigation:opts.manual??false,
  heroes:[{...attacker,fighting:12,marksmanship:12,armor:0,defense:0,
   health:40,maxHealth:40,personalPosition:{x:25,y:25},
   ...(opts.mounted?{
    mount:makeModelWarMount({id:'mount-a',name:'Cavalo de guerra'}),
    mounted:true,
   }:{}),
  },{...enemy,fighting:12,marksmanship:12,defense:0,armor:0,
   health:opts.hp??100,maxHealth:opts.hp??100,
   personalPosition:{x:25+(opts.distance??1),y:25},
  }],
 });
}
const act=(b:WarBattle,id:string,kind:'personal-attack'|'personal-charge'|
 'personal-reload'|'personal-counterattack'|'personal-mount'|'personal-dismount'|
 'personal-control-mount'|'personal-move'|'personal-end-turn',
 extra:Record<string,unknown>={})=>
 executeWarHeroAction(b,{heroId:id,action:{kind,...extra}});

describe('Livro GOT — recarga, Cruel, treinamento e combate montado',()=>{
 it('besta pesada exige ação maior de recarga após o disparo',()=>{
  let b=arena({ranged:'heavy-crossbow',distance:3});
  b=act(b,'a-hero','personal-attack',{targetHeroId:'d-hero',ranged:true});
  expect(b.heroes[0]?.rangedLoaded).toBe(false);
  b=act(b,'a-hero','personal-end-turn');
  expect(()=>act(b,'a-hero','personal-attack',{
   targetHeroId:'d-hero',ranged:true,
  })).toThrow(/recarregada/);
  b=act(b,'a-hero','personal-reload');
  expect(b.heroes[0]?.rangedLoaded).toBe(true);
  expect(b.heroes[0]?.usedActions).toBe(2);
  expect(b.events.some(e=>e.kind==='personal-reload')).toBe(true);
  b=act(b,'a-hero','personal-attack',{targetHeroId:'d-hero',ranged:true});
  expect(b.heroes[0]?.rangedLoaded).toBe(false);
 });
 it('besta leve recarrega com ação menor; uso carregado não recarrega duas vezes',()=>{
  let b=arena({ranged:'light-crossbow',distance:3});
  b=act(b,'a-hero','personal-attack',{targetHeroId:'d-hero',ranged:true});
  b=act(b,'a-hero','personal-end-turn');
  b=act(b,'a-hero','personal-reload');
  expect(b.heroes[0]?.minorActionsUsed).toBe(1);
  expect(()=>act(b,'a-hero','personal-reload')).toThrow(/já está carregada/);
  b=act(b,'a-hero','personal-attack',{targetHeroId:'d-hero',ranged:true});
  expect(b.heroes[0]?.usedActions).toBe(2);
 });
 it('Cruel torna fatal uma derrota, com decisão manual de ferimentos antes do desfecho',()=>{
  const cruel=act(arena({weapon:'greatsword',hp:2}),'a-hero','personal-attack',{
   targetHeroId:'d-hero',
  });
  expect(cruel.heroes[1]?.active).toBe(false);
  expect(cruel.heroes[1]?.defeatOutcome).toBe('death');
  const normal=act(arena({weapon:'longsword',hp:2}),'a-hero','personal-attack',{
   targetHeroId:'d-hero',
  });
  expect(normal.heroes[1]?.active).toBe(false);
  expect(normal.heroes[1]?.defeatOutcome).toBeUndefined();
  const pending=act(arena({weapon:'greatsword',hp:2,manual:true}),
   'a-hero','personal-attack',{targetHeroId:'d-hero'});
  expect(pending.pendingPersonalDamage?.cruel).toBe(true);
  const saved=resolvePendingPersonalDamage(pending,{kind:'injury'});
  expect(saved.heroes[1]?.active).toBe(true);
  expect(saved.heroes[1]?.injuries).toBe(1);
 });
 it('montaria treinada permite controle menor e deslocamento com movimento do cavalo',()=>{
  let b=arena({distance:2,mounted:true});
  b={...b,heroes:b.heroes.map(h=>h.id==='a-hero'?{...h,mounted:false}:h)};
  b=act(b,'a-hero','personal-mount');
  expect(b.heroes[0]?.mounted).toBe(true);
  b=act(b,'a-hero','personal-end-turn');
  expect(()=>act(b,'a-hero','personal-move',{toMetres:{x:31,y:25}}))
   .toThrow(/Controle a montaria/);
  b=act(b,'a-hero','personal-control-mount');
  b=act(b,'a-hero','personal-move',{toMetres:{x:31,y:25}});
  expect(b.heroes[0]?.personalPosition?.x).toBe(31);
  expect(b.heroes[0]?.position.x).toBe(3);
  expect(b.heroes[0]?.mountMovedTurn).toBe(1);
  expect(b.heroes[0]?.usedActions).toBe(2);
 });
 it('cavaleiro montado ganha bônus de combate contra oponente a pé',()=>{
  const onFoot=act(arena(),'a-hero','personal-attack',{targetHeroId:'d-hero'});
  const mounted=act(arena({mounted:true}),'a-hero','personal-attack',{
   targetHeroId:'d-hero',
  });
  expect(mounted.events.find(e=>e.kind==='personal-attack')?.total)
   .toBeGreaterThanOrEqual(onFoot.events.find(e=>e.kind==='personal-attack')?.total??0);
  expect(mounted.heroes[1]!.health).toBeLessThan(onFoot.heroes[1]!.health);
 });
 it('montaria não treinada exige ação maior de controle',()=>{
  const b=arena({mounted:true});
  const wild={...b,heroes:b.heroes.map(h=>h.id==='a-hero'?{
   ...h,mount:{...h.mount!,trainedForWar:false},
  }:h)};
  const controlled=act(wild,'a-hero','personal-control-mount');
  expect(controlled.heroes[0]?.usedActions).toBe(1);
  expect(controlled.heroes[0]?.minorActionsUsed).toBe(0);
  expect(()=>act(controlled,'a-hero','personal-move',{
   toMetres:{x:26,y:25},
  })).toThrow(/Controle a montaria/);
 });
});
