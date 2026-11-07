import {describe,it,expect} from 'vitest';
import {createWarBattle} from '@/lib/battle/got/engine';
import {makeModelWarHero} from '@/lib/battle/got/heroes';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import {applyWarFate,fateAvailable,restoreSpentFate,rollPersonalWithFate,
 consumePersonalFateRoll} from '@/lib/battle/got/personal-fate';
function sample(){
 return createWarBattle({id:'fate',name:'Destino capítulo 5',
  seed:'capitulo-5-destino',width:12,height:7,
  commanders:modelWarCommanders({attacker:4,defender:4}),
  units:[
   modelWarUnit({id:'a',name:'Infantaria A',side:'attacker',
    typeId:'infantry',position:{x:1,y:3}}),
   modelWarUnit({id:'d',name:'Infantaria D',side:'defender',
    typeId:'infantry',position:{x:9,y:3}}),
  ],
  heroes:[makeModelWarHero({id:'hero',name:'Herói',side:'attacker',
   position:{x:2,y:3}})],
 });
}
describe('Destino do capítulo 5 — livro e isolamento',()=>{
 it('gastar reduz disponível e guarda ponto recuperável sem alterar original',()=>{
  const battle=sample(),unchanged=JSON.stringify(battle);
  const result=applyWarFate(battle,{heroId:'hero',kind:'spend-bonus'});
  const hero=result.heroes[0]!;
  expect(hero.fateAvailable).toBe(1);
  expect(hero.fateSpent).toBe(1);
  expect(hero.fateBurned).toBe(0);
  expect(hero.fateBonusDice).toBe(1);
  expect(result.events.some(e=>e.kind==='hero-fate')).toBe(true);
  expect(JSON.stringify(battle)).toBe(unchanged);
 });
 it('o dado bônus e remoção de penalidade são consumidos no próximo teste',()=>{
  const original=sample().heroes[0]!;
  const boosted={...original,fateBonusDice:1,fatePenaltyReduction:1};
  const base=rollPersonalWithFate(77,original,3,0,2);
  const extra=rollPersonalWithFate(77,boosted,3,0,2);
  expect(extra.dice).toHaveLength(4);
  expect(extra.kept).toHaveLength(2);
  expect(extra.total).toBeGreaterThanOrEqual(base.total);
  const spent=consumePersonalFateRoll(boosted);
  expect(spent.fateBonusDice).toBe(0);
  expect(spent.fatePenaltyReduction).toBe(0);
 });
 it('queimar elimina gasto permanentemente; recuperação narrativa não ressuscita pontos queimados',()=>{
  const spent=applyWarFate(sample(),{heroId:'hero',kind:'spend-reduce-penalty'});
  const burned=applyWarFate(spent,{heroId:'hero',kind:'burn-clear-damage'});
  expect(fateAvailable(burned.heroes[0]!)).toBe(0);
  expect(burned.heroes[0]?.fateSpent).toBe(1);
  expect(burned.heroes[0]?.fateBurned).toBe(1);
  expect(()=>restoreSpentFate(burned,'hero')).toThrow(/após o confronto/);
  const refreshed=restoreSpentFate({...burned,phase:'finished'},'hero');
  expect(refreshed.heroes[0]?.fateAvailable).toBe(1);
  expect(refreshed.heroes[0]?.fateSpent).toBe(0);
  expect(refreshed.heroes[0]?.fateBurned).toBe(1);
 });
 it('queima permite escolher consequências ou evitar morte certa, sem ressuscitar',()=>{
  const battle=sample();
  const defeated={...battle,heroes:battle.heroes.map(h=>({
   ...h,active:false,health:0,defeatOutcome:'death' as const,
  }))};
  const avoided=applyWarFate(defeated,{heroId:'hero',kind:'burn-avoid-death'});
  expect(avoided.heroes[0]?.removedFromStory).toBe(true);
  expect(avoided.heroes[0]?.active).toBe(false);
  expect(avoided.heroes[0]?.defeatOutcome).toBe('escaped');
  const captive=applyWarFate(defeated,{heroId:'hero',kind:'burn-choose-defeat',
   outcome:'captured'});
  expect(captive.heroes[0]?.defeatOutcome).toBe('captured');
  expect(captive.heroes[0]?.active).toBe(false);
 });
 it('bloqueia Fate de combatentes comuns e gasto sem pontos',()=>{
  const b=sample();
  expect(()=>applyWarFate({...b,heroes:b.heroes.map(h=>({
   ...h,squadId:'milicia',
  }))},{heroId:'hero',kind:'spend-bonus'})).toThrow(/importantes/);
  expect(()=>applyWarFate({...b,heroes:b.heroes.map(h=>({
   ...h,fateAvailable:0,
  }))},{heroId:'hero',kind:'spend-bonus'})).toThrow(/não possui/);
 });
});
