import {describe,it,expect} from 'vitest';
import {createWarBattle} from '@/lib/battle/got/engine';
import {makeModelWarHero} from '@/lib/battle/got/heroes';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import {recoveryDifficulty,rollPersonalRecovery,resolveLabRecovery,
 restoreOrdinaryDamageAfterBattle} from '@/lib/battle/got/personal-recovery';
function hero(){
 return {...makeModelWarHero({id:'h',name:'Convalescente',side:'attacker',
  position:{x:2,y:3}}),wounds:2,injuries:1,health:4,endurance:3};
}
function battle(){
 return createWarBattle({id:'recovery',name:'Convalescença',
  seed:'recovery-ch9',width:12,height:7,
  commanders:modelWarCommanders({attacker:4,defender:4}),
  units:[
   modelWarUnit({id:'a',name:'A',side:'attacker',typeId:'infantry',
    position:{x:2,y:2}}),
   modelWarUnit({id:'d',name:'D',side:'defender',typeId:'infantry',
    position:{x:8,y:2}}),
  ],
  heroes:[hero()],
 });
}
describe('Capítulo 9 — testes de recuperação em tempo narrativo',()=>{
 it('dificuldades de recuperação diária e semanal por atividade',()=>{
  expect(['rest','light','strenuous'].map(a=>
   recoveryDifficulty('daily-wound',a as 'rest'|'light'|'strenuous')))
   .toEqual([6,9,12]);
  expect(['rest','light','strenuous'].map(a=>
   recoveryDifficulty('weekly-injury',a as 'rest'|'light'|'strenuous')))
   .toEqual([9,15,21]);
 });
 it('rolagens determinísticas reduzem ferimentos diários mas não lesões simultaneamente',()=>{
  const h={...hero(),endurance:12,wounds:2,injuries:1};
  const a=rollPersonalRecovery(h,13,{interval:'daily-wound',activity:'rest'});
  const b=rollPersonalRecovery(h,13,{interval:'daily-wound',activity:'rest'});
  expect(a).toEqual(b);
  expect(a.hero.wounds).toBe(0);
  expect(a.hero.injuries).toBe(1);
  expect(h.wounds).toBe(2);
 });
 it('falha crítica sem curandeiro piora lesão; limite do Vigor causa morte',()=>{
  const h={...hero(),endurance:1,injuries:1};
  const result=rollPersonalRecovery({...h,injuries:0},1,{
   interval:'daily-wound',activity:'strenuous',
  });
  expect(result.critical).toBe(true);
  const weekly=rollPersonalRecovery(h,1,{interval:'weekly-injury',
   activity:'strenuous'});
  expect(weekly.critical).toBe(true);
  expect(weekly.hero.defeatOutcome).toBe('death');
  expect(weekly.hero.active).toBe(false);
 });
 it('tratamento requer 4 horas e não piora ferimentos em falha',()=>{
  expect(()=>rollPersonalRecovery(hero(),1,{interval:'daily-wound',
   activity:'strenuous',healer:{rank:2,hours:3}})).toThrow(/quatro horas/);
  const result=rollPersonalRecovery(hero(),1,{
   interval:'weekly-injury',activity:'strenuous',
   healer:{rank:1,hours:4},
  });
  expect(result.degrees).toBe(0);
  expect(result.hero.injuries).toBe(1);
 });
 it('não manipula relógio e só aplica recuperação após batalha, com auditoria',()=>{
  const original=battle();
  expect(()=>resolveLabRecovery(original,{heroId:'h',interval:'daily-wound',
   activity:'rest'})).toThrow(/encerrado/);
  const finished={...original,phase:'finished' as const};
  const out=resolveLabRecovery(finished,{heroId:'h',interval:'daily-wound',
   activity:'rest',healer:{rank:12,hours:4}});
  expect(out.heroes[0]?.wounds).toBe(0);
  expect(out.round).toBe(finished.round);
  expect(out.events.some(e=>e.kind==='hero-recovery')).toBe(true);
  const stable=restoreOrdinaryDamageAfterBattle(finished);
  expect(stable.heroes[0]?.health).toBe(9);
  expect(stable.heroes[0]?.wounds).toBe(2);
  expect(stable.heroes[0]?.injuries).toBe(1);
 });
});
