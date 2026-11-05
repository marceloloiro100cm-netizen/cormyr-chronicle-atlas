import {describe,expect,it} from 'vitest';
import {spyDossierActionOptions} from '@/lib/espionage/spy-dossier-action-options';
import type {SpyDossier} from '@/lib/espionage/spy-dossier.functions';

const findings:SpyDossier['findings']=[
 {id:'7ad5197c-79a1-4d7b-8dc4-a8531c54d8e1',objective:'house_resources',
  key:'defense',snapshot:{value:20},discoveredDate:'1522-01-01',verifiedDate:'1522-01-01'},
 {id:'e8f718e2-4bde-4d2b-9b6f-1b81b112e525',objective:'house_resources',
  key:'law',snapshot:{value:30},discoveredDate:'1522-01-01',verifiedDate:'1522-01-01'},
 {id:'38532af6-f93c-49b2-a4c0-12d21e5c1a3d',objective:'army',
  key:'retired-unit',snapshot:{name:'Guarda antiga'},discoveredDate:'1522-01-01',
  verifiedDate:'1522-01-01'},
];
const official=[
 {objective:'house_resources' as const,key:'defense',name:'Defesa'},
 {objective:'house_resources' as const,key:'law',name:'Lei'},
 {objective:'house_resources' as const,key:'wealth',name:'Riqueza'},
 {objective:'house_resources' as const,key:'wealth',name:'Riqueza'},
 {objective:'army' as const,key:'new-unit',name:'Nova unidade'},
];

describe('Dossiês · lotes 13–15 · ações administrativas seguras',()=>{
 it('oferece somente itens ainda desconhecidos para descoberta',()=>{
  const values=spyDossierActionOptions(official,findings,'house_resources','reveal');
  expect(values.map(x=>x.key)).toEqual(['wealth']);
 });
 it('revalida somente informações conhecidas que ainda existem na fonte oficial',()=>{
  const values=spyDossierActionOptions(official,findings,'house_resources','revalidate');
  expect(values.map(x=>x.key)).toEqual(['defense','law']);
  expect(spyDossierActionOptions(official,findings,'army','revalidate')).toEqual([]);
 });
 it('permite revogar um segredo mesmo após a fonte desaparecer',()=>{
  const values=spyDossierActionOptions([],findings,'army','revoke');
  expect(values).toEqual([{objective:'army',key:'retired-unit',name:'Guarda antiga'}]);
 });
 it('não reutiliza o catálogo de outras modalidades nem duplica opções',()=>{
  expect(spyDossierActionOptions(official,findings,'possessions','reveal')).toEqual([]);
  expect(spyDossierActionOptions(official,findings,'possessions','revoke')).toEqual([]);
 });
});
