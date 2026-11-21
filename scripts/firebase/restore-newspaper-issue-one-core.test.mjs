import test from 'node:test';
import assert from 'node:assert/strict';
import {selectOriginalIssueOnePath,ORIGINAL_BASENAME,STORAGE_PREFIX} from './restore-newspaper-issue-one-core.mjs';
const valid={editionNo:1,state:'published',publishedAt:'2026-11-14T00:00:00Z',
 blocks:[{type:'article',text:'a'},{type:'image',imagePath:ORIGINAL_BASENAME}]};
test('path comes only from the exact published edition',()=>{
 assert.equal(selectOriginalIssueOnePath([valid]),STORAGE_PREFIX+ORIGINAL_BASENAME);
 for(const bad of [
  {...valid,state:'draft'},
  {...valid,blocks:[{type:'image',imagePath:'../'+ORIGINAL_BASENAME}]},
  {...valid,blocks:[{type:'image',imagePath:'another.png'}]},
  {...valid,blocks:[...valid.blocks,{type:'image',imagePath:ORIGINAL_BASENAME}]},
 ])assert.throws(()=>selectOriginalIssueOnePath([bad]));
 assert.throws(()=>selectOriginalIssueOnePath([valid,valid]));
});
