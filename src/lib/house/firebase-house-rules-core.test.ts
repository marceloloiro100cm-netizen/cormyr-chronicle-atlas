import {describe,it,expect} from 'vitest';
import {mergeHouseRuleCatalog} from './firebase-house-rules-core';
import {CORE_CATALOG} from './catalog';
import type {CatalogItem} from './types';
describe('catálogo de regras por Casa',()=>{
 it('preserva catálogo original sem adaptações',()=>{
  expect(mergeHouseRuleCatalog([],[])).toEqual(CORE_CATALOG);
 });
 it('sobrepõe item sem alterar a fonte importada',()=>{
  const base=CORE_CATALOG[0]!;
  const archived={...base,name:'Regra importada'};
  const current={...base,name:'Regra da Casa',custom:true};
  const result=mergeHouseRuleCatalog([archived],[{definition:current,version:3}]);
  expect(result.find(x=>x.id===base.id)?.name).toBe('Regra da Casa');
  expect((result.find(x=>x.id===base.id) as CatalogItem&
    {operationalRuleVersion:number}).operationalRuleVersion).toBe(3);
  expect(base.name).not.toBe('Regra da Casa');
  expect(archived.name).toBe('Regra importada');
 });
});
