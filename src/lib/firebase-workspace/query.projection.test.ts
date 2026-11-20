import {describe,it,expect} from 'vitest';
import {queryRows} from './query';

const source=[
 {id:'a',subject:'Primeira',content:'texto confidencial A',delivery_week:1},
 {id:'b',subject:'Segunda',content:'texto confidencial B',delivery_week:2},
];
describe('Firebase query projection',()=>{
 it('sends only selected columns, while keeping the same row count',()=>{
  const result=queryRows(source,[
   {op:'select',args:['id,subject',{count:'exact'}]},
   {op:'order',args:['id',{ascending:false}]},
   {op:'limit',args:[1]},
  ]);
  expect(result).toEqual({data:[{id:'b',subject:'Segunda'}],error:null,count:2});
  expect(JSON.stringify(result)).not.toContain('texto confidencial');
  expect(source[0]?.content).toBe('texto confidencial A');
 });
 it('preserves star, head, single, and the legacy relation query contract',()=>{
  expect(queryRows(source,[{op:'select',args:['*']}]).data).toEqual(source);
  expect(queryRows(source,[{op:'select',args:['id',{head:true,count:'exact'}]}]))
   .toMatchObject({data:null,count:2});
  expect(queryRows(source,[{op:'select',args:['id']},
   {op:'eq',args:['id','a']},{op:'single',args:[]}]).data).toEqual({id:'a'});
  // A complex selector still returns the complete already-authorized row:
  // callers depending on previously ignored relation syntax must not break.
  expect(queryRows(source,[{op:'select',args:['id,children(*)']}]).data).toEqual(source);
 });
 it('does not project a field absent from a row, and keeps count before paging',()=>{
  expect(queryRows(source,[{op:'select',args:['id,missing',{count:'exact'}]},
   {op:'range',args:[1,1]}])).toEqual({data:[{id:'b'}],error:null,count:2});
 });
});
