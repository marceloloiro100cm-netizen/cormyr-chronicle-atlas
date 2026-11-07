import {describe,expect,it} from 'vitest';
import {createWarBattle} from '@/lib/battle/got/engine';
import {executeWarHeroAction,makeModelWarHero} from '@/lib/battle/got/heroes';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';

function setup(input:{manual?:boolean;distance?:number;attackerHp?:number}={}){
 const distance=input.distance??1;
 const a=makeModelWarHero({id:'a',name:'Atacante',side:'attacker',
  position:{x:2,y:2}});
 const d=makeModelWarHero({id:'d',name:'Guarda',side:'defender',
  position:{x:Math.floor((25+distance)/10),y:2}});
 return createWarBattle({id:'parry',name:'Contra-ataque pessoal',seed:'counter-chapter9',
  width:12,height:7,manualMitigation:input.manual??false,
  commanders:modelWarCommanders({attacker:5,defender:5}),
  units:[
   modelWarUnit({id:'ua',name:'A',side:'attacker',typeId:'infantry',position:{x:1,y:5}}),
   modelWarUnit({id:'ud',name:'D',side:'defender',typeId:'infantry',position:{x:9,y:5}}),
  ],
  heroes:[
   {...a,fighting:12,marksmanship:12,defense:0,armor:0,
    health:input.attackerHp??90,maxHealth:input.attackerHp??90,
    personalPosition:{x:25,y:25}},
   {...d,fighting:12,marksmanship:12,meleeDamage:5,defense:0,armor:0,
    health:90,maxHealth:90,personalPosition:{x:25+distance,y:25}},
  ],
 });
}
describe('Capítulo 9 — contra-ataque pessoal preparado',()=>{
 it('custa ação maior e interrompe antes da execução do golpe adversário',()=>{
  const base=setup(),snapshot=JSON.stringify(base);
  const prepared=executeWarHeroAction(base,{heroId:'d',
   action:{kind:'personal-counterattack'}});
  expect(prepared.heroes[1]?.usedActions).toBe(1);
  expect(prepared.heroes[1]?.counterattackReady).toEqual({
   ranged:false,vsCharge:false,
  });
  const out=executeWarHeroAction(prepared,{heroId:'a',action:{
   kind:'personal-attack',targetHeroId:'d',
  }});
  const attacks=out.events.filter(e=>e.kind==='personal-attack');
  expect(attacks).toHaveLength(2);
  expect(attacks[0]?.text).toMatch(/^Guarda atacou Atacante/);
  expect(attacks[1]?.text).toMatch(/^Atacante atacou Guarda/);
  expect(out.heroes[1]?.counterattackReady).toBeUndefined();
  expect(out.heroes[0]?.health).toBeLessThan(90);
  expect(JSON.stringify(base)).toBe(snapshot);
 });
 it('se o contra-ataque derrota o agressor, interrompe o ataque principal',()=>{
  const b=setup({attackerHp:1});
  const prep=executeWarHeroAction(b,{heroId:'d',
   action:{kind:'personal-counterattack'}});
  const out=executeWarHeroAction(prep,{heroId:'a',action:{
   kind:'personal-attack',targetHeroId:'d',
  }});
  expect(out.heroes[0]?.active).toBe(false);
  expect(out.events.filter(e=>e.kind==='personal-attack')).toHaveLength(1);
  expect(out.events.some(e=>e.kind==='personal-counterattack-interrupt')).toBe(true);
  expect(out.heroes[1]?.health).toBe(90);
 });
 it('preparar contra carga adiciona +2 dano básico apenas contra carga',()=>{
  const base=setup({distance:4});
  const regular=executeWarHeroAction(base,{heroId:'d',
   action:{kind:'personal-counterattack',vsCharge:false}});
  const braced=executeWarHeroAction(base,{heroId:'d',
   action:{kind:'personal-counterattack',vsCharge:true}});
  const charge={kind:'personal-charge' as const,targetHeroId:'d'};
  const normal=executeWarHeroAction(regular,{heroId:'a',action:charge});
  const raised=executeWarHeroAction(braced,{heroId:'a',action:charge});
  const degrees=raised.events.find(e=>e.kind==='personal-attack'&&
   e.text.startsWith('Guarda atacou'))!.degrees!;
  expect(raised.heroes[0]!.health)
   .toBe(normal.heroes[0]!.health-2*degrees);
 });
 it('mitigação manual bloqueia o modo antecipado até fluxo de reações ser implementado',()=>{
  expect(()=>executeWarHeroAction(setup({manual:true}),{heroId:'d',
   action:{kind:'personal-counterattack'}})).toThrow(/mitigação manual/);
 });
 it('contra-ataque à distância usa Pontaria quando existe alcance',()=>{
  const b=setup({distance:5});
  const prep=executeWarHeroAction(b,{heroId:'d',
   action:{kind:'personal-counterattack',ranged:true}});
  const next=executeWarHeroAction(prep,{heroId:'a',
   action:{kind:'personal-attack',targetHeroId:'d',ranged:true}});
  expect(next.events.some(e=>e.kind==='personal-attack'&&
   e.text.startsWith('Guarda atacou Atacante (Pontaria)'))).toBe(true);
 });
});
