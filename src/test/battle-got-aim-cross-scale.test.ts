import {describe,expect,it} from 'vitest';
import {createWarBattle,executeWarHeroAttackUnit} from '@/lib/battle/got/engine';
import {executeWarHeroAction,makeModelWarHero} from '@/lib/battle/got/heroes';
import {equipModelWarHero} from '@/lib/battle/got/personal-weapons';
import {makeModelWarMount} from '@/lib/battle/got/personal-mounts';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
function scenario(){
 const hero=equipModelWarHero(makeModelWarHero({id:'h1',name:'Arqueiro',
  side:'attacker',position:{x:2,y:3}}),{melee:'longsword',ranged:'longbow'});
 const foe=makeModelWarHero({id:'h2',name:'Cavaleiro',
  side:'defender',position:{x:2,y:3}});
 return createWarBattle({id:'aim-across',name:'Mirar entre escalas',
  seed:'mirar-escala',width:12,height:7,
  commanders:modelWarCommanders({attacker:6,defender:6}),
  units:[
   modelWarUnit({id:'ua',name:'Aliados',side:'attacker',typeId:'infantry',position:{x:1,y:5}}),
   modelWarUnit({id:'ud',name:'Inimigos',side:'defender',typeId:'infantry',position:{x:3,y:3}}),
  ],
  heroes:[
   {...hero,marksmanship:10,rangedBonusDice:1,personalPosition:{x:25,y:35}},
   {...foe,personalPosition:{x:26,y:35},mount:makeModelWarMount({
    id:'horse2',name:'Corcel inimigo',athletics:4,
   })},
  ],
 });
}
describe('Capítulo 9 — Mirar vale em qualquer alvo individual ou coletivo',()=>{
 it('o próximo tiro contra a unidade recebe um dado bônus e o consome',()=>{
  const b=scenario();
  const base=executeWarHeroAttackUnit(b,{heroId:'h1',unitId:'ud',ranged:true});
  const aiming=executeWarHeroAction(b,{heroId:'h1',action:{kind:'personal-aim'}});
  const closed=executeWarHeroAction(aiming,{heroId:'h1',action:{kind:'personal-end-turn'}});
  const aimed=executeWarHeroAttackUnit(closed,{heroId:'h1',unitId:'ud',ranged:true});
  const ordinary=base.events.find(e=>e.kind==='hero-vs-unit')!;
  const focused=aimed.events.find(e=>e.kind==='hero-vs-unit')!;
  expect(focused.roll?.length).toBe((ordinary.roll?.length??0)+1);
  expect(focused.total).toBeGreaterThanOrEqual(ordinary.total??0);
  expect(aimed.heroes.find(h=>h.id==='h1')?.aimBonusDice).toBe(0);
 });
 it('o próximo tiro contra montaria recebe o mesmo +1B sem acumular',()=>{
  const b=scenario();
  const shot=(state:ReturnType<typeof scenario>)=>
   executeWarHeroAction(state,{heroId:'h1',action:{
    kind:'personal-attack-mount',targetHeroId:'h2',ranged:true,
   }});
  const normal=shot(b);
  const aiming=executeWarHeroAction(b,{heroId:'h1',action:{kind:'personal-aim'}});
  const aimed=shot(aiming);
  const ordinary=normal.events.find(e=>e.kind==='personal-attack-mount')!;
  const focused=aimed.events.find(e=>e.kind==='personal-attack-mount')!;
  expect(focused.roll?.length).toBe((ordinary.roll?.length??0)+1);
  expect(aimed.heroes.find(h=>h.id==='h1')?.aimBonusDice).toBe(0);
 });
});
