import {describe,it,expect} from 'vitest';
import {advanceWarRound,completeWarHeroPhase,createWarBattle,issueWarOrder} from '@/lib/battle/got/engine';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import {executeWarHeroAction,makeModelWarHero} from '@/lib/battle/got/heroes';
import {makeWarFortification,fortDefense,WAR_FORT_PROFILES} from '@/lib/battle/got/fortifications';

function example(withHero=false){
 const troops=[
  modelWarUnit({id:'a',name:'Engenheiros A',side:'attacker',typeId:'engineers',
   training:'elite',position:{x:2,y:3}}),
  modelWarUnit({id:'d',name:'Infantaria D',side:'defender',typeId:'infantry',
   training:'elite',position:{x:4,y:3}}),
 ];
 return createWarBattle({
  id:'hero-fort',name:'Cerco modelo',seed:'fortificacao-modelo',width:12,height:7,
  commanders:modelWarCommanders({attacker:8,defender:8}),units:troops,
  ...(withHero?{heroes:[
   makeModelWarHero({id:'h-a',name:'Herói A',side:'attacker',position:{x:2,y:2}}),
   makeModelWarHero({id:'h-d',name:'Herói D',side:'defender',position:{x:4,y:2}}),
  ]}:{}),
 });
}
describe('Livro: passos de heróis e defesa das fortificações',()=>{
 it('respeita as duas janelas individuais de cinco rodadas, sem inventar combate capítulo 9',()=>{
  const b=example(true);
  expect(b.phase).toBe('heroes-first');
  expect(()=>issueWarOrder(b,{commanderId:'leader-attacker',unitId:'a',
   order:{kind:'ready'}})).toThrow(/fase|encerrada/i);
  const commands=completeWarHeroPhase(b);
  expect(commands.phase).toBe('orders');
  const heroes=advanceWarRound(commands);
  expect(heroes.phase).toBe('heroes-second');
  const done=completeWarHeroPhase(heroes);
  expect(done.round).toBe(2);
  expect(done.phase).toBe('heroes-first');
 });
 it('entrar em uma tropa oferece +1D uma única vez e reduz Disciplina em três',()=>{
  const b=example(true);
  const joined=executeWarHeroAction(b,{heroId:'h-a',action:{kind:'join',unitId:'a'}});
  expect(joined.heroes.find(h=>h.id==='h-a')?.unitId).toBe('a');
  const commands={...completeWarHeroPhase(joined),turn:'attacker' as const};
  const result=issueWarOrder(commands,{commanderId:'leader-attacker',unitId:'a',
   order:{kind:'ready'}});
  expect(result.difficulty).toBe(0);
  expect(result.battle.units.find(u=>u.id==='a')?.health).toBe(9);
 });
 it('herói em tropa não atua durante a primeira janela; sai na segunda e fica bloqueado',()=>{
  const b=example(true);
  const joined=executeWarHeroAction(b,{heroId:'h-a',action:{kind:'join',unitId:'a'}});
  expect(()=>executeWarHeroAction(joined,{heroId:'h-a',action:{kind:'leave'}})).toThrow();
  const step2=advanceWarRound(completeWarHeroPhase(joined));
  const leave=executeWarHeroAction(step2,{heroId:'h-a',action:{kind:'leave'}});
  expect(leave.heroes.find(h=>h.id==='h-a')?.unitId).toBeNull();
  expect(()=>executeWarHeroAction(leave,{heroId:'h-a',action:{kind:'join',unitId:'a'}})).toThrow();
 });
 it('fortificações permanentes seguem a tabela de +3/+4/+6/+8/+12 e capacidade',()=>{
  expect(Object.values(WAR_FORT_PROFILES).slice(0,5).map(x=>x.defense))
   .toEqual([3,4,6,8,12]);
  expect(Object.values(WAR_FORT_PROFILES).slice(0,5).map(x=>x.capacity))
   .toEqual([1,2,3,5,10]);
  const tower=makeWarFortification({id:'t',name:'Torre',side:'defender',kind:'tower',
   cells:[{x:4,y:3}],engineerBuilt:false,hoursBuilt:72});
  expect(fortDefense(tower)).toBe(3);
  expect(()=>makeWarFortification({id:'bad',name:'Trincheira',side:'defender',
   kind:'temporary',cells:[{x:4,y:3}],engineerBuilt:false,hoursBuilt:5})).toThrow(/seis horas/);
  const earth=makeWarFortification({id:'earth',name:'Trincheira',side:'defender',
   kind:'temporary',cells:[{x:4,y:3}],engineerBuilt:true,hoursBuilt:6});
  expect(fortDefense(earth)).toBe(2);
 });
 it('recusa fortalezas fora do tabuleiro e sabotagem de tropa não engenheira',()=>{
  const b=example();
  const fort=makeWarFortification({id:'wall',name:'Torre D',side:'defender',kind:'tower',
   cells:[{x:4,y:3}],engineerBuilt:false,hoursBuilt:24});
  expect(()=>createWarBattle({id:'x',name:'X',seed:'s',width:12,height:7,
   units:b.units,commanders:b.commanders,
   fortifications:[{...fort,cells:[{x:20,y:3}]}]})).toThrow(/fora do mapa/);
  const guarded={...b,fortifications:[fort],advancedFormations:true,
   turn:'defender' as const};
  expect(()=>issueWarOrder(guarded,{commanderId:'leader-defender',unitId:'d',
   order:{kind:'sabotage',fortId:'wall'}})).toThrow(/engenheiros/);
 });
});
