import {test} from 'node:test';
import assert from 'node:assert/strict';
import {gatherCharacterCandidates,extractHeaderCandidate} from './generate-character-candidates.mjs';
test('extracts evidence from a bounded archive heading without guessing a reference year',()=>{
 const row=extractHeaderCandidate('Evenhand\nNome: Percival Evenhand\nIdade: 30 anos (Nascimento 1492 CV)\nFundação: 1375 CV');
 assert.equal(row.proposed_name,'Percival Evenhand');
 assert.equal(row.claimed_birth_year,1492);assert.equal(row.claimed_age,30);
 const missing=extractHeaderCandidate('Fundação: 1375 CV\nA casa tem 400 anos de história.');
 assert.equal(missing.proposed_name,'');
 assert.equal(missing.claimed_birth_year,null);
});
test('builds reproducible Atlas candidates, never canonical people or auto-links',()=>{
 const a=gatherCharacterCandidates(),b=gatherCharacterCandidates();
 assert.deepEqual(a,b);
 assert.ok(a.length>120,'expected real archive entries');
 assert.equal(new Set(a.map(x=>x.source_kind+':'+x.source_key)).size,a.length);
 const even=a.find(x=>x.source_kind==='archive_history'&&x.source_key==='evenhand');
 assert.equal(even?.proposed_name,'Percival Evenhand');
 assert.equal(even?.claimed_birth_year,1492);
 assert.equal(even?.claimed_age_year,null);
 const stone=a.find(x=>x.source_kind==='archive_history'&&x.source_key==='stonecastle');
 assert.equal(stone?.proposed_name,'Planchar Stonecastle');
 assert.equal(stone?.claimed_birth_year,1447);
 for(const row of a){
  assert.equal(row.house_id,null);
  assert.equal(row.evidence?.source?.startsWith('public/cormyr/'),true);
  assert.equal(Object.hasOwn(row,'character_id'),false);
  assert.equal(Object.hasOwn(row,'baseline_year'),false);
 }
});
