import {describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {campaignMediaParts} from '@/lib/campaign-content';

const publicFile=(name:string)=>readFileSync(resolve(process.cwd(),'public/cormyr',name),'utf8');
describe('Public Cormyr frontend implementation package',()=>{
 it('all public runtime scripts are valid JavaScript',()=>{
  for(const file of ['app.js','extras.js','search.js','soundtrack.js','music-player.js','reading-mode.js','notebook-link.js']){
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
 it('opens the Google Drive file in the native viewer instead of a fragile embedded preview',()=>{
  const player=publicFile('music-player.js');
  expect(player).not.toContain("'/preview'");
  expect(player).toContain("if(host==='drive.google.com')return null;");
  expect(player).toContain("button[data-bard-preview]");
  expect(player).not.toContain("a.music-button[href]');\n  if(!link)");
  expect(publicFile('extras.js')).toContain('data-bard-preview');
 });
 it('preserves external Gemini Notebook link and displays a permissions explanation',()=>{
  const html=publicFile('index.html');
  expect(html).toContain('o acesso requer login')
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


describe('YouTube playlist per-track links',()=>{
 const data=()=>{
  const raw=publicFile('data.js').replace(/^window\.CORMYR_DATA\s*=\s*/,'').replace(/;\s*$/,'');
  const archive=JSON.parse(raw);
  const context:{CORMYR_DATA:typeof archive}={CORMYR_DATA:archive};
  new Function('window',publicFile('soundtrack.js'))(context);
  return archive;
 };
 it('maps each available regional and house recording to its catalogued YouTube video',()=>{
  const archive=data();
  const recordings=archive.soundtrack.filter((t:{driveId?:string})=>t.driveId);
  expect(recordings).toHaveLength(20);
  expect(recordings.filter((t:{youtubeUrl?:string})=>Boolean(t.youtubeUrl))).toHaveLength(14);
  for(const t of recordings){
   expect(new URL(t.driveUrl).hostname).toBe('drive.google.com');
   expect(new URL(t.driveUrl).pathname.startsWith('/file/d/')).toBe(true);
   if(t.youtubeUrl){
    const u=new URL(t.youtubeUrl);
    expect(u.searchParams.get('list')).toBe('PLNkPwXjMDaCw');
    expect(u.searchParams.get('v')).toMatch(/^[A-Za-z0-9_-]{11}$/);
    expect(t.url).toBe(t.youtubeUrl);
   }else{
    expect(t.url).toBe(t.driveUrl);
    expect(t.linkStatus).toBe('drive-only');
   }
  }
 });
 it('uses the explicitly supplied Fewmerry video instead of a generic playlist destination',()=>{
  const archive=data();
  const fewmerry=archive.soundtrack.find((t:{region:string})=>t.region==='Fewmerry');
  expect(fewmerry.url).toBe('https://www.youtube.com/watch?v=kfq0BeCse98&list=PLNkPwXjMDaCw');
  const known=archive.soundtrack.filter((t:{youtubeUrl?:string})=>t.youtubeUrl).map((t:{youtubeUrl:string})=>t.youtubeUrl);
  expect(new Set(known).size).toBe(14);
 });
 it('keeps the six uncatalogued recordings on their original Drive URLs, never assigning another track by guesswork',()=>{
  const archive=data();
  const unresolved=archive.soundtrack.filter((t:{driveId?:string;youtubeUrl?:string})=>t.driveId&&!t.youtubeUrl)
   .map((t:{title:string})=>t.title);
  expect(unresolved).toEqual([
   'O Nó de Sangue — A Balada da Escota Vermelha',
   'A Força Vem do Povo',
   'A Milonga das Vozes que Ficam',
   'Essa Coroa',
   'Vou-me Embora pra Sossal',
   'Música dos Dragões Azuis'
  ]);
  const extras=publicFile('extras.js');
  expect(extras).toContain('s.driveUrl&&s.driveUrl!==s.url');
  expect(extras).toContain('existingUrls.has(t.youtubeUrl)');
 });
});
