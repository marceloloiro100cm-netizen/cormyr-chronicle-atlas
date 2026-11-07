import {describe,expect,it} from 'vitest';
import {createWarBattle} from '@/lib/battle/got/engine';
import {makeModelWarHero,executeWarHeroAction} from '@/lib/battle/got/heroes';
import {makeModelWarMount,applyPersonalMountDamage} from '@/lib/battle/got/personal-mounts';
import {resolvePendingPersonalDamage} from '@/lib/battle/got/personal-injuries';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';

function sample(args:{handling?:number;manual?:boolean;actorMounted?:boolean}={}){
 const a=makeModelWarHero({id:'a',name:'Guerreiro',side:'attacker',
  position:{x:2,y:2}});
 const d=makeModelWarHero({id:'d',name:'Cavaleiro',side:'defender',
  position:{x:2,y:2}});
 return createWarBattle({id:'mount-effects',name:'Montarias',seed:'mount-effects-v1',
  width:12,height:7,manualMitigation:args.manual??false,
  commanders:modelWarCommanders({attacker:6,defender:6}),
  units:[
   modelWarUnit({id:'ua',name:'Atacantes',typeId:'infantry',side:'attacker',
    position:{x:1,y:5}}),
   modelWarUnit({id:'ud',name:'Defensores',typeId:'infantry',side:'defender',
    position:{x:9,y:5}}),
  ],
  heroes:[
   {...a,personalPosition:{x:25,y:25},fighting:12,marksmanship:12,
    ...(args.actorMounted?{mounted:true,animalHandling:12,
     mount:makeModelWarMount({id:'horse-a',name:'Montaria atacante'})}:{})},
   {...d,personalPosition:{x:26,y:25},animalHandling:args.handling??1,
    mounted:true,mount:makeModelWarMount({id:'horse-d',name:'Corcel defensor'})},
  ],
 });
}
describe('Capítulo 9 — montarias feridas e mortas',()=>{
 it('reduz Saúde do cavalo e torna controle do animal ferido uma ação maior',()=>{
  const before=sample();
  const after=applyPersonalMountDamage(before,{riderId:'d',damage:2,source:'Golpe'});
  expect(after.heroes[1]?.mount?.health).toBe(10);
  expect(after.heroes[1]?.mounted).toBe(true);
  expect(after.events.some(e=>e.kind==='personal-mount-wound')).toBe(true);
  const controlled=executeWarHeroAction(after,{heroId:'d',
   action:{kind:'personal-control-mount'}});
  expect(controlled.heroes[1]?.usedActions).toBe(1);
  expect(controlled.heroes[1]?.minorActionsUsed).toBe(0);
  expect(before.heroes[1]?.mount?.health).toBe(12);
 });
 it('controle em ação maior move cavalo ferido sem violar orçamento de ações',()=>{
  const injured=applyPersonalMountDamage(sample(),{
   riderId:'d',damage:2,source:'Corte',
  });
  const moved=executeWarHeroAction(injured,{heroId:'d',action:{
   kind:'personal-control-mount',toMetres:{x:30,y:25},
  }});
  expect(moved.heroes.find(h=>h.id==='d')?.usedActions).toBe(1);
  expect(moved.heroes.find(h=>h.id==='d')?.personalPosition).toEqual({x:30,y:25});
  expect(moved.heroes.find(h=>h.id==='d')?.mountMovedTurn).toBe(0);
 });
  it('ao morrer cavalo, falha em Lidar com Animais deixa cavaleiro preso com dano ignorando VA',()=>{
  const before=sample({handling:1});
  const after=applyPersonalMountDamage(before,{riderId:'d',damage:12,source:'Lança'});
  expect(after.heroes[1]?.mount?.health).toBe(0);
  expect(after.heroes[1]?.mounted).toBe(false);
  expect(after.heroes[1]?.pinnedByMount).toBe(true);
  expect(after.heroes[1]?.prone).toBe(true);
  expect(after.heroes[1]?.health).toBe(before.heroes[1]!.health-4);
  expect(after.events.find(e=>e.kind==='personal-mount-fall-trapped')?.difficulty).toBe(12);
  expect(()=>executeWarHeroAction(after,{heroId:'d',action:{
   kind:'personal-move',toMetres:{x:27,y:25},
  }})).toThrow(/preso/);
 });
 it('salto com Lidar com Animais 12 evita dano e pousa a 1 metro do cavalo',()=>{
  const before=sample({handling:12});
  const after=applyPersonalMountDamage(before,{riderId:'d',damage:30,source:'Flecha'});
  const rider=after.heroes[1]!;
  expect(rider.pinnedByMount).toBe(false);
  expect(rider.mounted).toBe(false);
  expect(rider.health).toBe(rider.maxHealth);
  expect(Math.max(Math.abs(rider.personalPosition!.x-26),
   Math.abs(rider.personalPosition!.y-25))).toBe(1);
  expect(after.events.some(e=>e.kind==='personal-mount-fall-saved')).toBe(true);
 });
 it('cavaleiro pode libertar-se com ação maior e se levantar depois da queda',()=>{
  const fallen=applyPersonalMountDamage(
   {...sample({handling:1}),heroes:sample({handling:1}).heroes.map(h=>
    h.id==='d'?{...h,athletics:12}:h)},
   {riderId:'d',damage:12,source:'Pique'});
  const freed=executeWarHeroAction(fallen,{heroId:'d',action:{
   kind:'personal-free-mount',escapeUsing:'athletics',
  }});
  expect(freed.heroes[1]?.pinnedByMount).toBe(false);
  expect(freed.heroes[1]?.prone).toBe(true);
  expect(freed.heroes[1]?.usedActions).toBe(1);
  const stood=executeWarHeroAction(freed,{heroId:'d',
   action:{kind:'personal-stand'}});
  expect(stood.heroes[1]?.prone).toBe(false);
 });
 it('mitigação manual aguarda escolha antes de aplicar dano de queda',()=>{
  const before=sample({handling:1,manual:true});
  const after=applyPersonalMountDamage(before,{riderId:'d',damage:12,source:'Arqueiro'});
  expect(after.pendingPersonalDamage?.damage).toBe(4);
  expect(after.heroes[1]?.health).toBe(before.heroes[1]?.health);
  const spared=resolvePendingPersonalDamage(after,{kind:'injury'});
  expect(spared.pendingPersonalDamage).toBeUndefined();
  expect(spared.heroes[1]?.injuries).toBe(1);
  expect(spared.heroes[1]?.health).toBe(before.heroes[1]?.health);
 });
 it('ataque direto contra a montaria pode matá-la e provocar a queda do cavaleiro',()=>{
  const b=sample({handling:1});
  const hard={...b,heroes:b.heroes.map(h=>h.id==='a'?{
   ...h,meleeDamage:20,
  }:h)};
  const out=executeWarHeroAction(hard,{heroId:'a',action:{
   kind:'personal-attack-mount',targetHeroId:'d',
  }});
  expect(out.heroes.find(h=>h.id==='d')?.mount?.health).toBe(0);
  expect(out.events.some(e=>e.kind==='personal-attack-mount')).toBe(true);
  expect(out.heroes.find(h=>h.id==='d')?.pinnedByMount).toBe(true);
  expect(out.heroes.find(h=>h.id==='a')?.minorActionsUsed).toBe(1);
 });
});
describe('Capítulo 9 — atropelamento em linha reta',()=>{
 it('faz teste de Lidar com Animais e acrescenta +5 Defesa a cada alvo subsequente',()=>{
  const before=sample({actorMounted:true});
  const one=makeModelWarHero({id:'e1',name:'Infante um',side:'defender',
   position:{x:2,y:2}});
  const two=makeModelWarHero({id:'e2',name:'Infante dois',side:'defender',
   position:{x:2,y:2}});
  const encounter={...before,heroes:[
   before.heroes[0]!,
   {...one,personalPosition:{x:27,y:25},defense:0,armor:0},
   {...two,personalPosition:{x:29,y:25},defense:0,armor:0},
  ]};
  const after=executeWarHeroAction(encounter,{heroId:'a',action:{
   kind:'personal-trample',toMetres:{x:30,y:25},
  }});
  const events=after.events.filter(e=>e.kind==='personal-trample');
  expect(events).toHaveLength(2);
  expect(events[1]!.difficulty-events[0]!.difficulty).toBe(5);
  expect(after.heroes.find(h=>h.id==='e1')!.health).toBeLessThan(9);
  expect(after.heroes.find(h=>h.id==='e2')!.health).toBeLessThan(9);
  expect(after.heroes[0]?.position).toEqual({x:3,y:2});
  expect(after.heroes[0]?.usedActions).toBe(1);
 });
 it('rejeita trajeto não retilíneo e montaria inexistente',()=>{
  const mounted=sample({actorMounted:true});
  expect(()=>executeWarHeroAction(mounted,{heroId:'a',action:{
   kind:'personal-trample',toMetres:{x:29,y:27},
  }})).toThrow(/linha reta/);
  expect(()=>executeWarHeroAction(sample(),{heroId:'a',action:{
   kind:'personal-trample',toMetres:{x:28,y:25},
  }})).toThrow(/montaria viva/);
 });
 it('não executa múltiplos danos enquanto mitigação manual exigir decisão intermediária',()=>{
  const mounted=sample({actorMounted:true,manual:true});
  expect(()=>executeWarHeroAction(mounted,{heroId:'a',action:{
   kind:'personal-trample',toMetres:{x:28,y:25},
  }})).toThrow(/mitigação manual/);
 });
});
