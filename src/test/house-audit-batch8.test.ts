import {describe,it,expect} from 'vitest';
import {newHouseState} from '@/lib/house/types';
import {balances,maxHouseStatus} from '@/lib/house/engine';
import {proposeVassal,approveVassal,endVassal} from '@/lib/house/military';
import {COURT_ROLES,assignCourt,removeCourtAssignment} from '@/lib/house/court';
import {isNarrativeNpc} from '@/lib/house/narrative-npc';
import {createVassal} from '@/lib/house/vassals';
describe('lote 8 — Corte e vassalagem',()=>{
 it('aprovação deduz penalidade registrada de Influência, afetando Status; fim restaura sem perder histórico',()=>{
  const s=newHouseState('main');s.base.influence=31;s.base.power=60;
  const proposed=proposeVassal(s,{id:'v1',houseId:'secondary',name:'Vassala',notes:'Acordo de proteção'});
  const approved=approveVassal(proposed,'v1',3);
  expect(balances(approved).total.influence).toBe(28);
  expect(balances(approved).available.power).toBe(40);
  expect(maxHouseStatus(balances(approved).total.influence)).toBe(4);
  const ended=endVassal(approved,'v1','Rompimento do vínculo autorizado pelo Narrador.');
  expect(balances(ended).total.influence).toBe(31);
  expect(balances(ended).available.power).toBe(60);
  expect(ended.vassals?.[0]?.status).toBe('ended');
  expect(ended.holdings.find(h=>h.id==='v1')?.status).toBe('abandoned');
  expect(ended.vassals?.[0]?.notes).toContain('Rompimento');
  expect(()=>endVassal(ended,'v1','Tentativa repetida e inválida.')).toThrow('não está ativa');
 });
 it('minificha de vassala usa cinco dados por recurso e mantém rolagens',()=>{
  const s=newHouseState('main');s.base.power=100;
  const rolls=Object.fromEntries(['defense','influence','lands','law','population','power','wealth'].map(r=>[r,[1,2,3,4,5]])) as Parameters<typeof createVassal>[2];
  const created=createVassal(s,{id:'v',name:'Secundária',region:'Crownlands',motto:'Vigilância',lordName:'Lorde'},rolls);
  expect(created.vassals?.[0]?.sheet?.base.defense).toBe(15);
 });
 it('Corte permite cargos expandidos e remoção sem apagar personagem',()=>{
  expect(COURT_ROLES.length).toBeGreaterThanOrEqual(15);
  const s=newHouseState('main');
  const next=assignCourt(s,{id:'entry',npcId:'npc',name:'Merrin Dask',role:'Comandante de Exército',notes:'Capitã'});
  expect(next.court).toHaveLength(1);
  expect(removeCourtAssignment(next,'entry').court).toHaveLength(0);
 });
 it('documentos técnicos de Ficha não entram no seletor da Corte',()=>{
  expect(isNarrativeNpc({kind:'character',title:'Ficha - Lorde',content:'Nome do Personagem: Senhor'})).toBe(false);
  expect(isNarrativeNpc({kind:'character',title:'Capitã da Guarda',content:'NPC da casa'})).toBe(true);
 });
});
