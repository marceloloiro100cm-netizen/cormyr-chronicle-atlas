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

test('regional and house links use the videos supplied by the Narrator',()=>{
 const data=setup().CORMYR_DATA;
 const sources=[...(data.kingdomMusic||[])];
 for(const r of data.regions){
  sources.push(...(r.music||[]));
  for(const h of r.houses)sources.push(...(h.music||[]));
 }
 assert.equal(sources.length,18);
 for(const song of sources){
  assert.match(song.url,/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/);
  assert.match(song.videoId,/^[A-Za-z0-9_-]{11}$/);
 }
 assert.equal(data.soundtrack.filter(s=>s.linkStatus==='youtube-pending').length,5);
 assert.equal(data.soundtrack.filter(s=>s.lyrics).length,3);
 assert.equal(data.soundtrack.filter(s=>s.url).length,3);
 const byRegion=Object.fromEntries(data.regions.map(r=>[r.name,r]));
 assert.equal(byRegion.Swordmark.music[0].videoId,'HHZjbwRCoes');
 assert.equal(byRegion.Shieldmark.music[0].videoId,'5VPgawygkEc');
 assert.equal(byRegion.Ferlin.music[0].videoId,'_uJndPcaHj0');
 assert.equal(byRegion.Volkumburgh.music[0].videoId,'bR66gczzEdk');
 assert.equal(byRegion.Crownlands.houses.find(h=>h.name==='Von der Harten').music[0].videoId,'bR66gczzEdk');
 const linked=data.soundtrack.filter(s=>s.videoId);
 const ids=linked.map(s=>s.videoId).sort();
 assert.deepEqual(ids,['HM4a9vYrdDU','f4L0mCHpOv8','xoOtYuebA9k'].sort());
 assert.equal(data.soundtrack.filter(s=>s.lyrics&&!s.url).length,2);
 assert.equal(data.soundtrack.find(s=>s.title==='Cante uma Canção a Elturel').category,'cancioneiro');
 assert.equal(data.soundtrack.find(s=>s.title==='Essa Coroa').category,'cancioneiro');
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

test('a YouTube playback error is shown and the direct video link remains available',async()=>{
 const base=setup();
 let click,closed=false,handlers;
 const elements={
  'bard-player':{hidden:true},
  'bard-player-media':{children:[],replaceChildren(...nodes){this.children=nodes;}},
  'bard-title':{textContent:''},
  'bard-open-source':{hidden:true,href:'',removeAttribute(){this.href='';}},
  'bard-close':{addEventListener(type,fn){if(type==='click')this.close=fn;}},
  'bard-lyrics':{hidden:true,textContent:''},
  'bard-status':{textContent:''}
 };
 const window={
  CORMYR_YOUTUBE:base.CORMYR_YOUTUBE,
  location:{origin:'https://cormyr.example.test'},
  addEventListener(){},
  YT:{Player:class{
   constructor(frame,config){handlers=config.events;this.frame=frame;}
   destroy(){closed=true;}
  }}
 };
 const document={
  getElementById:id=>elements[id],
  addEventListener(type,fn){if(type==='click')click=fn;},
  createElement:tag=>({tagName:tag}),
  head:{append(){}}
 };
 runInNewContext(read('music-player.js'),{window,document,URLSearchParams});
 const button={
  dataset:{bardPreview:'https://www.youtube.com/watch?v=G0HNr8qE8bM&list=PLNkPwXjMDaCw',bardTitle:'O Trono do Dragão'},
  closest(){return null;}
 };
 await click({target:{closest:()=>button},preventDefault(){}});
 assert.equal(elements['bard-player'].hidden,false);
 assert.equal(elements['bard-open-source'].href,'https://www.youtube.com/watch?v=G0HNr8qE8bM');
 assert.equal(elements['bard-player-media'].children.length,1);
 assert.equal(elements['bard-player-media'].children[0].referrerPolicy,'strict-origin-when-cross-origin');
 handlers.onError({data:153});
 assert.match(elements['bard-status'].textContent,/origem|YouTube/i);
 elements['bard-close'].close();
 assert.equal(elements['bard-player'].hidden,true);
 assert.equal(elements['bard-player-media'].children.length,0);
 assert.equal(closed,true);
});


test('Cancioneiro is a selectable group and missing regional themes are reported without invented videos',()=>{
 const window=setup();window.addEventListener=()=>{};
 const nodes={};
 function control(id){
  return nodes[id]={id,innerHTML:'',value:'',textContent:'',hidden:true,attributes:{},
   addEventListener(type,fn){this[type]=fn;},
   querySelectorAll(){return[];},
   replaceChildren(...children){this.children=children;},
   setAttribute(k,v){this.attributes[k]=v;},
   prepend(node){this.notice=node.textContent;}};
 }
 for(const id of ['music-all','music-kinds','music-item','music-count','music-reset','music-playlist-preview','music-playlist-embed','bard-close'])control(id);
 const document={
  getElementById:id=>nodes[id]||{hidden:true},
  createElement:tag=>({tag,textContent:'',className:''}),
  querySelector:()=>({click(){}})
 };
 runInNewContext(read('extras.js'),{window,document,URL,location:{hash:''},
  localStorage:{getItem:()=>null},setTimeout:()=>{}});
 assert.match(nodes['music-count'].textContent,/21 vídeos vinculados/);
 assert.match(nodes['music-all'].notice,/Crownlands/);
 assert.match(nodes['music-kinds'].innerHTML,/Cancioneiro/);
 nodes['music-kinds'].click({target:{closest:()=>({dataset:{musicKind:'cancioneiro'}})}});
 assert.match(nodes['music-count'].textContent,/2 títulos sem vídeo vinculado/);
 assert.match(nodes['music-count'].textContent,/2 letras sem vídeo/);
 assert.match(nodes['music-all'].innerHTML,/Cante uma Canção a Elturel/);
 assert.doesNotMatch(nodes['music-all'].innerHTML,/Casa Ashkar/);
 assert.match(window.CORMYR_DATA.soundtrack.find(s=>s.title==='Cante uma Canção a Elturel').lyrics,/\n/);
});

test('official playlist iframe is created only after a click and removed when closed',()=>{
 const window=setup();window.addEventListener=()=>{};
 const nodes={};
 const button={hidden:false,attributes:{},addEventListener(type,fn){this[type]=fn;},
  setAttribute(k,v){this.attributes[k]=v;},textContent:''};
 const host={hidden:true,children:[],replaceChildren(...children){this.children=children;}};
 nodes['music-playlist-preview']=button;nodes['music-playlist-embed']=host;
 nodes['bard-close']={click(){}};
 const document={
  getElementById:id=>nodes[id]||null,
  createElement:tag=>({tag}),
  querySelector:()=>null
 };
 runInNewContext(read('extras.js'),{window,document,URL,location:{hash:''},
  localStorage:{getItem:()=>null},setTimeout:()=>{}});
 assert.equal(host.children.length,0);
 button.click();
 assert.equal(host.hidden,false);
 assert.match(host.children[0].src,/youtube-nocookie\.com\/embed\/videoseries\?list=PLNkPwXjMDaCw/);
 assert.equal(button.attributes['aria-expanded'],'true');
 window.CORMYR_CLOSE_PLAYLIST();
 assert.equal(host.hidden,true);
 assert.equal(host.children.length,0);
});

test('all supplied URLs are valid, and the shared Von der Harten track is not duplicated by ID',()=>{
 const data=setup().CORMYR_DATA;
 const tracks=[...data.kingdomMusic,...data.regions.flatMap(r=>(r.music||[]).concat(
  r.houses.flatMap(h=>h.music||[]))),
  ...data.soundtrack.filter(s=>s.videoId)];
 assert.equal(tracks.length,21);
 assert.equal(new Set(tracks.map(s=>s.videoId)).size,20);
 assert.ok(tracks.every(s=>data.musicPlaylist&&/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/.test(s.url)));
});
