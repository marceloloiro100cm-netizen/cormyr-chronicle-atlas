import {describe,expect,it} from 'vitest';
import {createWarBattle} from '@/lib/battle/got/engine';
import {executeWarHeroAction,makeModelWarHero} from '@/lib/battle/got/heroes';
import {resolvePendingPersonalDamage} from '@/lib/battle/got/personal-injuries';
import {makeModelWarMount} from '@/lib/battle/got/personal-mounts';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import type {WarBattle} from '@/lib/battle/got/types';

function sample(manual=true,commonMiddle=false):WarBattle{
 const rider=makeModelWarHero({id:'rider',name:'Cavaleiro',
  side:'attacker',position:{x:2,y:2}});
 const opponents=[27,29,31].map((x,i)=>makeModelWarHero({
  id:'t'+(i+1),name:'Alvo '+(i+1),side:'defender',
  position:{x:Math.floor(x/10),y:2},
 }));
 return createWarBattle({id:'trample-series',name:'Atropelamento sequencial',
  seed:'trample-sequencial',width:12,height:7,manualMitigation:manual,
  commanders:modelWarCommanders({attacker:7,defender:7}),
  units:[
   modelWarUnit({id:'ua',name:'Aliados',side:'attacker',typeId:'cavalry',
    position:{x:1,y:5}}),
   modelWarUnit({id:'ud',name:'Defensores',side:'defender',typeId:'infantry',
    position:{x:9,y:5}}),
  ],
  heroes:[
   {...rider,personalPosition:{x:25,y:25},mounted:true,
    animalHandling:12,mount:makeModelWarMount({id:'horse',name:'Corcel',
     trainedForWar:true,athletics:6,movement:9})},
   ...opponents.map((h,i)=>({...h,personalPosition:{x:27+i*2,y:25},
    defense:0,armor:0,maxHealth:20,health:20,
    ...(commonMiddle&&i===1?{squadId:'milicia'}:{})})),
  ],
 });
}
function trample(b:WarBattle){
 return executeWarHeroAction(b,{heroId:'rider',
  action:{kind:'personal-trample',toMetres:{x:32,y:25}}});
}
describe('Laboratório GOT — atropelamento sequencial com decisões de dano',()=>{
 it('interrompe para mitigar cada alvo, sem reaplicar golpe já decidido',()=>{
  const initial=sample(),unchanged=JSON.stringify(initial);
  const first=trample(initial);
  expect(first.heroes.find(h=>h.id==='rider')?.usedActions).toBe(1);
  expect(first.pendingPersonalDamage?.targetHeroId).toBe('t1');
  expect(first.pendingPersonalTrample?.hits).toBe(1);
  expect(first.pendingPersonalTrample?.nextStep).toBe(3);
  expect(first.events.filter(e=>e.kind==='personal-trample')).toHaveLength(1);
  expect(()=>trample(first)).toThrow(/dano pessoal pendente/);

  const second=resolvePendingPersonalDamage(first,{kind:'injury'});
  expect(second.heroes.find(h=>h.id==='t1')?.injuries).toBe(1);
  expect(second.pendingPersonalDamage?.targetHeroId).toBe('t2');
  expect(second.pendingPersonalTrample?.hits).toBe(2);
  expect(second.events.filter(e=>e.kind==='personal-trample')).toHaveLength(2);

  const third=resolvePendingPersonalDamage(second,{kind:'none'});
  expect(third.pendingPersonalDamage?.targetHeroId).toBe('t3');
  expect(third.pendingPersonalTrample?.hits).toBe(3);
  const done=resolvePendingPersonalDamage(third,{kind:'none'});
  expect(done.pendingPersonalDamage).toBeUndefined();
  expect(done.pendingPersonalTrample).toBeUndefined();
  expect(done.events.filter(e=>e.kind==='personal-trample')).toHaveLength(3);
  expect(done.events.filter(e=>e.kind==='personal-trample-move')).toHaveLength(1);
  expect(done.heroes.find(h=>h.id==='rider')?.usedActions).toBe(1);
  expect(done.heroes.find(h=>h.id==='rider')?.personalPosition?.x).toBe(32);
  expect(JSON.stringify(initial)).toBe(unchanged);
 });
 it('alvo comum aplica dano imediatamente, sem suprimir decisões dos próximos',()=>{
  const first=trample(sample(true,true));
  const paused=resolvePendingPersonalDamage(first,{kind:'none'});
  expect(paused.heroes.find(h=>h.id==='t2')!.health).toBeLessThan(20);
  expect(paused.pendingPersonalDamage?.targetHeroId).toBe('t3');
  expect(paused.events.filter(e=>e.kind==='personal-trample')).toHaveLength(3);
  const done=resolvePendingPersonalDamage(paused,{kind:'injury'});
  expect(done.pendingPersonalTrample).toBeUndefined();
  expect(done.heroes.find(h=>h.id==='t3')?.injuries).toBe(1);
 });
 it('sem mitigação manual resolve todos os alvos no mesmo passo',()=>{
  const a=trample(sample(false));
  expect(a.pendingPersonalDamage).toBeUndefined();
  expect(a.pendingPersonalTrample).toBeUndefined();
  expect(a.events.filter(e=>e.kind==='personal-trample')).toHaveLength(3);
  expect(a.events.filter(e=>e.kind==='personal-trample-move')).toHaveLength(1);
 });
 it('escolha inválida de ferimentos não avança o percurso nem altera o estado',()=>{
  const first=trample(sample());
  const before=JSON.stringify(first);
  expect(()=>resolvePendingPersonalDamage(first,{kind:'wounds',woundCount:20}))
   .toThrow(/Vigor/);
  expect(JSON.stringify(first)).toBe(before);
 });
 it('movimento ilegal é recusado antes de consumir ação ou alterar o tabuleiro',()=>{
  const b=sample();
  expect(()=>executeWarHeroAction(b,{heroId:'rider',
   action:{kind:'personal-trample',toMetres:{x:33,y:26}}}))
   .toThrow(/linha reta/);
  expect(b.heroes.find(h=>h.id==='rider')?.usedActions).toBe(0);
 });
});
