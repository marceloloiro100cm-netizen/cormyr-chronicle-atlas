import {describe,expect,it} from 'vitest';
import source from '@/data/battle/noble-house-scenario-20261104.json';
import {findSheetScenarioHouse,sheetScenarioAssets,sheetScenarioHouseCount,
 sheetScenarioRoster,sheetScenarioUnmappedUnits} from '@/lib/battle/adapters/sheet-house-scenario';
import {modelWarUnit} from '@/lib/battle/got/models';

describe('Importação auditável da planilha de Casas Nobres — cenário separado da campanha',()=>{
 it('preserva todas as 170 Casas, 1.776 posses e 483 registros militares',()=>{
  expect(sheetScenarioHouseCount()).toBe(170);
  expect(source.houses.reduce((n,h)=>n+h.assets.length,0)).toBe(1776);
  expect(source.houses.reduce((n,h)=>n+h.assets.filter(a=>a.category==='Unidade militar').length,0)).toBe(483);
  expect(source.houses.filter(h=>h.assets.length>0)).toHaveLength(162);
 });
 it('não promove compras propostas a fichas oficiais',()=>{
  const monthor=findSheetScenarioHouse('monthor');
  expect(monthor).toBeDefined();
  expect(monthor!.region).toMatch(/Crownland/i);
  const assets=sheetScenarioAssets(monthor!);
  expect(assets).toHaveLength(9);
  expect(assets.every(a=>a.status==='Compra proposta')).toBe(true);
  const fort=assets.find(a=>a.catalogId==='small-castle');
  expect(fort?.fortDefense).toBe(6);
  expect(fort?.status).toBe('Compra proposta');
 });
 it('usa quantidades e o efetivo de cada tipo, sem nivelar Casas',()=>{
  const monthor=findSheetScenarioHouse('Monthor')!;
  const roster=sheetScenarioRoster(monthor,'house-monthor');
  expect(roster).toHaveLength(2);
  expect(roster.map(x=>x.unit_type).sort()).toEqual(['personal-guard','scouts']);
  expect(roster.map(x=>x.quantity*x.standard_unit_strength)).toEqual([100,100]);
  const everet=findSheetScenarioHouse('Everet')!;
  expect(everet.assets.filter(x=>x.category==='Unidade militar')).toHaveLength(8);
  // Um ID autoral sem classe/treinamento explícitos só pode receber classe
  // a partir da ficha operacional ou do catálogo NPC validado.
  expect(sheetScenarioUnmappedUnits(everet)).toHaveLength(8);
 });
 it('cria estatísticas apenas de modelo para NPC e respeita o treinamento',()=>{
  const a=modelWarUnit({id:'a',name:'A',side:'attacker',position:{x:1,y:2},
   typeId:'infantry',training:'trained'});
  const b=modelWarUnit({id:'b',name:'B',side:'defender',position:{x:10,y:2},
   typeId:'infantry',training:'veteran'});
  expect(a.source.kind).toBe('model');
  expect(b.source.kind).toBe('model');
  expect(b.discipline).toBeLessThan(a.discipline);
 });
 it('expõe bônus do catálogo com situação documental, sem aplicá-los como posse ativa',()=>{
  const houses=source.houses;
  const annotated=houses.flatMap(h=>sheetScenarioAssets(h))
   .filter(a=>a.militaryEffect);
  expect(annotated.length).toBeGreaterThan(0);
  expect(annotated.every(a=>a.status.length>0)).toBe(true);
  expect(annotated.some(a=>a.militaryEffect?.includes('Defesa'))).toBe(true);
 });
});
