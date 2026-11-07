import {describe,expect,it} from 'vitest';
import {createWarBattle} from '@/lib/battle/got/engine';
import {previewWarResourceConsequences} from '@/lib/battle/got/aftermath-resources';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import {makeModelWarHero} from '@/lib/battle/got/heroes';
import type {WarBattle} from '@/lib/battle/got/types';
function finished():WarBattle{
 const battle=createWarBattle({id:'postwar',name:'Cerco encerrado',seed:'postwar-seed',
  width:12,height:7,commanders:modelWarCommanders({attacker:4,defender:4}),
  units:[
   modelWarUnit({id:'a',name:'Atacantes',side:'attacker',typeId:'infantry',
    position:{x:2,y:3}}),
   modelWarUnit({id:'d',name:'Defensores',side:'defender',typeId:'garrison',
    position:{x:5,y:3}}),
  ],heroes:[{...makeModelWarHero({id:'prisoner',name:'Lorde capturado',
   side:'defender',position:{x:5,y:3}}),status:4,defeatOutcome:'captured'}]});
 return {...battle,phase:'finished',winner:'attacker'};
}
const scenario={
 occupiedDomain:true,garrisonHeldForThreeMonths:false,
 capturedLandValue:6,survivingFortDefenseValue:3,
 domainHasCommunityOrFort:true,transferredWealthInvestments:2,
} as const;
describe('Capítulo 10, passo onze — proposta de recursos e prisioneiros',()=>{
 it('aplica consequências em ambos os lados sem afetar fichas reais',()=>{
  const b=finished(),snapshot=JSON.stringify(b);
  const x=previewWarResourceConsequences(b,scenario);
  expect(x.appliedToHouse).toBe(false);
  expect(x.attacker.land).toBe(6);
  expect(x.defender.land).toBe(-6);
  expect(x.attacker.defense).toBe(3);
  expect(x.defender.defense).toBe(-3);
  expect(x.attacker.wealth+x.defender.wealth).toBeLessThanOrEqual(0);
  expect(x.attacker.wealth+x.defender.wealth).toBeGreaterThanOrEqual(-12);
  expect(x.attacker.law).toBeLessThan(0);
  expect(x.defender.law).toBeLessThan(0);
  expect(x.captured).toEqual([{heroId:'prisoner',name:'Lorde capturado',
   side:'defender',status:4,ransomWealth:4}]);
  expect(x.occupationMonthsRequired).toBe(3);
  expect(x.occupationSecured).toBe(false);
  expect(x.notes.some(n=>n.includes('três meses'))).toBe(true);
  expect(JSON.stringify(b)).toBe(snapshot);
 });
 it('sem domínio ocupado mantém terras e riqueza, mas derrota ainda reduz Lei',()=>{
  const b=finished();
  const free=previewWarResourceConsequences(b,{
   ...scenario,occupiedDomain:false,garrisonHeldForThreeMonths:false,
   capturedLandValue:0,survivingFortDefenseValue:0,
   transferredWealthInvestments:0,
  });
  expect(free.attacker.land).toBe(0);
  expect(free.defender.land).toBe(0);
  expect(free.attacker.wealth).toBe(0);
  expect(free.defender.wealth).toBe(0);
  expect(free.defender.law).toBeLessThan(0);
  expect(free.attacker.law).toBe(0);
 });
 it('não permite transferir domínio inexistente nem valores inválidos',()=>{
  const b=finished();
  expect(()=>previewWarResourceConsequences(b,{...scenario,
   occupiedDomain:false})).toThrow(/domínio ocupado/);
  expect(()=>previewWarResourceConsequences(b,{...scenario,
   capturedLandValue:-1})).toThrow(/não negativos/);
 });
 it('cenário é determinístico para mesma seed e combate',()=>{
  const b=finished();
  expect(previewWarResourceConsequences(b,scenario))
   .toEqual(previewWarResourceConsequences(b,scenario));
  expect(previewWarResourceConsequences(b,{...scenario,
   garrisonHeldForThreeMonths:true}).occupationSecured).toBe(true);
 });
 it('combate não concluído não produz consequências oficiais',()=>{
  const b=finished();
  expect(()=>previewWarResourceConsequences({...b,phase:'orders'},scenario))
   .toThrow(/encerrada/);
 });
 it('sem vencedor não transfere recursos',()=>{
  const b={...finished(),winner:null};
  const preview=previewWarResourceConsequences(b,scenario);
  expect(preview.attacker).toEqual({law:0,population:0,wealth:0,land:0,defense:0});
  expect(preview.defender).toEqual({law:0,population:0,wealth:0,land:0,defense:0});
 });
});
