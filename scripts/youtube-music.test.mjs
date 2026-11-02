import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const path=name=>new URL('../public/cormyr/'+name,import.meta.url);
const read=name=>readFileSync(path(name),'utf8');
function setup(){
 const window={};
 const ctx={window,URL,URLSearchParams};
 runInNewContext(read('youtube-media.js'),ctx);
 const raw=read('data.js');
 window.CORMYR_DATA=JSON.parse(raw.replace(/^window\.CORMYR_DATA\s*=\s*/,'').replace(/;\s*$/,''));
 runInNewContext(read('soundtrack.js'),ctx);
 return window;
}

test('URL parser accepts real YouTube video shapes and strips playlist dependencies',()=>{
 const yt=setup().CORMYR_YOUTUBE;
 const id='G0HNr8qE8bM';
 for(const url of [
  'https://www.youtube.com/watch?v='+id+'&list=PLNkPwXjMDaCw',
  'https://youtu.be/'+id+'?si=123',
  'https://m.youtube.com/watch?v='+id,
  'https://www.youtube.com/shorts/'+id,
  'https://www.youtube-nocookie.com/embed/'+id
 ]){
  assert.equal(yt.parse(url)?.watchUrl,'https://www.youtube.com/watch?v='+id,url);
 }
 for(const url of [
  'http://www.youtube.com/watch?v='+id,
  'https://www.youtube.com/playlist?list=PLNkPwXjMDaCw',
  'https://youtube.com.evil.test/watch?v='+id,
  'https://drive.google.com/file/d/test/view',
  'https://www.youtube.com/watch?v=bad',
  'javascript:alert(1)'
 ])assert.equal(yt.parse(url),null,url);
});

test('existing 15 YouTube links remain usable; six unmatched titles remain visible',()=>{
 const data=setup().CORMYR_DATA;
 const sources=[...(data.kingdomMusic||[])];
 for(const r of data.regions){
  sources.push(...(r.music||[]));
  for(const h of r.houses)sources.push(...(h.music||[]));
 }
 assert.equal(sources.length,15);
 for(const song of sources){
  assert.match(song.url,/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/);
  assert.match(song.videoId,/^[A-Za-z0-9_-]{11}$/);
 }
 assert.equal(data.soundtrack.filter(s=>s.linkStatus==='youtube-pending').length,6);
 assert.equal(data.soundtrack.filter(s=>s.lyrics).length,3);
 assert.ok(data.soundtrack.every(s=>!s.url));
});

test('the entire public music interface has no Drive playback integration',()=>{
 for(const file of ['youtube-media.js','soundtrack.js','extras.js','music-player.js']){
  const src=read(file);
  if(file==='youtube-media.js'||file==='soundtrack.js'||file==='extras.js'||file==='music-player.js')
   assert.doesNotMatch(src,/drive\.google\.com|driveUrl|driveId|driveTitle|Google Drive|no Drive/i,file);
 }
 const html=read('index.html');
 const music=html.slice(html.indexOf('<section id="view-musicas"'),html.indexOf('</main>'));
 const bard=html.slice(html.indexOf('<aside id="bard-player"'),html.indexOf('<dialog id="global-search-modal"'));
 assert.doesNotMatch(music+' '+bard,/drive\.google\.com|Google Drive|YouTube ou Drive/i);
 assert.ok(html.indexOf('youtube-media.js')<html.indexOf('soundtrack.js'));
 assert.match(bard,/id="bard-status"/);
});

test('player registers video errors and keeps a direct source option',()=>{
 const player=read('music-player.js'),app=read('app.js'),extras=read('extras.js');
 for(const code of ['100','101','150','153'])assert.match(player,new RegExp('\\b'+code+'\\b'));
 assert.match(player,/onError/);
 assert.match(player,/onAutoplayBlocked/);
 assert.match(player,/strict-origin-when-cross-origin/);
 assert.match(player,/loadApi\(\)/);
 assert.match(player,/video\.watchUrl/);
 assert.match(app,/data-bard-preview/);
 assert.match(extras,/data-bard-preview/);
});
