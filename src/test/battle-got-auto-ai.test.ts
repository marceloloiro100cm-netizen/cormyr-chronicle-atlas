import {describe,it,expect} from 'vitest';
import {createWarBattle} from '@/lib/battle/got/engine';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import {nextGotAiStep} from '@/lib/battle/got/auto-ai';

function fixture(){
 return createWarBattle({
  id:'got-ai-fixture',name:'Casas vs Casas',seed:'ia-duas-casas',
  width:12,height:7,
  units:[
   modelWarUnit({id:'a1',name:'Atacante',typeId:'infantry',side:'attacker',
    position:{x:3,y:3},training:'elite'}),
   modelWarUnit({id:'d1',name:'Defensor',typeId:'infantry',side:'defender',
    position:{x:4,y:3},training:'elite'}),
  ],
  commanders:modelWarCommanders({attacker:3,defender:3}),
 });
}
describe('Game of Thrones · IA dos dois lados',()=>{
 it('produz decisões reprodutíveis sem modificar a entrada nem sair do motor do livro',()=>{
  const battle=fixture();
  const original=JSON.stringify(battle);
  const one=nextGotAiStep(battle);
  const two=nextGotAiStep(battle);
  expect(one).toEqual(two);
  expect(JSON.stringify(battle)).toBe(original);
  expect(one.battle.rulesVersion).toBe('GOT-CH10-1');
  expect(one.battle.metresPerCell).toBe(10);
  expect(one.battle.events.length).toBeGreaterThan(battle.events.length);
 });
 it('alterna o comando entre os exércitos e conserva histórico auditável',()=>{
  let battle=fixture();
  const commanded=new Set<string>();
  for(let i=0;i<30&&battle.phase!=='finished';i++){
   const next=nextGotAiStep(battle);
   expect(next.needsNarrator).toBeFalsy();
   expect(next.battle).not.toBe(battle);
   battle=next.battle;
   for(const event of battle.events.filter(e=>e.kind==='command'&&e.side))
    commanded.add(event.side!);
   if(commanded.size===2)break;
  }
  expect(commanded).toEqual(new Set(['attacker','defender']));
  expect(battle.units.every(unit=>unit.source.kind==='model')).toBe(true);
 });
 it('não fabrica escolha do Narrador quando há dano pessoal pendente',()=>{
  const battle=fixture();
  const blocked={...battle,pendingPersonalDamage:{
   targetId:'hero',damage:2,source:'unit',actorName:'inimigo',
  }} as unknown as typeof battle;
  const result=nextGotAiStep(blocked);
  expect(result.needsNarrator).toBe(true);
  expect(result.battle).toBe(blocked);
 });
 it('não avança uma partida encerrada',()=>{
  const battle={...fixture(),phase:'finished' as const,winner:'attacker' as const};
  const result=nextGotAiStep(battle);
  expect(result.battle).toBe(battle);
 });
});
