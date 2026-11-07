import {describe,expect,it} from 'vitest';
import {createWarBattle,issueWarOrder} from '@/lib/battle/got/engine';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import type {WarBattle} from '@/lib/battle/got/types';

function sample(withPots=true):WarBattle{
 const a=modelWarUnit({id:'a',name:'Atacantes',side:'attacker',
  typeId:'infantry',position:{x:2,y:3}});
 const d=modelWarUnit({id:'d',name:'Defensores',side:'defender',
  typeId:'garrison',position:{x:3,y:3}});
 const base=createWarBattle({id:'fire-risk',name:'Risco do fogo selvagem',
  seed:'fire-risk',width:12,height:7,
  commanders:modelWarCommanders({attacker:12,defender:6}),
  units:[{...a,ability:{...a.ability,fighting:12},meleeDamage:3},
   {...d,ability:{...d.ability,endurance:20},
    maxHealth:60,health:60,armor:0,defense:0,
    ...(withPots?{fieldEquipment:'wildfire-pots' as const}:{})}],
 });
 return {...base,turn:'attacker'};
}
function hit(b:WarBattle):WarBattle{
 return issueWarOrder(b,{commanderId:'leader-attacker',unitId:'a',
  order:{kind:'attack',targetId:'d'}}).battle;
}
describe('Capítulo 10 — risco dos potes de fogo selvagem',()=>{
 it('cada acerto testa 1d6 e pode incendiar os potes na própria unidade',()=>{
  const base=sample(),snapshot=JSON.stringify(base);
  let caught:WarBattle|null=null,chosenSeed=-1;
  for(let seed=1;seed<=120;seed++){
   const attempt=hit({...base,seed});
   if(attempt.events.some(e=>e.kind==='wildfire-accident')){
    caught=attempt;chosenSeed=seed;break;
   }
  }
  expect(caught).not.toBeNull();
  const target=caught!.units.find(u=>u.id==='d')!;
  expect(target.fieldEquipmentConsumed).toBe(true);
  expect(target.health).toBeLessThan(60);
  expect(target.burning?.damagePerRound).toBe(7);
  expect(caught!.events.some(e=>e.kind==='wildfire-ignite')).toBe(true);
  expect(hit({...base,seed:chosenSeed})).toEqual(caught);
  expect(JSON.stringify(base)).toBe(snapshot);
 });
 it('sem potes de fogo selvagem jamais apresenta a reação especial',()=>{
  const base=sample(false);
  for(let seed=1;seed<=24;seed++){
   const after=hit({...base,seed});
   expect(after.events.some(e=>e.kind==='wildfire-accident')).toBe(false);
   expect(after.units.find(u=>u.id==='d')!.burning).toBeUndefined();
  }
 });
});
