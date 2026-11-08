import {describe,expect,it} from 'vitest';
import {parseDndCormyr300,applyDndCombatOverrides,
 dndCormyrCreature} from '@/lib/crusade/dnd-cormyr-300';
import {applyDndVerifiedRows} from '@/lib/crusade/dnd-verified-sources';

const original=()=>parseDndCormyr300(JSON.stringify({
 metadata:{catalog:'Teste fictício',count:300,version:1},
 monsters:Array.from({length:300},(_,i)=>({
  id:'test-'+String(i).padStart(3,'0'),
  name:'Criatura fictícia '+i,group:'Dragões',source:'Original',
  challenge_rating:1,hp:10,ac:12,size:'M',speed_ft:0,
  melee:{bonus:3,damage:'1d6+1',name:'Golpe'},ranged:null,
 })),
}));
const rows=()=>Array.from({length:300},(_,i)=>({
 monster_id:'test-'+String(i).padStart(3,'0'),
 combat_defaults:{dex_mod:3,fly_ft:40,melee_damage_type:'piercing',
  review_source:'Material de teste original'},
}));
describe('Fonte privada revisada: sem tocar na base ou nos overrides do Narrador',()=>{
 it('aplica 300 dados-fonte validados, mantendo a origem imutável',()=>{
  const base=original();
  const result=applyDndVerifiedRows(base,rows());
  expect(base.monsters[0]?.dex_mod).toBeUndefined();
  expect(result.monsters[0]?.dex_mod).toBe(3);
  const creature=dndCormyrCreature(result.monsters[0]!);
  expect(creature.speedFt.fly).toBe(40);
  expect(creature.abilityMods.dex).toBe(3);
  expect(creature.attacks[0]?.damage[0]?.type).toBe('piercing');
 });
 it('o Narrador tem precedência sobre fonte verificada',()=>{
  const fromZip=applyDndVerifiedRows(original(),rows());
  const edited=applyDndCombatOverrides(fromZip,[{
   monsterId:'test-000',patch:{fly_ft:70,dex_mod:5,melee_damage_type:'fire'},
  }]);
  const creature=dndCormyrCreature(edited.monsters[0]!);
  expect(creature.speedFt.fly).toBe(70);
  expect(creature.abilityMods.dex).toBe(5);
  expect(creature.attacks[0]?.damage[0]?.type).toBe('fire');
 });
 it('recusa falta, duplicação, ID desconhecido ou propriedades inválidas',()=>{
  const base=original(),entries=rows();
  expect(()=>applyDndVerifiedRows(base,entries.slice(0,299))).toThrow(/300/);
  const duplicate=rows();duplicate[1]!.monster_id='test-000';
  expect(()=>applyDndVerifiedRows(base,duplicate)).toThrow(/duplicado/);
  const unknown=rows();unknown[1]!.monster_id='unknown';
  expect(()=>applyDndVerifiedRows(base,unknown)).toThrow(/desconhecido/);
  const invalid=rows();invalid[1]!.combat_defaults={dex_mod:100} as never;
  expect(()=>applyDndVerifiedRows(base,invalid)).toThrow();
 });
});
