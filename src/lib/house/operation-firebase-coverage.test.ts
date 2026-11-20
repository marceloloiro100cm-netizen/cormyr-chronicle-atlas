import {describe,it,expect} from 'vitest';
import {HOUSE_ACTIONS,HOUSE_NON_ECONOMIC_ACTIONS,
 HOUSE_ECONOMIC_ACTIONS,HOUSE_MILITARY_ACTIONS,
 HOUSE_CREATION_ACTIONS,HOUSE_DICE_ACTIONS,
 HOUSE_CONTEXT_ACTIONS,HOUSE_PURCHASE_ACTIONS,
 HOUSE_LINK_ACTIONS} from './operation-core';

describe('paridade das ações da Ficha do Firebase',()=>{
 it('cobre todas as 54 transições permitidas e bloqueia avanço individual',()=>{
  const implemented=[
   'domain','domain_edit','domain_delete',
   ...HOUSE_NON_ECONOMIC_ACTIONS,...HOUSE_ECONOMIC_ACTIONS,
   ...HOUSE_MILITARY_ACTIONS,...HOUSE_CREATION_ACTIONS,
   ...HOUSE_DICE_ACTIONS,...HOUSE_CONTEXT_ACTIONS,
   ...HOUSE_PURCHASE_ACTIONS,...HOUSE_LINK_ACTIONS,
   'undo','import','crest_import',
  ];
  expect(implemented).toHaveLength(54);
  expect(new Set(implemented).size).toBe(54);
  expect(HOUSE_ACTIONS).toHaveLength(55);
  expect(new Set([...implemented,'advance'])).toEqual(new Set(HOUSE_ACTIONS));
 });
});
