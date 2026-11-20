import {describe,it,expect} from 'vitest';
import {queryRows} from './query';
describe('workspace header projection',()=>{
 const rows=[{id:'b',subject:'Later',content:'large private body',rank:2},
  {id:'a',subject:'Earlier',content:'another body',rank:1}];
 it('filters and sorts before selecting headers, without changing the source',()=>{
  const result=queryRows(rows,[{op:'select',args:['id,subject']},
   {op:'order',args:['rank']},{op:'range',args:[0,0]}]);
  expect(result.data).toEqual([{id:'a',subject:'Earlier'}]);
  expect(JSON.stringify(result)).not.toContain('body');
  expect(rows[0]?.content).toBe('large private body');
 });
 it('preserves full records, single rows, null columns and count-only reads',()=>{
  expect(queryRows(rows,[{op:'select',args:['*']}]).data).toEqual(rows);
  expect(queryRows(rows,[{op:'eq',args:['id','a']},{op:'select',args:['id,deleted_at']},
   {op:'single',args:[]}]).data).toEqual({id:'a',deleted_at:null});
  expect(queryRows(rows,[{op:'select',args:['id',{head:true,count:'exact'}]}])).toEqual({data:null,error:null,count:2});
 });
});
