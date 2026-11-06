import {describe,it,expect} from 'vitest';
import {crzPreset,crzRulesetHash,crzCanonical,CRZ_APPROVED_HASHES,
 CRZ_PRESET_IDS,crzRequireKnownRuleset,crzRulesetSchema} from '@/lib/crusade/ruleset';
import {crzMakeStack,crzApplyDamage,crzHeal,crzSplitStack,crzMaxCount}
 from '@/lib/crusade/stack';
import {crzHitFactorBP,crzExpected5e,crzRolled5e,
 crzWotrExpected,crzAoEExpected,type CrzAttackEntry} from '@/lib/crusade/damage';
import {crzPcg32,CRZ_RNG_VERSION} from '@/lib/crusade/rng';
const rule=crzPreset('CRZ-5E');
const p=(count:number,sides:number,mod:number)=>({
 type:'piercing',dice:{count,sides},mod,mitigation:'normal' as const,
});
const attack=(toHit:number,diceCount:number,die:number,mod:number,count=1):CrzAttackEntry=>({
 id:'strike-'+toHit+'-'+die,count,toHit,parts:[p(diceCount,die,mod)],
});
const target=(count:number,hp:number)=>crzMakeStack({
 id:'t',size:'M',count,hpPerCreature:hp,ruleset:rule,
});
describe('CRZ-1.0 · lotes 1–2, contratos e goldens normativos dos anexos',()=>{
 it('mantém três presets e SHA-256 conhecido; difere do PTE legado',()=>{
  expect(CRZ_PRESET_IDS).toEqual(['CRZ-5E','CRZ-WOTR','PTE-2.0-compat']);
  const hashes=new Set<string>();
  for(const id of CRZ_PRESET_IDS){
   const preset=crzPreset(id);
   expect(preset.rulesVersion).toBe('CRZ-1.0');
   expect(preset.grid.sizes).toEqual([[11,9],[15,11]]);
   const h=crzRulesetHash(preset);
   expect(h).toBe(CRZ_APPROVED_HASHES[id]);
   expect(h).toMatch(/^[0-9a-f]{64}$/);
   hashes.add(h);
   expect(crzRequireKnownRuleset(id,h)).toEqual(preset);
   expect(()=>crzRequireKnownRuleset(id,'0'.repeat(64))).toThrow(/rulesetHash/);
   expect(crzCanonical({b:2,a:1})).toBe(crzCanonical({a:1,b:2}));
  }
  expect(hashes.size).toBe(3);
  expect(rule.damage).toMatchObject({resolution:'hybrid',overkill:'cap',mitigation:'damage-type'});
  expect(crzPreset('CRZ-WOTR').damage).toMatchObject({resolution:'wotr',overkill:'carry'});
  expect(crzPreset('PTE-2.0-compat').wait.order).toBe('fifo');
  expect(crzRulesetSchema.safeParse({...rule,extra:'inventado'}).success).toBe(false);
 });
 it('aplica tetos por tamanho, sem criar criaturas não recebidas do catálogo 05',()=>{
  expect(crzMaxCount(rule,'L')).toBe(400);
  expect(crzMaxCount(rule,'H')).toBe(100);
  expect(crzMaxCount(rule,'G')).toBe(25);
  expect(crzMaxCount(crzPreset('CRZ-WOTR'),'G')).toBe(1000);
  expect(()=>crzMakeStack({id:'G',size:'G',count:26,hpPerCreature:10,ruleset:rule}))
   .toThrow(/E_SETUP_COUNT/);
 });
 it('T-PIL-01: 100 atacantes +4, 1d6+2 vs CA18 => 209; 19 baixas',()=>{
  const res=crzExpected5e({ruleset:rule,attackerCount:100,attackBonus:0,
   targetAc:18,target:target(20,11),entries:[attack(4,1,6,2)]});
  expect(res.breakdown[0]).toMatchObject({
   hitBP:3500,perAttackX100:209,expectedHitsX100:3500,totalX100:20900,
  });
  expect(res).toMatchObject({rawDamage:209,capHP:385,
   receipt:{damageApplied:209,casualties:19,stack:{alive:1,hpPool:11,topHp:11}}});
 });
 it('T-PIL-02: 20 atacantes +3, 1d8+1 vs CA15 => 53',()=>{
  const res=crzExpected5e({ruleset:rule,attackerCount:20,attackBonus:0,
   targetAc:15,target:target(20,7),entries:[attack(3,1,8,1)]});
  expect(res.breakdown[0]).toMatchObject({
   hitBP:4500,perAttackX100:269,expectedHitsX100:900,totalX100:5380,
  });
  expect(res.rawDamage).toBe(53);expect(res.capHP).toBe(63);
 });
 it('T-PIL-03: dragão sintético com multiattack 1 mordida + 2 garras => 47 bruto, 19 cap',()=>{
  const res=crzExpected5e({ruleset:rule,attackerCount:1,attackBonus:0,
   targetAc:15,target:target(20,7),entries:[
    {...attack(14,2,10,8),id:'bite'}, {...attack(14,2,6,8,2),id:'claws'},
   ]});
  expect(res.breakdown.map(x=>x.perAttackX100)).toEqual([1860,1460]);
  expect(res.rawDamage).toBe(47);
  expect(res.expectedHitsX100).toBe(285);
  expect(res.capHP).toBe(19);
  expect(res.receipt.damageApplied).toBe(19);
 });
 it('T-PIL-04: 1×1 gera 292 centésimos, apenas 2 PV de dano esperado',()=>{
  const res=crzExpected5e({ruleset:rule,attackerCount:1,attackBonus:0,
   targetAc:15,target:target(1,7),entries:[attack(4,1,6,2)]});
  expect(res.breakdown[0]!.perAttackX100).toBe(292);
  expect(res.rawDamage).toBe(2);
 });
 it('T-PIL-05: AoE 8d6 vs CD15, +2, meia no sucesso mata 24×9 PV',()=>{
  const res=crzAoEExpected({affected:24,averageDamageX100:2800,
   saveBonus:2,dc:15,saveEffect:'half',target:target(24,9)});
  expect(res).toMatchObject({failBP:6000,perCreatureX100:2240,rawDamage:537,
   receipt:{damageApplied:216,casualties:24,stack:{alive:0,hpPool:0,topHp:0}}});
 });
 it('T-PIL-06: pool 220 –100 => 120, vivos 11, topo 10',()=>{
  const res=crzApplyDamage(target(20,11),100);
  expect(res).toMatchObject({damageApplied:100,casualties:9,
   stack:{hpPool:120,alive:11,topHp:10}});
 });
 it('T-PIL-07: cura 50 revive até 6, sem revive só 1',()=>{
  const wounded=crzApplyDamage(target(20,11),209).stack;
  expect(crzHeal(wounded,50,true)).toMatchObject({hpPool:61,alive:6,topHp:6});
  expect(crzHeal(wounded,50,false)).toMatchObject({hpPool:11,alive:1,topHp:11});
 });
 it('T-PIL-08/09: resist a 50=>25, e uma pilha única morre ao perder PV',()=>{
  const resist=crzApplyDamage(target(3,10),Math.floor(50/2));
  expect(resist).toMatchObject({damageApplied:25,casualties:2,
   stack:{hpPool:5,alive:1,topHp:5}});
  expect(crzApplyDamage(target(1,7),7).stack).toMatchObject({
   hpPool:0,alive:0,topHp:0,
  });
 });
 it('T-PIL-10: dividir 20 criaturas feridas em 12+8 preserva 197 PV',()=>{
  const wounded=crzApplyDamage(target(20,10),3).stack;
  const [a,b]=crzSplitStack(wounded,12,'a','b');
  expect([a.hpPool,b.hpPool]).toEqual([117,80]);
  expect(a.hpPool+b.hpPool).toBe(197);
  expect(a.topHp).toBe(7);expect(b.topHp).toBe(10);
 });
 it('T-INT-01 (03 §18): ataque 208, 13 mortos, retaliação 78 e 11 mortos',()=>{
  const orcs=target(30,15);
  const goblins=target(60,7);
  const first=crzExpected5e({ruleset:rule,attackerCount:60,attackBonus:0,
   targetAc:13,target:orcs,entries:[attack(4,1,6,2)]});
  expect(first.breakdown[0]).toMatchObject({hitBP:6000,
   perAttackX100:347,totalX100:20820});
  expect(first).toMatchObject({rawDamage:208,receipt:{
   casualties:13,stack:{hpPool:242,alive:17,topHp:2},
  }});
  const lossPct=Math.floor(100*first.receipt.casualties/30);
  expect(lossPct).toBe(43);
  const shakenAt=Math.max(20,Math.min(70,40+Math.floor(0/2)));
  expect(lossPct).toBeGreaterThanOrEqual(shakenAt);
  const retaliation=crzExpected5e({ruleset:rule,
   attackerCount:first.receipt.stack.alive,attackBonus:-2,
   targetAc:15,target:goblins,entries:[attack(5,1,12,3)]});
  expect(retaliation.breakdown[0]).toMatchObject({
   hitBP:4500,perAttackX100:459,totalX100:7803});
  expect(retaliation).toMatchObject({rawDamage:78,receipt:{
   casualties:11,stack:{hpPool:342,alive:49,topHp:6},
  }});
 });
 it('T-WOTR-01: 50 arqueiros, RD5, mult 0.9 vs CA22 => dano 59',()=>{
  const res=crzWotrExpected({ruleset:crzPreset('CRZ-WOTR'),
   attackerCount:50,attackBonus:10,targetAc:22,
   averageDamageX100:850,flatDr:5,baseMultiplierBP:9000,target:target(50,10)});
  expect(res.hitMultiplierBP).toBe(4500);
  expect(res.damage).toBe(59);
  expect(res.receipt.damageApplied).toBe(59);
 });
 it('fatores de acerto diferem entre os três presets sem compartilhar fórmulas',()=>{
  expect(crzHitFactorBP(rule,4,18)).toBe(3500);
  expect(crzHitFactorBP(rule,14,15)).toBe(9500);
  expect(crzHitFactorBP(crzPreset('CRZ-WOTR'),40,5)).toBeGreaterThan(10000);
  expect(crzHitFactorBP(crzPreset('PTE-2.0-compat'),4,4)).toBe(10000);
  expect(crzHitFactorBP(crzPreset('PTE-2.0-compat'),0,10)).toBe(6000);
 });
 it('PCG32 serializa estado e rolagem 5e usa mesmo seed, sem Math.random',()=>{
  const rng=crzPcg32('cafebeef');
  const a=rng.nextUint32(),snapshot=rng.state();
  const future=rng.nextUint32();
  expect(crzPcg32(snapshot).nextUint32()).toBe(future);
  expect(snapshot.version).toBe(CRZ_RNG_VERSION);
  expect(a).toBeGreaterThanOrEqual(0);
  const first=crzRolled5e({ruleset:rule,attackerCount:2,attackBonus:0,
   targetAc:15,target:target(10,7),entries:[attack(4,1,6,2)],
   rngState:crzPcg32('cafebeef').state()});
  const second=crzRolled5e({ruleset:rule,attackerCount:2,attackBonus:0,
   targetAc:15,target:target(10,7),entries:[attack(4,1,6,2)],
   rngState:crzPcg32('cafebeef').state()});
  expect(first).toEqual(second);
  expect(first.attacks).toBe(2);
  expect(first.receipt.casualties).toBeGreaterThanOrEqual(0);
 });
 it('nega inputs ruins e overflow antes de alterar o estado da pilha',()=>{
  const start=target(20,7),original=JSON.stringify(start);
  expect(()=>crzApplyDamage(start,-1)).toThrow();
  expect(()=>crzHeal(start,Number.MAX_SAFE_INTEGER,true)).not.toThrow();
  expect(()=>crzMakeStack({id:'x',size:'M',count:0,hpPerCreature:7,ruleset:rule})).toThrow();
  expect(()=>crzSplitStack(start,20,'a','b')).toThrow();
  expect(()=>crzExpected5e({ruleset:rule,attackerCount:1000,
   attackBonus:0,targetAc:15,target:start,entries:[attack(4,1,6,2)],damageBonusBP:50001}))
   .toThrow();
  expect(JSON.stringify(start)).toBe(original);
 });
});
