import {describe,it,expect} from 'vitest';
import {terrainAt,terrainEffect,movementSlow,visibilityPenalty,terrainHighGround} from '@/lib/battle/got/terrain';
import {WAR_FORMATIONS,attackAngle,angleAttackBonus,formationAllowed,formationMovement} from '@/lib/battle/got/formations';
import {createWarBattle,issueWarOrder} from '@/lib/battle/got/engine';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';

const make=(advancedFormations:boolean,tiles:readonly {x:number;y:number;terrain:'river'|'forest'|'mountain'|'hill'}[]=[])=>{
 const armies=[
  modelWarUnit({id:'a',name:'A',side:'attacker',typeId:'infantry',training:'elite',position:{x:2,y:3}}),
  modelWarUnit({id:'d',name:'D',side:'defender',typeId:'infantry',training:'elite',position:{x:7,y:3}}),
 ];
 return createWarBattle({id:'t',name:'Terreno',seed:'test',width:12,height:7,advancedFormations,
  commanders:modelWarCommanders({attacker:6,defender:6}),units:armies,
  tiles:tiles.map(tile=>tile.terrain==='forest'?{...tile,terrain:'dense-forest'}:tile) as
  readonly import('@/lib/battle/got/terrain').WarTerrainTile[]});
};
describe('Terreno e formações opcionais do livro',()=>{
 it('terreno ausente é planície; um rio exige ponte, neve reduz visibilidade',()=>{
  expect(terrainAt([],{x:2,y:2}).terrain).toBe('plain');
  expect(terrainEffect({x:0,y:0,terrain:'river'}).blocked).toBe(true);
  expect(terrainEffect({x:0,y:0,terrain:'river',bridge:true}).blocked).toBe(false);
  expect(movementSlow({x:1,y:1,terrain:'mountain'},'clear','clear')).toBe(2);
  expect(visibilityPenalty('clear','heavy-snow',true)).toBeGreaterThan(0);
  expect(terrainHighGround({x:1,y:1,terrain:'mountain'},{x:2,y:2,terrain:'plain'})).toBe(2);
 });
 it('proteções e deslocamento de todas as formações são dados explícitos',()=>{
  expect(WAR_FORMATIONS['shield-wall'].meleeDefense).toBe(5);
  expect(WAR_FORMATIONS['shield-wall'].move).toBe('immobile');
  expect(WAR_FORMATIONS['tortoise'].noAttack).toBe(true);
  expect(WAR_FORMATIONS['wedge'].chargeBonus).toBe(1);
  expect(formationAllowed('phalanx',{mounted:true,naval:false})).toBe(false);
  expect(formationMovement(40,'shield-wall')).toBe(0);
  expect(formationMovement(40,'phalanx')).toBe(20);
  expect(formationMovement(40,'battle')).toBe(30);
 });
 it('orientação determina flanco e retaguarda sem depender do motor PTE',()=>{
  expect(attackAngle({x:0,y:3},{x:1,y:3},'east')).toBe('rear');
  expect(attackAngle({x:2,y:3},{x:1,y:3},'east')).toBe('front');
  expect(attackAngle({x:1,y:2},{x:1,y:3},'east')).toBe('flank');
  expect(angleAttackBonus('rear',false,false)).toEqual({bonusDice:0,testDice:1});
  expect(angleAttackBonus('rear',true,true)).toEqual({bonusDice:0,testDice:0});
 });
 it('uma formação exige a regra opcional habilitada, e não é inventada no básico',()=>{
  const base={...make(false),turn:'attacker' as const};
  expect(()=>issueWarOrder(base,{commanderId:'leader-attacker',unitId:'a',
   order:{kind:'formation',formation:'shield-wall'}})).toThrow(/Formação/);
  const advanced={...make(true),turn:'attacker' as const};
  const result=issueWarOrder(advanced,{commanderId:'leader-attacker',unitId:'a',
   order:{kind:'formation',formation:'column'}});
  expect(result.difficulty).toBe(0);
  expect(result.battle.units.find(u=>u.id==='a')?.formation).toBe('column');
 });
 it('muralha bloqueia marcha e não gasta uma ordem em destino inválido',()=>{
  const tiles=Array.from({length:7},(_,y)=>({x:3,y,terrain:'river' as const}));
  const b={...make(false,tiles),turn:'attacker' as const};
  expect(()=>issueWarOrder(b,{commanderId:'leader-attacker',unitId:'a',
   order:{kind:'move',to:{x:5,y:3}}})).toThrow(/inacessível/);
  expect(b.ordersRemaining['leader-attacker']).toBe(6);
 });
});
