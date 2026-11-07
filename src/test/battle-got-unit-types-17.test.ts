import {describe,expect,it} from 'vitest';
import {WAR_MODEL_UNIT_TYPES,modelWarUnit} from '@/lib/battle/got/models';
import {UNIT_EQUIPMENT} from '@/lib/house/equipment';
import {UNIT_TYPES} from '@/lib/house/engine';

describe('Capítulo 10 — as 17 categorias de unidade de guerra do livro',()=>{
 it('todas as categorias de equipamento inicial da Casa possuem unidade-modelo',()=>{
  const ids=WAR_MODEL_UNIT_TYPES.map(row=>row.id);
  expect(ids).toHaveLength(17);
  expect(new Set(ids).size).toBe(17);
  expect(ids.slice().sort()).toEqual(UNIT_EQUIPMENT.map(row=>row.id).sort());
  expect(ids.slice().sort()).toEqual(UNIT_TYPES.map(row=>row.id).sort());
 });
 it('os 17 modelos têm atributos e Saúde do livro, sem usar registros das Casas',()=>{
  for(const [i,row] of WAR_MODEL_UNIT_TYPES.entries()){
   const unit=modelWarUnit({id:'unit-'+i,name:row.label,side:'attacker',
    typeId:row.id,position:{x:i%8,y:Math.floor(i/8)}});
   const equip=UNIT_EQUIPMENT.find(e=>e.id===row.id)!.initial;
   expect(unit.typeId).toBe(row.id);
   expect(unit.armor).toBe(equip.armor);
   expect(unit.bulk).toBe(equip.bulk);
   expect(unit.maxHealth).toBe(unit.ability.endurance*3);
   expect(unit.health).toBe(unit.maxHealth);
   expect(unit.defense).toBe(unit.ability.agility+
    unit.ability.athletics+unit.ability.awareness-equip.penalty);
   expect(unit.source.kind).toBe('model');
   expect(unit.position).toEqual({x:i%8,y:Math.floor(i/8)});
  }
 });
 it('navios usam regras navais, cavalaria usa movimento montado',()=>{
  const unit=(id:'warships'|'cavalry'|'sailors')=>modelWarUnit({
   id,name:id,side:'attacker',typeId:id,position:{x:0,y:0},
  });
  expect(unit('warships')).toMatchObject({naval:true,mounted:false,range:'long'});
  expect(unit('cavalry')).toMatchObject({mounted:true,naval:false,range:'none'});
  expect(unit('sailors')).toMatchObject({naval:false,mounted:false,range:'none'});
 });
});
