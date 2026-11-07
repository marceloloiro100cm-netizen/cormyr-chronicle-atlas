import {describe,it,expect} from 'vitest';
import {createWarBattle,completeWarHeroPhase} from '@/lib/battle/got/engine';
import {makeModelWarHero,executeWarHeroAction} from '@/lib/battle/got/heroes';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';

function example(separation=1){
 const a=makeModelWarHero({id:'h-a',name:'Guerreiro A',side:'attacker',position:{x:2,y:5}});
 const d=makeModelWarHero({id:'h-d',name:'Guerreiro D',side:'defender',position:{x:2,y:5}});
 return createWarBattle({id:'personal',name:'Combate pessoal',seed:'capitulo-9',
  width:12,height:7,commanders:modelWarCommanders({attacker:6,defender:6}),
  units:[
   modelWarUnit({id:'a',name:'A',side:'attacker',position:{x:1,y:3},typeId:'infantry'}),
   modelWarUnit({id:'d',name:'D',side:'defender',position:{x:10,y:3},typeId:'infantry'}),
  ],
  heroes:[
   {...a,meleeDamage:4,fighting:12,personalPosition:{x:25,y:55}},
   {...d,armor:0,defense:0,personalPosition:{x:25+separation,y:55}},
  ],
 });
}
describe('Guerra dos Tronos — capítulo 9 dentro das janelas de heróis',()=>{
 it('usa escala de 1 m; Luta x Defesa, grau de sucesso e redução de Saúde sem morte automática',()=>{
  const b=example();
  const before=JSON.stringify(b);
  const after=executeWarHeroAction(b,{heroId:'h-a',action:{
   kind:'personal-attack',targetHeroId:'h-d',
  }});
  expect(after.events.some(e=>e.kind==='personal-attack'&&e.degrees!>0)).toBe(true);
  expect(after.heroes.find(h=>h.id==='h-d')?.active).toBe(false);
  expect(after.heroes.find(h=>h.id==='h-d')?.health).toBe(0);
  expect(after.heroes.find(h=>h.id==='h-a')?.minorActionsUsed).toBe(1);
  expect(JSON.stringify(b)).toBe(before);
 });
 it('rejeita corpo a corpo além de um metro, permite Pontaria a distância',()=>{
  const b=example(5);
  expect(()=>executeWarHeroAction(b,{heroId:'h-a',action:{
   kind:'personal-attack',targetHeroId:'h-d',
  }})).toThrow(/adjacente/);
  const ranged=executeWarHeroAction(b,{heroId:'h-a',action:{
   kind:'personal-attack',targetHeroId:'h-d',ranged:true,
  }});
  expect(ranged.events.some(e=>e.kind==='personal-attack'&&e.text.includes('Pontaria'))).toBe(true);
 });
 it('consome até duas ações menores num turno ou uma ação maior',()=>{
  const b=example(4);
  const step=executeWarHeroAction(b,{heroId:'h-a',action:{
   kind:'personal-move',toMetres:{x:27,y:55},
  }});
  expect(step.heroes.find(h=>h.id==='h-a')?.usedActions).toBe(0);
  expect(step.heroes.find(h=>h.id==='h-a')?.minorActionsUsed).toBe(1);
  expect(()=>executeWarHeroAction(step,{heroId:'h-a',action:{kind:'personal-dodge'}}))
   .toThrow(/ação maior/);
  const next=executeWarHeroAction(step,{heroId:'h-a',action:{
   kind:'personal-attack',targetHeroId:'h-d',ranged:true,
  }});
  expect(next.heroes.find(h=>h.id==='h-a')?.usedActions).toBe(1);
  expect(next.heroes.find(h=>h.id==='h-a')?.minorActionsUsed).toBe(0);
 });
 it('esquiva substitui defesa; recuperação e rendição não gravam consequência oficial',()=>{
  const b=example();
  const guarded=executeWarHeroAction(b,{heroId:'h-d',action:{kind:'personal-dodge'}});
  expect(guarded.heroes.find(h=>h.id==='h-d')?.dodgeDefense).toBeTypeOf('number');
  expect(guarded.heroes.find(h=>h.id==='h-d')?.usedActions).toBe(1);
  const recovered=executeWarHeroAction({...b,heroes:b.heroes.map(h=>h.id==='h-a'?{
   ...h,health:4,
  }:h)},{heroId:'h-a',action:{kind:'personal-recover'}});
  expect(recovered.heroes.find(h=>h.id==='h-a')?.health).toBeGreaterThanOrEqual(4);
  const surrendered=executeWarHeroAction(b,{heroId:'h-a',action:{kind:'personal-surrender'}});
  expect(surrendered.heroes.find(h=>h.id==='h-a')?.surrendered).toBe(true);
  expect(surrendered.heroes.find(h=>h.id==='h-a')?.active).toBe(false);
 });
 it('impede travessia de obstáculo, preserva semente em ação inválida e conclui a janela',()=>{
  const b=example();
  const impeded={...b,tiles:[{x:3,y:5,terrain:'wall' as const}]};
  expect(()=>executeWarHeroAction(impeded,{heroId:'h-a',action:{
   kind:'personal-move',toMetres:{x:35,y:55},
  }})).toThrow();
  expect(impeded.heroes.find(h=>h.id==='h-a')?.usedActions).toBe(0);
  const ended=executeWarHeroAction(b,{heroId:'h-a',action:{
   kind:'personal-move',toMetres:{x:26,y:55},
  }});
  const full=executeWarHeroAction(ended,{heroId:'h-a',action:{kind:'personal-end-turn'}});
  expect(full.heroes.find(h=>h.id==='h-a')?.usedActions).toBe(1);
  const phase=completeWarHeroPhase(full);
  expect(phase.phase).toBe('orders');
 });
});
