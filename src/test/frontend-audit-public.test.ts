import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {campaignMediaParts} from '@/lib/campaign-content';

const publicFile=(name:string)=>readFileSync(resolve(process.cwd(),'public/cormyr',name),'utf8');
describe('Public Cormyr frontend implementation package',()=>{
 it('all public runtime scripts are valid JavaScript',()=>{
  for(const file of ['app.js','extras.js','search.js','soundtrack.js','music-player.js','reading-mode.js']){
   expect(()=>new Function(publicFile(file)),file).not.toThrow();
  }
 });
 it('retains 11 regions, 172 houses, 164 Lex Castle entries and no narrator data in the public archive',()=>{
  const raw=publicFile('data.js').replace(/^window\.CORMYR_DATA\s*=\s*/,'').replace(/;\s*$/,'');
  const data=JSON.parse(raw) as {regions:{houses:unknown[]}[];constitution:{entries:unknown[]};events:unknown[];adventures:unknown[]};
  expect(data.regions).toHaveLength(11);
  expect(data.regions.reduce((n,r)=>n+r.houses.length,0)).toBe(172);
  expect(data.constitution.entries).toHaveLength(164);
  expect(data.events).toHaveLength(0);
  expect(data.adventures).toHaveLength(0);
 });
 it('maps content by public route, not private files',()=>{
  const html=publicFile('index.html');
  expect(html).toContain('global-search-modal');
  expect(html).toContain('soundtrack.js');
  expect(html).toContain('music-player.js');
  expect(html).toContain('bard-player');
  expect(html).toContain('house-history-back');
 });
});
describe('Safe narrator media token parsing',()=>{
 it('accepts YouTube and Drive identifiers but not raw iframe markup',()=>{
  const parts=campaignMediaParts('A [cormyr-youtube:Uq95aO3-P-E|Tema de Cormyr] B [cormyr-drive:1F62FBJ4H9ZoqRJr-MbcYTUJK_9o6IcTh|O Trono] C');
  expect(parts).toMatchObject([
   {text:'A '},{kind:'youtube',id:'Uq95aO3-P-E',title:'Tema de Cormyr'},
   {text:' B '},{kind:'drive',title:'O Trono'},{text:' C'},
  ]);
  const unsafe='[cormyr-youtube:https://evil.example/<script>|Ataque]';
  expect(campaignMediaParts(unsafe)).toEqual([{text:unsafe}]);
 });
 it('returns existing image/text parsing unchanged without a new media marker',()=>{
  expect(campaignMediaParts('Texto normal sem mídia.')).toEqual([{text:'Texto normal sem mídia.'}]);
 });
});
