import {describe,expect,it} from 'vitest';
import {createWarBattle,advanceWarRound,issueWarOrder} from '@/lib/battle/got/engine';
import {modelWarCommanders,modelWarUnit} from '@/lib/battle/got/models';
import {positionedWarLabDeployments,positionWarLabUnit} from '@/lib/battle/got/lab-positioning';
import {decodeGotLabSave,encodeGotLabSave,GOT_LAB_MAX_SAVE_BYTES} from '@/lib/battle/got/lab-save';

function sample(){
 return createWarBattle({id:'save-check',name:'Teste persistente',seed:'save-seed',
  width:12,height:7,commanders:modelWarCommanders({attacker:12,defender:12}),
  units:[
   modelWarUnit({id:'a',name:'A',side:'attacker',typeId:'infantry',position:{x:2,y:3}}),
   modelWarUnit({id:'d',name:'D',side:'defender',typeId:'infantry',position:{x:4,y:3}}),
  ]});
}
describe('Simulação do livro — salvar, retomar e posicionar',()=>{
 it('salva rodada com sequência e seed idênticos, sem mutação de tropas',()=>{
  let b=sample();
  b=issueWarOrder({...b,turn:'attacker'},{
   commanderId:'leader-attacker',unitId:'a',
   order:{kind:'defend'},
  }).battle;
  b=advanceWarRound(b);
  const before=JSON.stringify(b);
  const loaded=decodeGotLabSave(encodeGotLabSave(b));
  expect(loaded).toEqual(b);
  expect(loaded.round).toBe(2);
  expect(loaded.rulesVersion).toBe('GOT-CH10-1');
  expect(JSON.stringify(b)).toBe(before);
 });
 it('retomada também preserva fase de cerco, condições e fogo',()=>{
  const b=sample();
  const altered={...b,phase:'siege' as const,
   units:b.units.map(u=>u.id==='a'?{...u,burning:{
    remainingRounds:3,damagePerRound:7,source:'Fogo do cerco',
   }}:u)};
  expect(decodeGotLabSave(encodeGotLabSave(altered))).toEqual(altered);
 });
 it('bloqueia versão, IDs, HP, posições, tamanho e eventos adulterados',()=>{
  const base=sample();
  const copy=(change:Record<string,unknown>)=>JSON.stringify({...base,...change});
  expect(()=>decodeGotLabSave(copy({rulesVersion:'ADAPTED'}))).toThrow(/não é compatível/);
  expect(()=>decodeGotLabSave(copy({units:[base.units[0],base.units[0]]}))).toThrow(/não é compatível/);
  expect(()=>decodeGotLabSave(copy({units:base.units.map(u=>({...u,health:9999}))}))).toThrow(/não é compatível/);
  expect(()=>decodeGotLabSave(copy({events:[{seq:4,text:'invalid'}]}))).toThrow(/não é compatível/);
  expect(()=>decodeGotLabSave('{"x":')).toThrow(/JSON/);
  expect(()=>decodeGotLabSave('x'.repeat(GOT_LAB_MAX_SAVE_BYTES+1))).toThrow(/1 MB/);
 });
 it('muda posicionamento sem alterar o catálogo original',()=>{
  const original=positionedWarLabDeployments(1,{});
  const moved=positionWarLabUnit(1,{},'attacker-3',{x:6,y:3});
  const planned=positionedWarLabDeployments(1,moved);
  expect(planned.find(u=>u.id==='attacker-3')?.position).toEqual({x:6,y:3});
  expect(original.find(u=>u.id==='attacker-3')?.position).not.toEqual({x:6,y:3});
  expect(planned).toHaveLength(6);
 });
 it('não permite colisões ou posições fora do tabuleiro',()=>{
  expect(()=>positionWarLabUnit(0,{},'attacker-1',{x:10,y:2}))
   .toThrow(/mesmo quadrado/);
  expect(()=>positionWarLabUnit(0,{},'attacker-1',{x:12,y:3}))
   .toThrow(/fora do campo/);
  expect(()=>positionWarLabUnit(0,{},'nonexistent',{x:2,y:4}))
   .toThrow(/Selecione uma tropa/);
  expect(()=>positionedWarLabDeployments(0,{'attacker-1':{x:1.5,y:2}}))
   .toThrow(/fora do campo/);
 });
 it('aceita duas tropas no mesmo quadrado apenas quando uma está destruída, ao retomar',()=>{
  const b=sample();
  const units=b.units.map(u=>u.id==='d'?{
   ...u,condition:'destroyed' as const,health:0,position:{x:2,y:3},
  }:u);
  const restored=decodeGotLabSave(encodeGotLabSave({...b,units}));
  expect(restored.units).toHaveLength(2);
 });
});
