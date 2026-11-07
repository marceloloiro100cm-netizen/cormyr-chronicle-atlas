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
 assert.equal(sources.length,19);
 for(const song of sources){
  assert.match(song.url,/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/);
  assert.match(song.videoId,/^[A-Za-z0-9_-]{11}$/);
 }
 assert.equal(data.soundtrack.filter(s=>s.linkStatus==='youtube-pending').length,4);
 assert.equal(data.soundtrack.filter(s=>s.lyrics).length,3);
 assert.equal(data.soundtrack.filter(s=>s.url).length,10);
 const byRegion=Object.fromEntries(data.regions.map(r=>[r.name,r]));
 assert.equal(data.regions.length,11);
 assert.ok(data.regions.every(r=>r.music.length===1),'Every region must have one official theme');
 assert.equal(byRegion.Crownlands.music[0].videoId,'7B-Mb9vnmZk');
 assert.equal(byRegion.Crownlands.music[0].title,'Terras da Coroa');
 assert.notEqual(byRegion.Crownlands.music[0].videoId,'HM4a9vYrdDU');
 assert.equal(byRegion.Swordmark.music[0].videoId,'HHZjbwRCoes');
 assert.equal(byRegion.Shieldmark.music[0].videoId,'5VPgawygkEc');
 assert.equal(byRegion.Ferlin.music[0].videoId,'_uJndPcaHj0');
 assert.equal(byRegion.Volkumburgh.music[0].videoId,'bR66gczzEdk');
 assert.equal(byRegion.Crownlands.houses.find(h=>h.name==='Von der Harten').music[0].videoId,'bR66gczzEdk');
 const linked=data.soundtrack.filter(s=>s.videoId);
 const ids=Array.from(linked,s=>s.videoId).sort();
 assert.deepEqual(ids,['4RuKLjM1QcU','HM4a9vYrdDU','WrXc5zCbMHA','a5DitnxYUZM','b34LSA3yDak','f4L0mCHpOv8','qw9FgNYr7hE','wioZhfoQMAs','xoOtYuebA9k','uPYfE1gKDcg'].sort());
 assert.equal(data.soundtrack.filter(s=>s.lyrics&&!s.url).length,1);
 const sossal=data.soundtrack.filter(s=>s.title==='Vou-me Embora pra Sossal');
 assert.equal(sossal.length,1);
 assert.equal(sossal[0].category,'populares');
 assert.equal(sossal[0].region,'Stonelands');
 assert.equal(sossal[0].videoId,'b34LSA3yDak');
 assert.equal(sossal[0].url,'https://www.youtube.com/watch?v=b34LSA3yDak');
 assert.notEqual(sossal[0].linkStatus,'youtube-pending');
 const balada=data.soundtrack.find(s=>s.title==='A Balada Libertina do Guardião de Helm');
 assert.equal(balada?.category,'populares');
 assert.equal(balada?.videoId,'4RuKLjM1QcU');
 assert.equal(balada?.url,'https://www.youtube.com/watch?v=4RuKLjM1QcU');
 assert.ok(balada?.lyrics.includes('Na noite fria e escura'));
 const nova=data.soundtrack.find(s=>s.id==='youtube-wioZhfoQMAs');
 assert.equal(nova?.title,'Vai, Meu Grifo, Vai!');
 assert.equal(nova?.category,'populares');
 assert.equal(nova?.videoId,'wioZhfoQMAs');
 assert.equal(nova?.url,'https://www.youtube.com/watch?v=wioZhfoQMAs');
 assert.equal(data.soundtrack.filter(s=>s.videoId==='wioZhfoQMAs').length,1);
 const newTrack=data.soundtrack.find(s=>s.id==='youtube-WrXc5zCbMHA');
 assert.equal(newTrack?.category,'populares');
 assert.equal(newTrack?.title,'O Brinde das Cinco Cores');
 assert.equal(newTrack?.videoId,'WrXc5zCbMHA');
 assert.equal(newTrack?.url,'https://www.youtube.com/watch?v=WrXc5zCbMHA');
 assert.equal(data.soundtrack.filter(s=>s.videoId==='WrXc5zCbMHA').length,1);
 const newest=data.soundtrack.find(s=>s.id==='youtube-qw9FgNYr7hE');
 assert.equal(newest?.title,'Worist da Companhia Consorte');
 assert.equal(newest?.category,'populares');
 assert.equal(newest?.region,'Cormyr');
 assert.equal(newest?.videoId,'qw9FgNYr7hE');
 assert.equal(newest?.url,'https://www.youtube.com/watch?v=qw9FgNYr7hE');
 assert.equal(data.soundtrack.filter(s=>s.videoId==='qw9FgNYr7hE').length,1);
 const truta=data.soundtrack.find(s=>s.id==='o-truta');
 assert.equal(truta?.title,'O Truta');
 assert.equal(truta?.category,'populares');
 assert.equal(truta?.region,'Cormyr');
 assert.equal(truta?.videoId,'a5DitnxYUZM');
 assert.equal(truta?.url,'https://www.youtube.com/watch?v=a5DitnxYUZM');
 assert.equal(data.soundtrack.filter(s=>s.videoId==='a5DitnxYUZM').length,1);
 const added=data.soundtrack.find(s=>s.id==='youtube-uPYfE1gKDcg');
 assert.equal(added?.title,'Papai Foi Rei');
 assert.equal(added?.category,'populares');
 assert.equal(added?.videoId,'uPYfE1gKDcg');
 assert.equal(added?.url,'https://www.youtube.com/watch?v=uPYfE1gKDcg');
 assert.equal(data.soundtrack.filter(s=>s.videoId==='uPYfE1gKDcg').length,1);
 assert.equal(data.soundtrack.find(s=>s.title==='Cante uma Canção a Elturel').category,'populares');
 assert.equal(data.soundtrack.find(s=>s.title==='Essa Coroa').category,'populares');
 const popular=data.soundtrack.filter(s=>s.category==='populares');
 assert.equal(popular.length,12);
 assert.equal(popular.filter(s=>s.videoId).length,10);
 assert.equal(popular.filter(s=>s.linkStatus==='youtube-pending').length,1);
 assert.ok(popular.every(s=>s.region));
 assert.equal(new Set(popular.map(s=>s.id)).size,popular.length);
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


test('Músicas Populares reúne canções de bardo em um único filtro, sem duplicações',()=>{
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
 assert.match(nodes['music-count'].textContent,/29 vídeos vinculados/);
 assert.equal(nodes['music-all'].notice,undefined,'No region is missing a theme');
 assert.match(nodes['music-kinds'].innerHTML,/Músicas Populares/);
 assert.doesNotMatch(nodes['music-kinds'].innerHTML,/Cancioneiro|Novidades da playlist/);
 assert.match(nodes['music-all'].innerHTML,/wioZhfoQMAs/);
 assert.match(nodes['music-all'].innerHTML,/WrXc5zCbMHA/);
 assert.match(nodes['music-all'].innerHTML,/qw9FgNYr7hE/);
 assert.match(nodes['music-all'].innerHTML,/uPYfE1gKDcg/);
 nodes['music-kinds'].click({target:{closest:()=>({dataset:{musicKind:'populares'}})}});
 assert.doesNotMatch(nodes['music-count'].textContent,/título sem vídeo|letra sem vídeo/);
 assert.match(nodes['music-count'].textContent,/10 vídeos vinculados em 1 grupo/);
 assert.match(nodes['music-all'].innerHTML,/wioZhfoQMAs/);
 assert.match(nodes['music-all'].innerHTML,/WrXc5zCbMHA/);
 assert.match(nodes['music-all'].innerHTML,/qw9FgNYr7hE/);
 assert.match(nodes['music-all'].innerHTML,/b34LSA3yDak/);
 assert.match(nodes['music-all'].innerHTML,/uPYfE1gKDcg/);
 for(const label of ['Vai, Meu Grifo, Vai!','O Brinde das Cinco Cores','Worist da Companhia Consorte','Papai Foi Rei'])
  assert.ok(nodes['music-all'].innerHTML.includes(label),label);
 assert.doesNotMatch(nodes['music-all'].innerHTML,/>Nova música de Cormyr(?:\s|<)/);
 assert.doesNotMatch(nodes['music-all'].innerHTML,/Badalos Elementais|Música dos Dragões Azuis/);
 assert.doesNotMatch(nodes['music-all'].innerHTML,/music-unavailable|youtube-pending/);
 assert.equal((nodes['music-all'].innerHTML.match(/class="music-catalogue-track"/g)||[]).length,10);
 assert.equal((nodes['music-all'].innerHTML.match(/class="quiet bard-preview-button"/g)||[]).length,10);
 assert.equal((nodes['music-all'].innerHTML.match(/<section class="music-links panel">/g)||[]).length,1);
 assert.doesNotMatch(nodes['music-all'].innerHTML,/Novidades da playlist|Cancioneiro/);
 assert.match(nodes['music-all'].innerHTML,/A Balada Libertina do Guardião de Helm/);
 assert.doesNotMatch(nodes['music-all'].innerHTML,/Ver letra|music-lyrics-entry|<details/i);
 assert.match(nodes['music-all'].innerHTML,/www.youtube.com\/watch\?v=4RuKLjM1QcU/);

 assert.match(nodes['music-all'].innerHTML,/Vou-me Embora pra Sossal/);
 assert.match(nodes['music-all'].innerHTML,/b34LSA3yDak/);
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
 assert.equal(tracks.length,29);
 assert.equal(new Set(tracks.map(s=>s.videoId)).size,28);
 assert.ok(tracks.every(s=>data.musicPlaylist&&/^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/.test(s.url)));
});

test('music markup and CSS use one aligned track with both playback controls',()=>{
 const app=read('app.js'),extras=read('extras.js'),css=read('style.css');
 assert.match(app,/class="music-catalogue-track"/);
 assert.match(extras,/class="music-catalogue-track"/);
 assert.match(css,/\.music-links \.music-catalogue-track\s*\{/);
 assert.match(css,/\.music-links \.bard-preview-button\s*\{/);
 assert.match(css,/grid-template-columns:minmax\(0,1fr\)/);
});
