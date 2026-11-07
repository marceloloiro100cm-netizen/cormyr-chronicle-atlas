import {describe,expect,it} from 'vitest';
import {createWarBattle} from '@/lib/battle/got/engine';
import {executeWarHeroAction,makeModelWarHero} from '@/lib/battle/got/heroes';
import {resolvePendingPersonalDamage} from '@/lib/battle/got/personal-injuries';
import {equipModelWarHero} from '@/lib/battle/got/personal-weapons';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import type {WarBattle} from '@/lib/battle/got/types';

function duel(weapon:'longsword'|'greatsword'|'bastard-sword'){
 const a=equipModelWarHero(makeModelWarHero({id:'a',name:'Atacante',
  side:'attacker',position:{x:2,y:3}}),{melee:weapon,ranged:'longbow'});
 const d=makeModelWarHero({id:'d',name:'Guarda',
  side:'defender',position:{x:2,y:3}});
 return createWarBattle({id:'reaction-manual',name:'Ataque retomado',
  seed:'reaction-paused',width:12,height:7,manualMitigation:true,
  commanders:modelWarCommanders({attacker:6,defender:6}),
  units:[
   modelWarUnit({id:'ua',name:'A',side:'attacker',typeId:'infantry',position:{x:1,y:5}}),
   modelWarUnit({id:'ud',name:'D',side:'defender',typeId:'infantry',position:{x:9,y:5}}),
  ],
  heroes:[
   {...a,fighting:12,meleeBonusDice:1,strengthBonusDice:2,
    defense:0,armor:0,health:200,maxHealth:200,
    personalPosition:{x:25,y:35}},
   {...d,fighting:12,defense:0,armor:0,health:200,maxHealth:200,
    personalPosition:{x:26,y:35}},
  ],
 });
}
function reactAndResume(b:WarBattle,kind:
 'personal-attack'|'personal-cautious-attack'|'personal-reckless-attack',
 extras:{twoHandedGrip?:boolean;powerBonusDice?:number}={}){
 const prepared=executeWarHeroAction(b,{heroId:'d',action:{
  kind:'personal-counterattack',
 }});
 const interrupted=executeWarHeroAction(prepared,{heroId:'a',action:{
  kind,targetHeroId:'d',...extras,
 }});
 expect(interrupted.pendingPersonalDamage?.targetHeroId).toBe('a');
 expect(interrupted.pendingPersonalCounterattack?.attackerId).toBe('a');
 const resumed=resolvePendingPersonalDamage(interrupted,{kind:'none'});
 expect(resumed.pendingPersonalCounterattack).toBeUndefined();
 const strike=resumed.events.find(e=>e.kind==='personal-attack'&&
  e.text.startsWith('Atacante atacou Guarda'))!;
 expect(strike).toBeDefined();
 return {interrupted,resumed,strike};
}
describe('Capítulo 9 — reações com dano pendente preservam modificadores',()=>{
 it('Ataque Cauteloso mantém -1D quando retomado após a mitigação da reação',()=>{
  const base=reactAndResume(duel('longsword'),'personal-attack');
  const cautious=reactAndResume(duel('longsword'),'personal-cautious-attack');
  expect(cautious.interrupted.pendingPersonalCounterattack?.cautious).toBe(true);
  expect(cautious.strike.total).toBeLessThanOrEqual(base.strike.total??0);
  expect(cautious.resumed.heroes.find(h=>h.id==='a')?.cautiousDefenseBonus).toBe(3);
 });
 it('Poderosa mantém investimento de Força antes e depois do contra-ataque manual',()=>{
  const normal=reactAndResume(duel('greatsword'),'personal-attack');
  const powerful=reactAndResume(duel('greatsword'),'personal-attack',{
   powerBonusDice:2,
  });
  expect(powerful.interrupted.pendingPersonalCounterattack?.powerBonusDice).toBe(2);
  const degrees=powerful.strike.degrees!;
  expect(powerful.resumed.pendingPersonalDamage?.damage).toBe(
   (normal.resumed.pendingPersonalDamage?.damage??0)+2*degrees
  );
 });
 it('Adaptável mantém empunhadura de duas mãos na continuação do ataque',()=>{
  const one=reactAndResume(duel('bastard-sword'),'personal-attack');
  const two=reactAndResume(duel('bastard-sword'),'personal-attack',{
   twoHandedGrip:true,
  });
  expect(two.interrupted.pendingPersonalCounterattack?.twoHandedGrip).toBe(true);
  const degrees=two.strike.degrees!;
  expect(two.resumed.pendingPersonalDamage?.damage).toBe(
   (one.resumed.pendingPersonalDamage?.damage??0)+degrees
  );
 });
});
