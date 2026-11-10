import {describe,expect,it} from 'vitest';
import {warShieldWallAllyCover} from '@/lib/battle/got/shield-cover';
import {createWarBattle} from '@/lib/battle/got/engine';
import {modelWarCommanders} from '@/lib/battle/got/models';
import {previewWarAftermath} from '@/lib/battle/got/aftermath';
import {previewWarResourceConsequences} from '@/lib/battle/got/aftermath-resources';
import {serializeWarAftermathReview} from '@/lib/battle/got/aftermath-review';
import {recordWarParley} from '@/lib/battle/got/parley';
import {modelWarUnit} from '@/lib/battle/got/models';
import {nextWarLabDeploymentSide,positionWarLabUnit} from '@/lib/battle/got/lab-positioning';

const unit=(id:string,side:'attacker'|'defender',x:number,y:number)=>
 modelWarUnit({id,name:id,side,typeId:'infantry',training:'trained',position:{x,y}});

describe('P2 — proteção espacial opcional GoT',()=>{
 const attacker=unit('enemy','attacker',1,3);
 const wall={...unit('wall','defender',3,3),formation:'shield-wall' as const,
  facing:'west' as const};
 const behind=unit('behind','defender',4,3);
 const battle={advancedFormations:true,units:[attacker,wall,behind]};
 it('protege aliado adjacente atrás contra Pontaria, sem acumular',()=>{
  expect(warShieldWallAllyCover(battle,attacker,behind,true)).toBe(5);
  expect(warShieldWallAllyCover({...battle,units:[...battle.units,{...wall,id:'wall2',position:{x:3,y:4}}]},attacker,behind,true)).toBe(5);
 });
 it('não altera Luta, flanco, retaguarda, derrotados ou modo básico',()=>{
  expect(warShieldWallAllyCover(battle,attacker,behind,false)).toBe(0);
  expect(warShieldWallAllyCover({...battle,advancedFormations:false},attacker,behind,true)).toBe(0);
  expect(warShieldWallAllyCover({...battle,units:[attacker,{...wall,condition:'destroyed'},behind]},attacker,behind,true)).toBe(0);
  expect(warShieldWallAllyCover(battle,{...attacker,position:{x:3,y:1}},behind,true)).toBe(0);
  expect(warShieldWallAllyCover(battle,attacker,{...behind,position:{x:2,y:3}},true)).toBe(0);
 });
});

describe('P2 — implantação alternada é apenas preparação',()=>{
 it('alternância atacante, defensor e mantém posições não alteradas',()=>{
  expect(nextWarLabDeploymentSide(0,{})).toBe('defender');
  const d=positionWarLabUnit(0,{},'defender-1',{x:9,y:2});
  expect(nextWarLabDeploymentSide(0,d)).toBe('attacker');
  const a=positionWarLabUnit(0,d,'attacker-1',{x:2,y:2});
  expect(nextWarLabDeploymentSide(0,a)).toBe('defender');
  const d2=positionWarLabUnit(0,a,'defender-2',{x:9,y:4});
  expect(nextWarLabDeploymentSide(0,d2)).toBe('attacker');
  const done=positionWarLabUnit(0,d2,'attacker-2',{x:2,y:4});
  expect(nextWarLabDeploymentSide(0,done)).toBeNull();
  expect(done['attacker-1']).toEqual({x:2,y:2});
  expect(a['attacker-1']).toEqual({x:2,y:2});
 });
});

describe('P2 — relatório de campanha é apenas exportação para revisão',()=>{
 it('contém status pendente e nunca altera recursos ou fichas da simulação',()=>{
  const initial=createWarBattle({id:'review-123',name:'Treino seguro',
   seed:'review-seed',width:12,height:7,
   commanders:modelWarCommanders({attacker:5,defender:4}),
   units:[unit('att','attacker',2,2),unit('def','defender',9,2)]});
  const battle={...initial,phase:'finished' as const,winner:'attacker' as const};
  const before=JSON.stringify(battle);
  const aftermath=previewWarAftermath(battle);
  const resources=previewWarResourceConsequences(battle,{
   occupiedDomain:false,garrisonHeldForThreeMonths:false,
   capturedLandValue:0,survivingFortDefenseValue:0,
   domainHasCommunityOrFort:false,transferredWealthInvestments:0,
  });
  const exported=JSON.parse(serializeWarAftermathReview(battle,aftermath,resources));
  expect(exported.status).toBe('PENDING_NARRATOR_APPROVAL');
  expect(exported.appliedToHouse).toBe(false);
  expect(exported.aftermath.appliedToHouse).toBe(false);
  expect(exported.resources.appliedToHouse).toBe(false);
  expect(exported.battle.id).toBe(battle.id);
  expect(JSON.stringify(battle)).toBe(before);
 });
});

describe('P2 — parlamento narrativo anterior às ordens',()=>{
 it('registra proposta sem consumir seed, mudar casas ou emitir rolagens',()=>{
  const original=createWarBattle({id:'parley-test',name:'Trégua',
   seed:'seed-parley',width:12,height:7,
   commanders:modelWarCommanders({attacker:5,defender:4}),
   units:[unit('att','attacker',2,2),unit('def','defender',9,2)]});
  const snapshot=JSON.stringify(original);
  expect(recordWarParley(original,'none')).toBe(original);
  const proposed=recordWarParley(original,'truce-proposal','Corredor seguro');
  expect(proposed.events).toHaveLength(original.events.length+1);
  expect(proposed.events.slice(1).every(e=>e.kind==='initiative')).toBe(true);
  expect(proposed.events[0]).toMatchObject({kind:'parley',side:null,seq:1});
  expect(proposed.events[0]?.text).toContain('Corredor seguro');
  expect(proposed.seed).toBe(original.seed);
  expect(proposed.units).toBe(original.units);
  expect(JSON.stringify(original)).toBe(snapshot);
  expect(()=>recordWarParley(proposed,'betrayal-report')).toThrow(/antes/);
 });
});
