import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {campaignMediaParts} from '@/lib/campaign-content';

const publicFile=(name:string)=>readFileSync(resolve(process.cwd(),'public/cormyr',name),'utf8');
describe('Public Cormyr frontend implementation package',()=>{
 it('all public runtime scripts are valid JavaScript',()=>{
  for(const file of ['app.js','extras.js','search.js','youtube-media.js','soundtrack.js','music-player.js','reading-mode.js','notebook-link.js']){
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
  expect(html).toMatch(/<button\s+id="global-search-open"[^>]*\bhidden(?:\s|>)/);
  expect(html).toMatch(/<button\s+id="parchment-toggle"[^>]*\bhidden(?:\s|>)/);

  expect(html).toContain('soundtrack.js');
  expect(html).toContain('music-player.js');
  expect(html).toContain('bard-player');
  expect(html).toContain('house-history-back');
  expect(html).toContain('https://www.youtube.com/playlist?list=PLNkPwXjMDaCw');
  expect(html).toContain('https://notebook.google.com/notebook/378d59d2-9775-42b5-8c35-26da188e7305');
  expect(html).toContain('copy-notebook-link');
  // Main-menu navigation must forget the previous noble house, without breaking explicit house deep links.
  const script=publicFile('app.js');
  expect(script).toContain("if(b.dataset.view==='nobreza'){");
  expect(script).toMatch(/state\.noble\.house='';\s*state\.houseHistory=\[\];\s*renderNobility\(\);/);
  expect(script).toContain("params.get('house')||''");
 });
});
describe('Link safety and music playback fallback',()=>{
 it('uses only YouTube in the public music interface with explicit error handling',()=>{
  const player=publicFile('music-player.js');
  expect(player).toContain('button[data-bard-preview]');
  expect(player).toContain('onError');
  expect(player).toContain('onAutoplayBlocked');
  expect(player).toContain('strict-origin-when-cross-origin');
  expect(player).toContain('video.watchUrl');
  for(const file of ['youtube-media.js','soundtrack.js','extras.js','music-player.js']){
   expect(publicFile(file)).not.toMatch(/drive\.google\.com|driveUrl|driveId|driveTitle|Google Drive/);
  }
  const html=publicFile('index.html');
  expect(html).toContain('youtube-media.js');
  expect(html).toContain('id="bard-status"');
  const music=html.slice(html.indexOf('<section id="view-musicas"'),html.indexOf('</main>'));
  expect(music).not.toContain('Google Drive');
  expect(publicFile('extras.js')).toContain('data-bard-preview');
 });
 it('preserves external Gemini Notebook link and displays a permissions explanation',()=>{
  const html=publicFile('index.html');
  expect(html).toContain('o acesso requer login');
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


describe('YouTube catalogue and pending recordings',()=>{
 const data=()=>{
  const raw=publicFile('data.js').replace(/^window\.CORMYR_DATA\s*=\s*/,'').replace(/;\s*$/,'');
  const archive=JSON.parse(raw);
  const context:{CORMYR_DATA:typeof archive;CORMYR_YOUTUBE?:unknown}={CORMYR_DATA:archive};
  new Function('window',publicFile('youtube-media.js'))(context);
  new Function('window',publicFile('soundtrack.js'))(context);
  return archive;
 };
 it('normalizes all 19 region, house and royal video URLs to a direct YouTube link',()=>{
  const archive=data();
  const tracks=[...archive.kingdomMusic];
  for(const region of archive.regions){
   tracks.push(...(region.music||[]));
   for(const house of region.houses)tracks.push(...(house.music||[]));
  }
  expect(tracks).toHaveLength(19);
  expect(archive.regions).toHaveLength(11);
  expect(archive.regions.every((r:{music:unknown[]})=>r.music.length===1)).toBe(true);
  const byName=Object.fromEntries(archive.regions.map((r:{name:string;music:{videoId:string}[]})=>[r.name,r]));
  expect((byName['Crownlands'] as {music:{videoId:string}[]}).music[0]?.videoId).toBe('7B-Mb9vnmZk');
  for(const track of tracks){
   expect(track.url).toMatch(/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/);
   expect(track.videoId).toMatch(/^[A-Za-z0-9_-]{11}$/);
  }
 });
 it('keeps the explicitly supplied Fewmerry video, without a playlist dependency',()=>{
  const archive=data();
  const fewmerry=archive.regions.flatMap((r:{houses:{name:string;music:{url:string}[]}[]})=>r.houses).find((h:{name:string})=>h.name==='Fewmerry');
  expect(fewmerry?.music[0].url).toBe('https://www.youtube.com/watch?v=kfq0BeCse98');
 });
 it('preserves the remaining unmapped titles without inventing playable sources',()=>{
  const archive=data();
  const pending=archive.soundtrack.filter((t:{linkStatus?:string})=>t.linkStatus==='youtube-pending');
  expect(pending.map((t:{title:string})=>t.title)).toEqual([
   'O Nó de Sangue — A Balada da Escota Vermelha',
   'A Força Vem do Povo',
   'A Milonga das Vozes que Ficam',
   'Música dos Dragões Azuis'
  ]);
  expect(pending.every((t:{url:string})=>!t.url)).toBe(true);
  const truta=archive.soundtrack.filter((t:{title:string})=>t.title==='O Truta');
  expect(truta).toHaveLength(1);
  expect(truta[0]).toMatchObject({region:'Cormyr',category:'populares',videoId:'a5DitnxYUZM',url:'https://www.youtube.com/watch?v=a5DitnxYUZM'});
  const sossal=archive.soundtrack.filter((t:{title:string})=>t.title==='Vou-me Embora pra Sossal');
  expect(sossal).toHaveLength(1);
  expect(sossal[0]).toMatchObject({
   region:'Stonelands',category:'populares',
   videoId:'b34LSA3yDak',url:'https://www.youtube.com/watch?v=b34LSA3yDak'
  });
  expect(archive.soundtrack.find((t:{title:string})=>t.title==='Essa Coroa'))
   .toMatchObject({category:'populares',videoId:'HM4a9vYrdDU'});
  expect(archive.regions.find((r:{name:string})=>r.name==='Crownlands').music[0].videoId)
   .toBe('7B-Mb9vnmZk');
  expect(publicFile('extras.js')).toContain('youtube-pending');
  expect(publicFile('extras.js')).toContain('Músicas Populares');
  expect(publicFile('extras.js')).not.toContain("cancioneiro:'Cancioneiro'");
 });
});
