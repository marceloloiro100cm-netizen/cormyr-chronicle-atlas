import {describe,it,expect} from 'vitest';
import {crzEventLabel,mostRecentAction,pteEventLabel,pteAiActionDescription}
 from '@/lib/battle/ux/action-explanation';
import type {BattleEvent,BattleStack} from '@/lib/battle/domain/types';
import type {CrzEvent} from '@/lib/crusade/battle-state';

describe('lote 8 — feedback apenas a partir de eventos resolvidos',()=>{
 it('mostra atacante e alvo no PTE, sem recomputar dano',()=>{
  const event={type:'DAMAGE',actorId:'narrator',delta:{
   attackerId:'a',defenderId:'b',damage:14,casualties:2},
   command:{type:'ATTACK',unitId:'a',targetId:'b'},round:2,seq:1} as BattleEvent;
  const stacks=[{id:'a',name:'Arqueiros'},{id:'b',name:'Goblins'}] as BattleStack[];
  expect(pteEventLabel(event,stacks)).toBe('Ataque · Arqueiros → Goblins');
 });
 it('identifica lado que sofreu retaliação e acerto no CRZ',()=>{
  const event={type:'RETALIATION_RESOLVED',unitId:'b',targetId:'a',
   appliedDamage:5,hits:1,attacks:1,crits:0,round:4,seq:2} as CrzEvent;
  expect(crzEventLabel(event,[{id:'a',name:'Lanceiros'},{id:'b',name:'Orcs'}]))
   .toBe('Retaliação · Orcs → Lanceiros');
 });
 it('pega última ação sem inverter nem mutar array original',()=>{
  const events=[{type:'MOVE'},{type:'ROUND_ENDED'},{type:'DAMAGE'}];
  expect(mostRecentAction(events,['MOVE','DAMAGE'])?.type).toBe('DAMAGE');
  expect(events.map(e=>e.type)).toEqual(['MOVE','ROUND_ENDED','DAMAGE']);
 });
 it('explica ação da IA com fatos observáveis',()=>{
  expect(pteAiActionDescription([{type:'MOVE'},{type:'ATTACK'},{type:'DEFEND'}]))
   .toBe('IA: 1 ataque(s) e 1 movimento(s) legais realizados.');
 });
});
